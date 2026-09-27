"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { allocatePayments, methodLabel, orderMessage } from "@/lib/derive";
import {
  amountsDiffer, isIsoDate, money, num, parseNonNegativeNumber, poNumber, today, whatsAppUrl,
} from "@/lib/format";
import { ORDER_STATUSES, type Order, type OrderStatus } from "@/lib/types";
import { useSession } from "@/app/_components/Gate";
import { justSaved } from "@/app/_components/OrderForm";
import {
  Badge, Button, Card, ConfirmDelete, EmptyState, ErrorText, Field, LinkButton, Money, NumberField, PageHeader,
  STATUS_LABEL, StatusBadge, useAction,
} from "@/app/_components/ui";
import { deleteOrder, updateOrder } from "@/app/_components/writes";

export function OrderPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { ledger } = useSession();
  const order = ledger.orders.find((o) => o.id === orderId);
  const [fresh] = useState(() => {
    const was = justSaved.id === orderId;
    if (was) justSaved.id = "";
    return was;
  });
  const del = useAction();

  if (!order) {
    return <EmptyState title="This order doesn't exist" text="It may have been deleted."
      action={<LinkButton href="/orders">See all orders</LinkButton>} />;
  }

  const vendor = ledger.vendors.find((v) => v.id === order.vendorId);
  const alloc = allocatePayments(ledger.orders, ledger.payments);
  const { paid, balance } = alloc.byOrder.get(order.id) ?? { paid: 0, balance: order.amount };
  const applied = alloc.applied.filter((a) => a.orderId === order.id);
  const paymentById = new Map(ledger.payments.map((p) => [p.id, p]));
  const waUrl = vendor ? whatsAppUrl(vendor.phone, orderMessage(order, ledger.business?.name ?? "")) : null;
  const po = poNumber(order.number);

  return (
    <>
      <PageHeader
        back={{ href: "/orders", label: "Orders" }}
        title={<span className="flex flex-wrap items-center gap-2">{po} <StatusBadge status={order.status} /></span>}
        subtitle={<><Link href={`/vendors/${order.vendorId}`} className="font-medium text-accent">{order.vendorName}</Link> · {order.orderDate}</>}
        action={<LinkButton href={`/orders/${order.id}/edit`} variant="secondary">Edit</LinkButton>}
      />

      {fresh && (
        <div className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-success">Order {po} saved.</p>
          {waUrl && <LinkButton href={waUrl} external>Send to {order.vendorName} on WhatsApp</LinkButton>}
        </div>
      )}

      <StatusSteps order={order} />

      <Card>
        <h2 className="font-semibold">Items</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell">Rate</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <span className="font-medium">{it.name}</span>
                  <span className="block text-xs text-muted sm:hidden">@ {money(it.rate)}</span>
                </td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">{num(it.qty)}</td>
                <td className="hidden whitespace-nowrap py-2 text-right tabular-nums sm:table-cell">{money(it.rate)}</td>
                <td className="whitespace-nowrap py-2 pl-2 text-right font-medium tabular-nums">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td className="pt-2 font-semibold" colSpan={2}>Total</td>
              <td className="hidden sm:table-cell" />
              <td className="pt-2 text-right text-base font-bold tabular-nums">{money(order.amount)}</td>
            </tr>
          </tfoot>
        </table>
        {(order.expectedDate || order.note) && (
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
            {order.expectedDate && <p><span className="text-muted">Deliver by:</span> {order.expectedDate}</p>}
            {order.note && <p className="whitespace-pre-wrap"><span className="text-muted">Note:</span> {order.note}</p>}
          </div>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-xs text-muted">Total</p><Money value={order.amount} className="font-semibold" /></div>
          <div><p className="text-xs text-muted">Paid</p><Money value={paid} className="font-semibold text-success" /></div>
          <div>
            <p className="text-xs text-muted">To pay</p>
            <Money value={balance} className={`font-bold ${balance > 0 ? "text-danger" : ""}`} />
          </div>
        </div>
        {balance > 0 && (
          <LinkButton href={`/payments/new?vendor=${order.vendorId}&order=${order.id}`} className="mt-3 w-full">
            Record payment
          </LinkButton>
        )}
        {applied.length > 0 && (
          <ul className="mt-3 divide-y divide-border border-t border-border text-sm">
            {applied.map((a) => {
              const p = paymentById.get(a.paymentId);
              if (!p) return null;
              return (
                <li key={a.paymentId} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="text-muted">{p.date} · </span>{methodLabel(p)}
                    {a.amount < p.amount && <span className="text-muted"> (part of {money(p.amount)})</span>}
                  </span>
                  <Money value={a.amount} className="font-medium" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Bill order={order} />

      <div className="no-print flex flex-wrap items-center gap-2">
        {waUrl ? (
          <LinkButton href={waUrl} external variant="secondary">Send on WhatsApp</LinkButton>
        ) : (
          <p className="text-sm text-muted">Add the vendor&apos;s phone number to send orders on WhatsApp.</p>
        )}
        <LinkButton href={`/orders/${order.id}/print`} variant="secondary">Print / PDF</LinkButton>
        <span className="ml-auto">
          <ConfirmDelete label="Delete order" disabled={del.busy}
            question={applied.length ? `Delete ${po}? Its payments stay on ${order.vendorName}'s account.` : `Delete ${po}?`}
            onConfirm={async () => {
              if (await del.run(() => deleteOrder(order.id))) router.push("/orders");
            }} />
        </span>
      </div>
      <ErrorText>{del.error}</ErrorText>
    </>
  );
}

function StatusSteps({ order }: { order: Order }) {
  const { busy, error, run } = useAction();
  const current = ORDER_STATUSES.indexOf(order.status);
  const set = (status: OrderStatus) => status !== order.status && run(() => updateOrder(order, { status }));

  return (
    <div className="no-print">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Order status">
        {ORDER_STATUSES.map((s, i) => {
          const done = i <= current;
          return (
            <button key={s} type="button" role="radio" aria-checked={s === order.status} disabled={busy}
              onClick={() => set(s)}
              className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition disabled:opacity-60 ${
                done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted hover:border-accent"
              }`}>
              {done && <span aria-hidden>✓</span>}{STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Bill({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const { busy, error, setError, run } = useAction();
  const mismatch = order.invoiceAmount != null && amountsDiffer(order.invoiceAmount, order.amount);

  function start() {
    setNo(order.invoiceNo ?? "");
    setAmount(String(order.invoiceAmount ?? order.amount));
    setDate(order.invoiceDate ?? today());
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseNonNegativeNumber(amount);
    if (a == null) return setError("Enter the bill amount.");
    if (!isIsoDate(date)) return setError("Enter the bill date.");
    const ok = await run(() => updateOrder(order, { invoiceAmount: a, invoiceNo: no.trim() || null, invoiceDate: date }));
    if (ok) setOpen(false);
  }

  if (open) {
    return (
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h2 className="font-semibold">Vendor&apos;s bill</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Bill no. (optional)" maxLength={60} value={no} onChange={(e) => setNo(e.target.value)} autoFocus />
            <NumberField label="Amount (Rs)" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Field label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save bill"}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Vendor&apos;s bill</h2>
          {order.invoiceAmount != null ? (
            <p className="text-sm">
              {order.invoiceNo && <span className="text-muted">#{order.invoiceNo} · </span>}
              <Money value={order.invoiceAmount} className="font-medium" />
              {order.invoiceDate && <span className="text-muted"> · {order.invoiceDate}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted">Not added yet. Add it when the vendor sends their bill.</p>
          )}
        </div>
        <Button variant="secondary" onClick={start}>{order.invoiceAmount != null ? "Change" : "Add bill"}</Button>
      </div>
      {mismatch && (
        <p className="mt-2"><Badge tone="danger">
          Bill is {money(Math.abs(order.invoiceAmount! - order.amount))} {order.invoiceAmount! > order.amount ? "more" : "less"} than the order
        </Badge></p>
      )}
    </Card>
  );
}
