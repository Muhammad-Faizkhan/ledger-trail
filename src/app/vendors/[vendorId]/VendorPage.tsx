"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { methodLabel, orderBalance, orderMessage, paidByOrder, paymentsByOrder, vendorStatement } from "@/lib/derive";
import {
  amountsDiffer, isIsoDate, money, num, parseNonNegativeNumber, parsePositiveNumber, round2, today, whatsAppUrl,
} from "@/lib/format";
import { ORDER_STATUSES, type Order, type OrderStatus, type Payment, type PaymentMethod, type Vendor } from "@/lib/types";
import { Gate, type Session } from "../../_components/Gate";
import { Badge, Button, Card, ErrorText, Field, Select } from "../../_components/ui";
import {
  addOrder, addPayment, clearCheque, createVendorLink, revokeVendorLink, updateOrder, updateVendor, vendorLinkUrl,
} from "../../_components/writes";

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)] as [string, string]);

export function VendorPage({ vendorId }: { vendorId: string }) {
  return <Gate>{(s) => <VendorView session={s} vendorId={vendorId} />}</Gate>;
}

function VendorView({ session, vendorId }: { session: Session; vendorId: string }) {
  const { business, vendors, orders, payments } = session.ledger;
  const vendor = vendors.find((v) => v.id === vendorId);

  if (!vendor) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <BackLink />
        <Card className="mt-4"><p className="text-muted">This vendor doesn&apos;t exist.</p></Card>
      </div>
    );
  }

  const vOrders = orders.filter((o) => o.vendorId === vendorId)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const vPayments = payments.filter((p) => p.vendorId === vendorId);
  const paid = paidByOrder(vPayments);
  const byOrder = paymentsByOrder(vPayments);
  const ordered = round2(vOrders.reduce((s, o) => s + o.amount, 0));
  const totalPaid = round2(vPayments.reduce((s, p) => s + p.amount, 0));
  const statementUrl = whatsAppUrl(
    vendor.phone, vendorStatement(vendor, orders, payments, business?.name ?? "", today()),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <BackLink />
      <header>
        <h1 className="text-2xl font-semibold">{vendor.name}</h1>
        {vendor.phone && <p className="text-muted">{vendor.phone}</p>}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Ordered" value={money(ordered)} />
        <Stat label="Paid" value={money(totalPaid)} />
        <Stat label="Outstanding" value={money(ordered - totalPaid)} strong />
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {statementUrl ? (
            <a href={statementUrl} target="_blank" rel="noreferrer"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
              Send statement on WhatsApp
            </a>
          ) : (
            <p className="text-sm text-muted">Add a phone number to send statements on WhatsApp.</p>
          )}
        </div>
        <VendorLink vendor={vendor} />
        <VendorDetails session={session} vendor={vendor} />
      </Card>

      <NewOrder businessId={session.businessId} vendor={vendor} />

      {vOrders.length === 0 ? (
        <Card><p className="text-sm text-muted">No orders with this vendor yet.</p></Card>
      ) : (
        vOrders.map((o) => (
          <OrderCard key={o.id} session={session} vendor={vendor} order={o}
            balance={orderBalance(o, paid)} payments={byOrder.get(o.id) ?? []} />
        ))
      )}
    </div>
  );
}

