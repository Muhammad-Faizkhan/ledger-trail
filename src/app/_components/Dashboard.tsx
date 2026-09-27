"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signOut } from "@/lib/auth";
import { audit, methodLabel, recentActivity, totalOutstanding, vendorTotals, type AuditReport } from "@/lib/derive";
import { db } from "@/lib/firebase";
import { APP_NAME, money, today } from "@/lib/format";
import type { Ledger } from "./useLedger";
import { updateBusiness } from "./writes";
import { Button, Card, ErrorText, Field } from "./ui";

export function Dashboard({ businessId, ledger }: { businessId: string; ledger: Ledger }) {
  const { business, vendors, orders, payments } = ledger;
  const totals = vendorTotals(orders, payments);
  const report = audit(orders, payments, today());
  const warnings = report.mismatches.length + report.overdue.length + report.staleCheques.length
    + report.orphanPayments.length;
  const activity = recentActivity(orders, payments);
  const [editing, setEditing] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">{APP_NAME}</p>
          <h1 className="text-xl font-semibold">{business?.name}</h1>
          {!editing && (
            <button type="button" className="text-sm text-muted hover:text-accent" onClick={() => setEditing(true)}>
              {business?.phone ? `${business.phone} · ` : ""}Edit details
            </button>
          )}
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/history" className="px-3 py-2 text-sm text-muted hover:text-foreground">History</Link>
          <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
        </nav>
      </header>

      {editing && business && (
        <EditBusiness businessId={businessId} name={business.name} phone={business.phone}
          onDone={() => setEditing(false)} />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="You owe vendors" value={money(totalOutstanding(orders, payments))} />
        <Stat label="Vendors" value={String(vendors.length)} />
        <Stat label="Needs attention" value={String(warnings)} tone={warnings ? "danger" : undefined} />
      </div>

      {warnings > 0 && <Attention report={report} />}

      <Card>
        <h2 className="font-semibold">Vendors</h2>
        {vendors.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No vendors yet. Add the first one below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {vendors.map((v) => {
              const t = totals.get(v.id);
              return (
                <li key={v.id}>
                  <Link href={`/vendors/${v.id}`}
                    className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 hover:bg-background">
                    <div>
                      <p className="font-medium">{v.name}</p>
                      {v.phone && <p className="text-sm text-muted">{v.phone}</p>}
                    </div>
                    <p className={`text-sm font-medium ${t && t.outstanding > 0 ? "" : "text-muted"}`}>
                      {money(t?.outstanding ?? 0)} <span className="text-muted">›</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <AddVendor businessId={businessId} />
      </Card>

      <Card>
        <h2 className="font-semibold">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Orders and payments you record will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {activity.map((a) => (
              <li key={`${a.kind}-${a.id}`} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="text-muted">{a.date} · {a.vendorName} · </span>
                  {a.label}
                </span>
                <span className={a.kind === "payment" ? "text-accent" : ""}>
                  {a.kind === "payment" ? "−" : ""}{money(a.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Attention({ report }: { report: AuditReport }) {
  const items: { key: string; vendorId: string; text: string }[] = [
    ...report.overdue.map(({ order, balance, days }) => ({
      key: `o-${order.id}`, vendorId: order.vendorId,
      text: `${order.vendorName}: ${money(balance)} unpaid on "${order.description}" for ${days} days`,
    })),
    ...report.mismatches.map((o) => ({
      key: `m-${o.id}`, vendorId: o.vendorId,
      text: `${o.vendorName}: invoice ${money(o.invoiceAmount ?? 0)} doesn't match order ${money(o.amount)} ("${o.description}")`,
    })),
    ...report.staleCheques.map(({ payment, days }) => ({
      key: `c-${payment.id}`, vendorId: payment.vendorId,
      text: `${payment.vendorName}: ${methodLabel(payment)} for ${money(payment.amount)} not cleared after ${days} days`,
    })),
    ...report.orphanPayments.map((p) => ({
      key: `x-${p.id}`, vendorId: p.vendorId,
      text: `${p.vendorName}: payment of ${money(p.amount)} on ${p.date} belongs to an order that no longer exists`,
    })),
  ];
  return (
    <Card>
      <h2 className="font-semibold text-danger">Needs attention</h2>
      <ul className="mt-2 divide-y divide-border">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={`/vendors/${i.vendorId}`} className="block py-2 text-sm hover:text-accent">{i.text}</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EditBusiness({ businessId, name: initialName, phone: initialPhone, onDone }: {
  businessId: string; name: string; phone: string; onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateBusiness(businessId, { name: name.trim(), phone: phone.trim() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Business name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Phone" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="text-xs text-muted">
          The new name is used on future messages and statements. Existing orders keep showing correctly.
        </p>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </Card>
  );
}

function AddVendor({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await addDoc(collection(db, "businesses", businessId, "vendors"), {
        name: name.trim(), phone: phone.trim(), notes: "", createdAt: serverTimestamp(),
      });
      setName("");
      setPhone("");
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button className="mt-3" onClick={() => setOpen(true)}>+ Add vendor</Button>;
  }
  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
      <Field label="Vendor name" required maxLength={120} autoFocus value={name}
        onChange={(e) => setName(e.target.value)} />
      <Field label="Phone / WhatsApp" type="tel" maxLength={30} value={phone}
        onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save vendor"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
