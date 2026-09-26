// End-to-end against the Auth + Firestore + Functions emulators, using real
// signups: provisioning trigger -> businessId claim -> tenant isolation with
// real tokens -> vendor self-serve link resolution.
// Run with: npm run test:e2e
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type User,
} from "firebase/auth";
import {
  addDoc, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore,
  serverTimestamp, terminate, updateDoc, type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { afterAll, describe, expect, it } from "vitest";

const PROJECT = "demo-ledgertrail";
const apps: FirebaseApp[] = [];

function client(name: string) {
  const app = initializeApp({ apiKey: "demo-key", projectId: PROJECT, appId: "demo" }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  return { auth, db, fns };
}

async function waitForClaim(user: User): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await user.getIdTokenResult(true);
    if (typeof res.claims.businessId === "string") return res.claims.businessId;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("businessId claim never appeared");
}

async function signUp(name: string) {
  const c = client(name);
  const email = `${name}-${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(c.auth, email, "password123");
  const businessId = await waitForClaim(cred.user);
  return { ...c, user: cred.user, businessId };
}

async function denied(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: "permission-denied" });
}

afterAll(async () => {
  for (const app of apps) {
    await terminate(getFirestore(app)).catch(() => {});
    await deleteApp(app);
  }
});

describe("signup, provisioning and isolation", () => {
  let a: Awaited<ReturnType<typeof signUp>>;
  let b: Awaited<ReturnType<typeof signUp>>;
  let vendorId: string;

  it("provisions a business per signup with the uid as businessId", async () => {
    a = await signUp("owner-a");
    b = await signUp("owner-b");
    expect(a.businessId).toBe(a.user.uid);
    expect(b.businessId).toBe(b.user.uid);

    const biz = await getDoc(doc(a.db, `businesses/${a.businessId}`));
    expect(biz.data()).toMatchObject({ ownerUid: a.user.uid, subscriptionStatus: "trial" });
    await updateDoc(doc(a.db, `businesses/${a.businessId}`), { name: "A Traders", phone: "0300" });
  });

  it("owner A can write and read their own vendors and orders", async () => {
    const v = await addDoc(collection(a.db, `businesses/${a.businessId}/vendors`), {
      name: "Karachi Cotton", phone: "0300 1234567", notes: "internal note", createdAt: serverTimestamp(),
    });
    vendorId = v.id;
    await addDoc(collection(a.db, `businesses/${a.businessId}/orders`), {
      vendorId, vendorName: "Karachi Cotton", description: "Cotton", qty: 200, rate: 12.5,
      amount: 2500, orderDate: "2026-09-01", status: "ordered", invoiceAmount: null,
      invoiceDate: null, createdAt: serverTimestamp(),
    });
    const orders = await getDocs(collection(a.db, `businesses/${a.businessId}/orders`));
    expect(orders.size).toBe(1);
  });

  it("owner B, with a real token, cannot read or write owner A's data", async () => {
    await denied(getDoc(doc(b.db, `businesses/${a.businessId}`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/vendors`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/orders`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/payments`)));
    await denied(addDoc(collection(b.db, `businesses/${a.businessId}/vendors`), {
      name: "x", phone: "", notes: "", createdAt: serverTimestamp(),
    }));
    // B's own tenant is empty.
    const own = await getDocs(collection(b.db, `businesses/${b.businessId}/vendors`));
    expect(own.size).toBe(0);
  });

  it("vendor links: only the owning tenant can create one; anyone with the token can read that vendor only", async () => {
    await expect(
      httpsCallable(b.fns, "createVendorLink")({ vendorId }),
    ).rejects.toMatchObject({ code: "functions/not-found" });

    const { data } = await httpsCallable<{ vendorId: string }, { token: string }>(a.fns, "createVendorLink")({ vendorId });
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const again = await httpsCallable<{ vendorId: string }, { token: string }>(a.fns, "createVendorLink")({ vendorId });
    expect(again.data.token).toBe(data.token);

    const anon = client("anon");
    const res = await httpsCallable<{ token: string }, Record<string, unknown>>(anon.fns, "resolveVendorLink")({ token: data.token });
    expect(res.data).toMatchObject({ businessName: "A Traders", vendorName: "Karachi Cotton" });
    expect((res.data.orders as unknown[]).length).toBe(1);
    expect(JSON.stringify(res.data)).not.toContain("internal note");

    await expect(
      httpsCallable(anon.fns, "resolveVendorLink")({ token: "x".repeat(32) }),
    ).rejects.toMatchObject({ code: "functions/not-found" });

    await httpsCallable(a.fns, "revokeVendorLink")({ vendorId });
    await expect(
      httpsCallable(anon.fns, "resolveVendorLink")({ token: data.token }),
    ).rejects.toMatchObject({ code: "functions/not-found" });
  });
});

export type { Firestore, Functions };