function BackLink() {
  return <Link href="/" className="text-sm text-accent">← All vendors</Link>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 ${strong ? "text-lg font-semibold" : "font-medium"}`}>{value}</p>
    </Card>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function VendorLink({ vendor }: { vendor: Vendor }) {
  const { busy, error, run } = useAction();
  const [copied, setCopied] = useState(false);
  const url = vendor.linkToken ? vendorLinkUrl(vendor.linkToken) : null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-sm font-medium">Vendor&apos;s own view</p>
      <p className="text-sm text-muted">
        A private link where {vendor.name} can see their orders and payments without an account.
      </p>
      {url ? (
        <>
          <code className="break-all rounded-lg bg-background px-3 py-2 text-xs">{url}</code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}>{copied ? "Copied" : "Copy link"}</Button>
            <Button type="button" variant="ghost" disabled={busy}
              onClick={() => run(() => revokeVendorLink(vendor.id))}>
              Turn off link
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" disabled={busy} onClick={() => run(() => createVendorLink(vendor.id))}>
            {busy ? "Creating…" : "Create link"}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function VendorDetails({ session, vendor }: { session: Session; vendor: Vendor }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(vendor.phone);
  const [notes, setNotes] = useState(vendor.notes);
  const { busy, error, run } = useAction();

  if (!open) {
    return (
      <div className="border-t border-border pt-4 text-sm">
        {vendor.notes && <p className="mb-2 whitespace-pre-wrap text-muted">{vendor.notes}</p>}
        <button type="button" className="text-accent" onClick={() => {
          setPhone(vendor.phone);
          setNotes(vendor.notes);
          setOpen(true);
        }}>Edit phone and notes</button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      updateVendor(session.businessId, session.uid, vendor, { phone: phone.trim(), notes: notes.trim() }));
    if (ok) setOpen(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-4">
      <Field label="Phone / WhatsApp" type="tel" maxLength={30} value={phone}
        onChange={(e) => setPhone(e.target.value)} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Notes (only you see these)</span>
        <textarea maxLength={2000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent" />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function NewOrder({ businessId, vendor }: { businessId: string; vendor: Vendor }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [status, setStatus] = useState<OrderStatus>("ordered");
  const { busy, error, setError, run } = useAction();

  const q = parsePositiveNumber(qty);
  const r = parseNonNegativeNumber(rate);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (q == null || r == null || !isIsoDate(orderDate)) {
      setError("Enter a quantity above 0, a rate, and a date.");
      return;
    }
    const ok = await run(() =>
      addOrder(businessId, vendor, { description: description.trim(), qty: q, rate: r, orderDate, status }));
    if (ok) {
      setDescription("");
      setQty("");
      setRate("");
      setOpen(false);
    }
  }

  if (!open) {
    return <div><Button onClick={() => setOpen(true)}>+ New order</Button></div>;
  }
  return (
    <Card>
      <h2 className="font-semibold">New order</h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <Field label="Item" required maxLength={500} autoFocus value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cement bags" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} />
          <Field label="Rate (Rs)" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <p className="text-sm text-muted">Total: {q != null && r != null ? money(q * r) : "—"}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order date" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          <Select label="Status" value={status} options={STATUS_OPTIONS}
            onChange={(e) => setStatus(e.target.value as OrderStatus)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !description.trim()}>{busy ? "Saving…" : "Save order"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function OrderCard({ session, vendor, order, balance, payments }: {
  session: Session; vendor: Vendor; order: Order; balance: number; payments: Payment[];
}) {
  const { busy, error, run } = useAction();
  const messageUrl = whatsAppUrl(vendor.phone, orderMessage(order, session.ledger.business?.name ?? ""));
  const mismatch = order.invoiceAmount != null && amountsDiffer(order.invoiceAmount, order.amount);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{order.description}</p>
          <p className="text-sm text-muted">
            {order.orderDate} · {num(order.qty)} × {money(order.rate)} = {money(order.amount)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{balance > 0 ? money(balance) : "Paid"}</p>
          {balance > 0 && <p className="text-xs text-muted">to pay</p>}
          {balance < 0 && <Badge tone="danger">Overpaid {money(-balance)}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select label="Status" value={order.status} options={STATUS_OPTIONS} disabled={busy}
            onChange={(e) => run(() => updateOrder(session.businessId, session.uid, order,
              { status: e.target.value as OrderStatus }))} />
        </div>
        {messageUrl && (
          <a href={messageUrl} target="_blank" rel="noreferrer" className="pb-2 text-sm text-accent">
            Send order on WhatsApp
          </a>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      <Invoice session={session} order={order} mismatch={mismatch} />

      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium">Payments</p>
        {payments.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {payments.map((p) => <PaymentRow key={p.id} session={session} payment={p} />)}
          </ul>
        )}
        <NewPayment businessId={session.businessId} order={order} balance={balance} />
      </div>
    </Card>
  );
}

function Invoice({ session, order, mismatch }: { session: Session; order: Order; mismatch: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const { busy, error, setError, run } = useAction();

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {order.invoiceAmount != null ? (
          <>
            <span>Invoice: {money(order.invoiceAmount)}{order.invoiceDate ? ` on ${order.invoiceDate}` : ""}</span>
            {mismatch && <Badge tone="danger">Differs from order by {money(order.invoiceAmount - order.amount)}</Badge>}
          </>
        ) : (
          <span className="text-muted">No invoice recorded.</span>
        )}
        <button type="button" className="text-accent" onClick={() => {
          setAmount(order.invoiceAmount != null ? String(order.invoiceAmount) : String(order.amount));
          setDate(order.invoiceDate ?? today());
          setOpen(true);
        }}>{order.invoiceAmount != null ? "Edit" : "Record invoice"}</button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseNonNegativeNumber(amount);
    if (a == null || !isIsoDate(date)) {
      setError("Enter the invoice amount and date.");
      return;
    }
    const ok = await run(() =>
      updateOrder(session.businessId, session.uid, order, { invoiceAmount: a, invoiceDate: date }));
    if (ok) setOpen(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice amount (Rs)" inputMode="decimal" required value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <Field label="Invoice date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save invoice"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function PaymentRow({ session, payment: p }: { session: Session; payment: Payment }) {
  const { busy, error, run } = useAction();
  return (
    <li className="flex flex-col gap-1 py-2 text-sm">
      <div className="flex justify-between gap-3">
        <span><span className="text-muted">{p.date} · </span>{methodLabel(p)}</span>
        <span className="font-medium">{money(p.amount)}</span>
      </div>
      {p.method === "cheque" && (
        <div className="flex items-center gap-2">
          {p.clearedStatus === "cleared" ? (
            <Badge tone="accent">Cleared{p.clearedDate ? ` ${p.clearedDate}` : ""}</Badge>
          ) : (
            <>
              <Badge>Not cleared{p.chequeDate ? ` · dated ${p.chequeDate}` : ""}</Badge>
              <button type="button" className="text-accent disabled:opacity-50" disabled={busy}
                onClick={() => run(() => clearCheque(session.businessId, session.uid, p, today()))}>
                Mark cleared
              </button>
            </>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

const METHOD_OPTIONS: [PaymentMethod, string][] = [["bank", "Bank transfer"], ["cheque", "Cheque"], ["cash", "Cash"]];

function NewPayment({ businessId, order, balance }: { businessId: string; order: Order; balance: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [date, setDate] = useState(today());
  const [extra, setExtra] = useState<Record<string, string>>({});
  const { busy, error, setError, run } = useAction();
  const set = (k: string) => (e: { target: { value: string } }) => setExtra((x) => ({ ...x, [k]: e.target.value }));

  if (!open) {
    return (
      <Button variant="ghost" className="mt-2 px-0 text-accent" onClick={() => {
        setAmount(balance > 0 ? String(balance) : "");
        setDate(today());
        setExtra({});
        setOpen(true);
      }}>+ Record payment</Button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = parsePositiveNumber(amount);
    if (a == null || !isIsoDate(date)) {
      setError("Enter an amount above 0 and a date.");
      return;
    }
    if (method === "cheque" && !extra.chequeNo?.trim()) {
      setError("Enter the cheque number.");
      return;
    }
    const ok = await run(() => addPayment(businessId, order, { amount: a, method, date, ...extra }));
    if (ok) setOpen(false);
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (Rs)" inputMode="decimal" required autoFocus value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <Field label="Date paid" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Select label="Method" value={method} options={METHOD_OPTIONS}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)} />
      {method === "bank" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From account" maxLength={120} value={extra.bankAccount ?? ""} onChange={set("bankAccount")} />
          <Field label="Reference no." maxLength={120} value={extra.bankRef ?? ""} onChange={set("bankRef")} />
        </div>
      )}
      {method === "cheque" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Cheque no." required maxLength={60} value={extra.chequeNo ?? ""} onChange={set("chequeNo")} />
          <Field label="Bank" maxLength={120} value={extra.chequeBank ?? ""} onChange={set("chequeBank")} />
          <Field label="Cheque date" type="date" value={extra.chequeDate ?? ""} onChange={set("chequeDate")} />
        </div>
      )}
      {method === "cash" && (
        <Field label="Handed to" maxLength={120} value={extra.cashTo ?? ""} onChange={set("cashTo")} />
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
