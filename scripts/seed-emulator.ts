// Fills the local emulators with a demo business so the screens have something to show.
// Run with the emulators up:  npx tsx scripts/seed-emulator.ts
// Then sign in at http://localhost:3000 with the demo account below.
// It only ever connects to the local emulators (project demo-ledgertrail).
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

export const DEMO_EMAIL = "demo@ledgertrail.test";
export const DEMO_PASSWORD = "demo-password";

const app = initializeApp({ apiKey: "demo-key", projectId: "demo-ledgertrail", appId: "demo" });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const fns = getFunctions(app);
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function main() {
  const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
    .catch(() => signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD));
  let businessId = "";
  for (let i = 0; i < 40 && !businessId; i++) {
    const { claims } = await cred.user.getIdTokenResult(true);
    if (typeof claims.businessId === "string") businessId = claims.businessId;
    else await new Promise((r) => setTimeout(r, 500));
  }
  if (!businessId) throw new Error("No businessId claim. Are the functions emulators running?");
  const base = `businesses/${businessId}`;
  await updateDoc(doc(db, base), { name: "Faiz Traders", phone: "0300 1112233" });

  const vendor = async (name: string, phone: string) =>
    (await addDoc(collection(db, base, "vendors"), { name, phone, notes: "", createdAt: serverTimestamp() })).id;
  const cement = await vendor("Lucky Cement Depot", "0301 2345678");
  const steel = await vendor("Amreli Steel Agency", "0321 9876543");
  const bricks = await vendor("Punjab Bricks", "");

  const save = httpsCallable<Record<string, unknown>, { id: string }>(fns, "saveOrder");
  const order = async (vendorId: string, days: number, items: [string, number, number][], extra: Record<string, unknown> = {}) =>
    (await save({
      vendorId, orderDate: daysAgo(days), expectedDate: null, status: "ordered",
      invoiceAmount: null, invoiceNo: null, invoiceDate: null, note: "",
      items: items.map(([name, qty, rate]) => ({ name, qty, rate })), ...extra,
    })).data.id;

  const o1 = await order(cement, 45, [["Cement", 200, 1400]], { status: "received", invoiceAmount: 280_000, invoiceNo: "LC-881", invoiceDate: daysAgo(44) });
  await order(cement, 12, [["Cement", 100, 1450], ["White cement", 10, 2200]], { status: "confirmed", expectedDate: daysAgo(3) });
  await order(steel, 20, [["Steel bars 12mm", 2, 265_000], ["Steel bars 10mm", 1.5, 268_000], ["Binding wire", 25, 420]],
    { status: "received", invoiceAmount: 944_500, invoiceNo: "AS-2231", invoiceDate: daysAgo(18) });
  await order(bricks, 2, [["Bricks A-class", 5000, 18]], { expectedDate: daysAgo(-3), note: "Deliver to site 2" });

  const pay = (vendorId: string, vendorName: string, amount: number, days: number, method: Record<string, unknown>, orderId: string | null = null) =>
    addDoc(collection(db, base, "payments"), {
      orderId, vendorId, vendorName, amount, date: daysAgo(days),
      bankAccount: null, bankRef: null, chequeNo: null, chequeBank: null, chequeDate: null,
      clearedStatus: null, clearedDate: null, cashTo: null, createdAt: serverTimestamp(), ...method,
    });
  await pay(cement, "Lucky Cement Depot", 200_000, 40, { method: "bank", bankRef: "TX-5521", bankAccount: "HBL current" }, o1);
  await pay(steel, "Amreli Steel Agency", 500_000, 15, { method: "cheque", chequeNo: "004512", chequeBank: "MCB", chequeDate: daysAgo(15), clearedStatus: "issued" });
  await pay(steel, "Amreli Steel Agency", 150_000, 5, { method: "cash", cashTo: "Rashid (driver)" });

  console.log("Seeded demo business. Sign in with", DEMO_EMAIL);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
