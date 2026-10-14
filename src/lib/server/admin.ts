// Server-only Firebase Admin client, used by the API routes in src/app/api.
// Never import from a Client Component.
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Started on first use rather than at import, so `next build` doesn't need the key.
function app() {
  if (getApps().length) return getApp();

  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    // Same emulators the browser uses (see src/lib/firebase.ts).
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }

  // The whole service-account JSON from Firebase Console → Project settings →
  // Service accounts → Generate new private key, pasted as one value.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set.");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
