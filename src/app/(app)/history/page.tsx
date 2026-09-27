"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { methodLabel } from "@/lib/derive";
import { db } from "@/lib/firebase";
import { money, poNumber } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { useSession } from "../../_components/Gate";
import { Card, Chips, PageHeader } from "../../_components/ui";

const SHOWN = 200;

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  items: "Items",
  amount: "Total",
  orderDate: "Order date",
  expectedDate: "Deliver by",
  note: "Note",
  invoiceAmount: "Bill amount",
  invoiceNo: "Bill no.",
  invoiceDate: "Bill date",
  phone: "Phone",
  notes: "Notes",
  clearedStatus: "Cheque",
  clearedDate: "Cleared on",
  orderId: "Paid for",
};

const MONEY_FIELDS = new Set(["invoiceAmount", "amount"]);

type Filter = "all" | AuditEntry["entity"];

export default function HistoryPage() {
  const { businessId, ledger } = useSession();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => onSnapshot(
    query(collection(db, "businesses", businessId, "auditLog"), orderBy("editedAt", "desc"), limit(SHOWN)),
    (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as AuditEntry)),
    (e) => setError(e.message),
  ), [businessId]);

  const { vendors, orders, payments } = ledger;
  function subject(e: AuditEntry): string {
    if (e.field === "deleted") return String(e.oldValue);
    if (e.entity === "vendor") return vendors.find((v) => v.id === e.entityId)?.name ?? "Vendor";
    if (e.entity === "order") {
      const o = orders.find((x) => x.id === e.entityId);
      return o ? `${o.vendorName}: ${poNumber(o.number)}` : "Order (since deleted)";
    }
    const p = payments.find((x) => x.id === e.entityId);
    return p ? `${p.vendorName}: ${methodLabel(p)}, ${money(p.amount)}` : "Payment (since deleted)";
  }

  const shown = entries?.filter((e) => filter === "all" || e.entity === filter);

  return (
    <>
      <PageHeader title="Edit history" back={{ href: "/settings", label: "Settings" }}
        subtitle="Every change and deletion, newest first. Entries can't be edited or removed." />
      <Chips label="Show" value={filter} onChange={setFilter}
        options={[["all", "All"], ["order", "Orders"], ["payment", "Payments"], ["vendor", "Vendors"]]} />
      <Card>
        {error ? <p className="text-danger">{error}</p>
          : shown == null ? <p className="text-muted">Loading…</p>
          : shown.length === 0 ? <p className="text-sm text-muted">No changes yet. Edits to orders, payments and vendors will be listed here.</p>
          : (
            <ul className="divide-y divide-border">
              {shown.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{subject(e)}</span>
                    <span className="shrink-0 text-xs text-muted">{when(e)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-muted">
                    {e.field === "deleted" ? (
                      <span className="text-danger">Deleted {e.entity}</span>
                    ) : e.field === "orderId" ? (
                      <>Moved from {show(e.field, e.oldValue)} to the vendor&apos;s account (order deleted)</>
                    ) : (
                      <>{FIELD_LABELS[e.field] ?? e.field}: {show(e.field, e.oldValue)} → <span className="text-foreground">{show(e.field, e.newValue)}</span></>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
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
