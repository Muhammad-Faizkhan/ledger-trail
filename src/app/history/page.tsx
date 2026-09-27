"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { methodLabel } from "@/lib/derive";
import { db } from "@/lib/firebase";
import { money } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { Gate, type Session } from "../_components/Gate";
import { Card } from "../_components/ui";

const SHOWN = 200;

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  invoiceAmount: "Invoice amount",
  invoiceDate: "Invoice date",
  phone: "Phone",
  notes: "Notes",
  clearedStatus: "Cheque",
  clearedDate: "Cleared on",
};

const MONEY_FIELDS = new Set(["invoiceAmount"]);

export default function HistoryPage() {
  return <Gate>{(s) => <History session={s} />}</Gate>;
}

function History({ session }: { session: Session }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => onSnapshot(
    query(collection(db, "businesses", session.businessId, "auditLog"), orderBy("editedAt", "desc"), limit(SHOWN)),
    (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as AuditEntry)),
    (e) => setError(e.message),
  ), [session.businessId]);

  const { vendors, orders, payments } = session.ledger;
  function subject(e: AuditEntry): string {
    if (e.field === "deleted") return String(e.oldValue);
    if (e.entity === "vendor") return vendors.find((v) => v.id === e.entityId)?.name ?? "Vendor";
    if (e.entity === "order") {
      const o = orders.find((x) => x.id === e.entityId);
      return o ? `${o.vendorName}: ${o.description}` : "Order (since deleted)";
    }
    const p = payments.find((x) => x.id === e.entityId);
    return p ? `${p.vendorName}: ${methodLabel(p)}, ${money(p.amount)}` : "Payment (since deleted)";
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <Link href="/" className="text-sm text-accent">← Dashboard</Link>
      <header>
        <h1 className="text-2xl font-semibold">Edit history</h1>
        <p className="text-sm text-muted">Every change and deletion, newest first. Entries can&apos;t be edited or removed.</p>
      </header>
      <Card>
        {error ? <p className="text-danger">{error}</p>
          : entries == null ? <p className="text-muted">Loading…</p>
          : entries.length === 0 ? <p className="text-sm text-muted">No edits yet. Changes you make to orders, payments and vendors will be listed here.</p>
          : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{subject(e)}</span>
                    <span className="shrink-0 text-xs text-muted">{when(e)}</span>
                  </div>
                  <p className="mt-0.5 text-muted">
                    {e.field === "deleted" ? (
                      <span className="text-danger">Deleted {e.entity}</span>
                    ) : (
                      <>{FIELD_LABELS[e.field] ?? e.field}: {show(e.field, e.oldValue)} → <span className="text-foreground">{show(e.field, e.newValue)}</span></>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

function show(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (MONEY_FIELDS.has(field) && typeof v === "number") return money(v);
  return String(v);
}

function when(e: AuditEntry): string {
  const d = e.editedAt?.toDate();
  return d ? d.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "";
}
