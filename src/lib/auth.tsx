"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "./firebase";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  // Signed in, but provisionBusiness hasn't stamped the businessId claim yet.
  | { status: "provisioning"; user: User }
  | { status: "ready"; user: User; businessId: string }
  | { status: "error"; user: User; message: string };

const AuthContext = createContext<AuthState>({ status: "loading" });

const CLAIM_POLL_MS = 500;
const CLAIM_TIMEOUT_MS = 30_000;

async function claimOf(user: User, forceRefresh: boolean): Promise<string | null> {
  const { claims } = await user.getIdTokenResult(forceRefresh);
  return typeof claims.businessId === "string" && claims.businessId ? claims.businessId : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let run = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const mine = ++run;
      const current = () => mine === run;
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }
      try {
        let businessId = await claimOf(user, false);
        if (!businessId) {
          if (current()) setState({ status: "provisioning", user });
          // A brand-new signup: the claim lands a few seconds later, so keep
          // forcing a token refresh until it shows up.
          const deadline = Date.now() + CLAIM_TIMEOUT_MS;
          while (!businessId && current() && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, CLAIM_POLL_MS));
            if (current()) businessId = await claimOf(user, true);
          }
        }
        if (!current()) return;
        setState(
          businessId
            ? { status: "ready", user, businessId }
            : { status: "error", user, message: "Your business account is still being set up. Refresh in a minute." },
        );
      } catch (err) {
        if (current()) setState({ status: "error", user, message: (err as Error).message });
      }
    });
    return () => {
      run++;
      unsub();
    };
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** For pages that only render once signed in and provisioned. */
export function useBusiness(): { user: User; businessId: string } {
  const s = useAuth();
  if (s.status !== "ready") throw new Error("useBusiness() used outside a ready session");
  return { user: s.user, businessId: s.businessId };
}

export const signOut = () => fbSignOut(auth);
