"use client";

import { useState, type FormEvent } from "react";
import { signOut, useAuth } from "@/lib/auth";
import { useSession } from "@/app/_components/Gate";
import { Button, Card, ErrorText, Field, LinkButton, PageHeader, useAction } from "@/app/_components/ui";
import { updateBusiness } from "@/app/_components/writes";

export function SettingsPage() {
  const auth = useAuth();
  const { businessId, ledger } = useSession();
  const business = ledger.business!;
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.phone);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const changed = name.trim() !== business.name || phone.trim() !== business.phone;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => updateBusiness(businessId, { name: name.trim(), phone: phone.trim() }))) setSaved(true);
  }

  return (
    <>
      <PageHeader title="Settings" />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h2 className="font-semibold">Your business</h2>
          <Field label="Business name" required maxLength={120} value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            hint="Shown on the orders and statements you send to vendors." />
          <Field label="Phone" type="tel" maxLength={30} value={phone}
            onChange={(e) => { setPhone(e.target.value); setSaved(false); }} />
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !changed || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
            {saved && !changed && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Edit history</h2>
        <p className="text-sm text-muted">Every change and deletion, newest first.</p>
        <LinkButton href="/history" variant="secondary" className="self-start">Open history</LinkButton>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Account</h2>
          {auth.status === "ready" && <p className="text-sm text-muted">{auth.user.email}</p>}
        </div>
        <Button variant="secondary" onClick={() => signOut()}>Sign out</Button>
      </Card>
    </>
  );
}
