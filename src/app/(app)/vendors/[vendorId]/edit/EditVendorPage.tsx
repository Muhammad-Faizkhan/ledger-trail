"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "@/app/_components/Gate";
import {
  Button, Card, EmptyState, ErrorText, Field, LinkButton, PageHeader, TextArea, useAction,
} from "@/app/_components/ui";
import { editVendor } from "@/app/_components/writes";

export function EditVendorPage({ vendorId }: { vendorId: string }) {
  const { ledger } = useSession();
  const vendor = ledger.vendors.find((v) => v.id === vendorId);
  if (!vendor) {
    return <EmptyState title="This vendor doesn't exist" action={<LinkButton href="/vendors">See all vendors</LinkButton>} />;
  }
  // Keyed so the form starts from the saved values.
  return <Form key={vendor.id} vendorId={vendor.id} />;
}

function Form({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { businessId, uid, ledger } = useSession();
  const vendor = ledger.vendors.find((v) => v.id === vendorId)!;
  const [name, setName] = useState(vendor.name);
  const [phone, setPhone] = useState(vendor.phone);
  const [notes, setNotes] = useState(vendor.notes);
  const { busy, error, setError, run } = useAction();
  const orderCount = ledger.orders.filter((o) => o.vendorId === vendorId).length;
  const renaming = name.trim() !== vendor.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the vendor's name.");
    const clash = ledger.vendors.find((v) => v.id !== vendorId && v.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (clash) return setError(`You already have a vendor called ${clash.name}.`);
    if (await run(() => editVendor(businessId, uid, vendor, { name, phone, notes }))) {
      router.push(`/vendors/${vendorId}`);
    }
  }

  return (
    <>
      <PageHeader title="Edit vendor" back={{ href: `/vendors/${vendorId}`, label: vendor.name }} />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)}
            hint={renaming && orderCount > 0
              ? `The new name will also show on their ${orderCount} existing ${orderCount === 1 ? "order" : "orders"}.`
              : undefined} />
          <Field label="Phone / WhatsApp" type="tel" maxLength={30} value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
          <TextArea label="Notes (only you see these)" maxLength={2000} value={notes}
            placeholder="e.g. Gives 30 days credit, call Rashid for delivery"
            onChange={(e) => setNotes(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="min-w-32">{busy ? "Saving…" : "Save"}</Button>
            <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
