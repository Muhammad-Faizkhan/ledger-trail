"use client";

import type { ReactNode } from "react";
import { signOut, useAuth } from "@/lib/auth";
import { BusinessSetup } from "./BusinessSetup";
import { AuthForm } from "./AuthForm";
import { useLedger, type Ledger } from "./useLedger";
import { Button, Card, Centered } from "./ui";

export interface Session {
  uid: string;
  businessId: string;
  ledger: Ledger;
}

/** Renders `children` only once the owner is signed in, provisioned and set up. */
export function Gate({ children }: { children: (s: Session) => ReactNode }) {
  const s = useAuth();
  switch (s.status) {
    case "loading":
      return <Centered><p className="text-muted">Loading…</p></Centered>;
    case "signedOut":
      return <Centered><AuthForm /></Centered>;
    case "provisioning":
      return <Centered><p className="text-muted">Setting up your business account…</p></Centered>;
    case "error":
      return (
        <Centered>
          <Card className="max-w-sm">
            <p className="text-danger">{s.message}</p>
            <Button variant="ghost" className="mt-3 px-0" onClick={() => signOut()}>Sign out</Button>
          </Card>
        </Centered>
      );
    case "ready":
      return <Loaded uid={s.user.uid} businessId={s.businessId}>{children}</Loaded>;
  }
}

function Loaded({ uid, businessId, children }: {
  uid: string; businessId: string; children: (s: Session) => ReactNode;
}) {
  const ledger = useLedger(businessId);
  if (ledger.error) return <Centered><p className="text-danger">{ledger.error}</p></Centered>;
  if (!ledger.loaded) return <Centered><p className="text-muted">Loading your ledger…</p></Centered>;
  if (!ledger.business?.name) return <Centered><BusinessSetup businessId={businessId} /></Centered>;
  return <>{children({ uid, businessId, ledger })}</>;
}
