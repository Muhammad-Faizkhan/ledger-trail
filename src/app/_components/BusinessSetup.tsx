"use client";

import { doc, updateDoc } from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { db } from "@/lib/firebase";
import { Button, Card, ErrorText, Field } from "./ui";

export function BusinessSetup({ businessId }: { businessId: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "businesses", businessId), { name: name.trim(), phone: phone.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="text-xl font-semibold">Set up your business</h1>
      <p className="mt-1 text-sm text-muted">
        This name appears on the orders and statements you send to vendors.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <Field label="Business name" required maxLength={120} value={name}
          onChange={(e) => setName(e.target.value)} />
        <Field label="Phone (optional)" type="tel" maxLength={30} value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </Card>
  );
}
