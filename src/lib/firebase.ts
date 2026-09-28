// Browser-side Firebase client. Import only from Client Components.
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Each variable must be referenced literally so Next.js inlines it at build time.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const usingEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(
    `Firebase config missing: ${missing.join(", ")}. Copy .env.local.example to .env.local and fill it in.`,
  );
}

// Reuse the app across hot reloads; connecting an emulator twice throws.
const fresh = getApps().length === 0;
export const app = fresh ? initializeApp(config) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south1"); // must match REGION in functions/src/index.ts

if (usingEmulators && fresh) {
  // The emulators run on the dev machine. Reach them at whatever address the app
  // was opened from, so a phone on the same Wi-Fi (http://192.168.x.x:3000) works too.
  const host = typeof window === "undefined" ? "127.0.0.1" : window.location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
