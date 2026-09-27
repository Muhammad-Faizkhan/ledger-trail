"use client";

import Link from "next/link";
import { useState } from "react";
import { methodLabel, type Allocation } from "@/lib/derive";
import { money, poNumber, today } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { useSession } from "./Gate";
import { Badge, Button, ConfirmDelete, ErrorText, LinkButton, Money, useAction } from "./ui";
import { clearCheque, deletePayment } from "./writes";

/** One payment; tap to see which orders it paid, and to delete it. */
export function PaymentRow({ payment: p, alloc, hideVendor }: { payment: Payment; alloc: Allocation; hideVendor?: boolean }) {
  const { businessId, uid, ledger } = useSession();
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction();
  const applied = alloc.applied.filter((a) => a.paymentId === p.id);
  const orderById = new Map(ledger.orders.map((o) => [o.id, o]));
  const advance = Math.round((p.amount - applied.reduce((s, a) => s + a.amount, 0)) * 100) / 100;

  return (
    <li id={p.id} className="scroll-mt-20 rounded-2xl border border-border bg-surface target:border-accent">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          {!hideVendor && <span className="block font-semibold">{p.vendorName}</span>}
          <span className="block text-sm">{methodLabel(p)}</span>
          <span className="block text-sm text-muted">{p.date}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Money value={p.amount} className="font-semibold" />
          {p.method === "cheque" && (p.clearedStatus === "cleared"
            ? <Badge tone="success">Cleared</Badge>
            : <Badge tone="warning">Not cleared</Badge>)}
        </span>
      </button>

      {p.method === "cheque" && p.clearedStatus !== "cleared" && (
        <div className="-mt-2 px-4 pb-3">
          <Button variant="secondary" disabled={busy}
            onClick={() => run(() => clearCheque(businessId, uid, p, today()))}>
            ✓ Mark cleared
          </Button>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-4 text-sm">
          {p.method === "bank" && p.bankAccount && <p><span className="text-muted">From account:</span> {p.bankAccount}</p>}
          {p.method === "cheque" && p.chequeDate && <p><span className="text-muted">Cheque date:</span> {p.chequeDate}</p>}
          {p.clearedDate && <p><span className="text-muted">Cleared on:</span> {p.clearedDate}</p>}
          <p className="text-muted">{p.orderId && orderById.has(p.orderId) ? "Paid for one order:" : "Paid oldest bills first:"}</p>
          <ul className="flex flex-col gap-1">
            {applied.map((a) => {
              const o = orderById.get(a.orderId);
              return o && (
                <li key={a.orderId} className="flex justify-between gap-3">
                  <Link href={`/orders/${o.id}`} className="font-medium text-accent">{poNumber(o.number)} <span className="text-muted">({o.orderDate})</span></Link>
                  <Money value={a.amount} />
                </li>
              );
            })}
            {advance > 0 && <li className="flex justify-between gap-3"><span>Advance with vendor</span><span className="tabular-nums">{money(advance)}</span></li>}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {!hideVendor && <LinkButton href={`/vendors/${p.vendorId}`} variant="secondary">Open vendor</LinkButton>}
            <ConfirmDelete label="Delete payment" question="Delete this payment?" disabled={busy}
              onConfirm={() => run(() => deletePayment(businessId, uid, p))} />
          </div>
        </div>
      )}
      <div className="px-4"><ErrorText>{error}</ErrorText></div>
    </li>
  );
}
