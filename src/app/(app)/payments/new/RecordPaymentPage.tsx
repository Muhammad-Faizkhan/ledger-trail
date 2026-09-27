"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { allocatePayments, byOrderAge, orderBalance, vendorTotals } from "@/lib/derive";
import { isIsoDate, money, parsePositiveNumber, poNumber, today } from "@/lib/format";
import type { Payment, PaymentMethod } from "@/lib/types";
import { useSession } from "@/app/_components/Gate";
import {
  Button, Card, Chips, ErrorText, Field, NumberField, PageHeader, Select, useAction,
} from "@/app/_components/ui";
import { VendorPicker } from "@/app/_components/VendorPicker";
import { addPayment } from "@/app/_components/writes";

const METHODS: [PaymentMethod, string][] = [["bank", "Bank transfer"], ["cheque", "Cheque"], ["cash", "Cash"]];
type Target = "oldest" | "one";

export function RecordPaymentPage({ vendorId: initialVendor, orderId: initialOrder }: { vendorId?: string; orderId?: string }) {
  const router = useRouter();
  const { businessId, ledger } = useSession();
  const alloc = allocatePayments(ledger.orders, ledger.payments);
  const totals = vendorTotals(ledger.orders, ledger.payments);
  const owedTo = (id: string) => Math.max(totals.get(id)?.outstanding ?? 0, 0);

  const startOrder = initialOrder ? ledger.orders.find((o) => o.id === initialOrder) : undefined;
  const startVendor = startOrder?.vendorId
    ?? (initialVendor && ledger.vendors.some((v) => v.id === initialVendor) ? initialVendor : null);

  const [vendorId, setVendorId] = useState<string | null>(startVendor);
  const [target, setTarget] = useState<Target>(startOrder ? "one" : "oldest");
  const [orderId, setOrderId] = useState(startOrder?.id ?? "");
  const [amount, setAmount] = useState(() =>
    startOrder ? String(orderBalance(startOrder, alloc) || "") : startVendor ? String(owedTo(startVendor) || "") : "");
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [date, setDate] = useState(today());
  const [extra, setExtra] = useState<Record<string, string>>({});
  const { busy, error, setError, run } = useAction();
  const set = (k: string) => (e: { target: { value: string } }) => setExtra((x) => ({ ...x, [k]: e.target.value }));

  const vendor = vendorId ? ledger.vendors.find((v) => v.id === vendorId) : undefined;
  const openOrders = ledger.orders
    .filter((o) => o.vendorId === vendorId && (orderBalance(o, alloc) > 0 || o.id === orderId))
    .sort(byOrderAge);
  const a = parsePositiveNumber(amount);

  function chooseVendor(id: string | null) {
    setVendorId(id);
    setOrderId("");
    setTarget("oldest");
    setAmount(id ? String(owedTo(id) || "") : "");
  }

  function chooseOrder(id: string) {
    setOrderId(id);
    const o = ledger.orders.find((x) => x.id === id);
    if (o) setAmount(String(orderBalance(o, alloc) || ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vendor) return setError("Pick who you paid.");
    if (a == null) return setError("Enter the amount you paid.");
    if (!isIsoDate(date)) return setError("Enter the date you paid.");
    if (target === "one" && !orderId) return setError("Pick the order this payment is for.");
    if (method === "cheque" && !extra.chequeNo?.trim()) return setError("Enter the cheque number.");
    const ok = await run(() => addPayment(businessId, vendor, target === "one" ? orderId : null, { amount: a, method, date, ...extra }));
    if (ok) router.push(startOrder ? `/orders/${startOrder.id}` : `/vendors/${vendor.id}`);
  }

  return (
    <>
      <PageHeader title="Record payment" subtitle="Money you paid to a vendor." />
      <form onSubmit={submit} className="flex flex-col gap-5">
        <VendorPicker label="Paid to" value={vendorId} onChange={chooseVendor}
          note={(v) => {
            const owe = totals.get(v.id)?.outstanding ?? 0;
            return owe > 0 ? `You owe ${money(owe)}` : owe < 0 ? `Paid ${money(-owe)} in advance` : "Nothing owed";
          }} />

        {vendor && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <NumberField label="Amount (Rs)" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Field label="Date paid" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted">How did you pay?</span>
              <Chips label="Payment method" value={method} options={METHODS} onChange={setMethod} />
              {method === "bank" && (
                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                  <Field label="From account (optional)" maxLength={120} value={extra.bankAccount ?? ""} onChange={set("bankAccount")} />
                  <Field label="Reference no. (optional)" maxLength={120} value={extra.bankRef ?? ""} onChange={set("bankRef")} />
                </div>
              )}
              {method === "cheque" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Cheque no." required maxLength={60} value={extra.chequeNo ?? ""} onChange={set("chequeNo")} />
                  <Field label="Bank (optional)" maxLength={120} value={extra.chequeBank ?? ""} onChange={set("chequeBank")} />
                  <Field label="Cheque date (optional)" type="date" value={extra.chequeDate ?? ""} onChange={set("chequeDate")} />
                </div>
              )}
              {method === "cash" && (
                <div className="sm:max-w-md">
                  <Field label="Handed to (optional)" maxLength={120} value={extra.cashTo ?? ""} onChange={set("cashTo")} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted">Which bills does it pay?</span>
              <Chips label="Which bills" value={target}
                options={[["oldest", "Oldest bills first"], ["one", "One order"]]}
                onChange={(t) => { setTarget(t); if (t === "oldest") setOrderId(""); }} />
              {target === "one" && (
                openOrders.length === 0 ? (
                  <p className="text-sm text-muted">{vendor.name} has no unpaid orders.</p>
                ) : (
                  <div className="sm:max-w-md">
                    <Select label="Order" value={orderId} onChange={(e) => chooseOrder(e.target.value)}
                      options={[["", "Choose an order…"], ...openOrders.map((o) => [
                        o.id, `${poNumber(o.number)} · ${o.orderDate} · ${money(orderBalance(o, alloc))} left`,
                      ] as [string, string])]} />
                  </div>
                )
              )}
            </div>

            {a != null && <Preview vendorId={vendor.id} amount={a} date={date} orderId={target === "one" ? orderId || null : null} />}
          </>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !vendor} className="min-w-40 text-base">
            {busy ? "Saving…" : "Save payment"}
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </>
  );
}

/** Shows which orders this payment will clear before it's saved. */
function Preview({ vendorId, amount, date, orderId }: { vendorId: string; amount: number; date: string; orderId: string | null }) {
  const { ledger } = useSession();
  const draft = {
    id: "￿new", orderId, vendorId, vendorName: "", amount, method: "cash", date,
    bankAccount: null, bankRef: null, chequeNo: null, chequeBank: null, chequeDate: null,
    clearedStatus: null, clearedDate: null, cashTo: null, createdAt: null,
  } satisfies Payment;
  const after = allocatePayments(ledger.orders, [...ledger.payments, draft]);
  const before = allocatePayments(ledger.orders, ledger.payments);
  const orderById = new Map(ledger.orders.map((o) => [o.id, o]));
  const extra = (after.credit.get(vendorId) ?? 0) - (before.credit.get(vendorId) ?? 0);
  // Other payments can shift when this one is dated earlier, so compare balances, not just this payment's share.
  const changed = ledger.orders
    .filter((o) => o.vendorId === vendorId)
    .map((o) => ({ o, was: before.byOrder.get(o.id)!.balance, now: after.byOrder.get(o.id)!.balance }))
    .filter((x) => x.was !== x.now)
    .sort((x, y) => byOrderAge(x.o, y.o));

  return (
    <Card className="bg-surface-2">
      <p className="text-sm font-semibold">This payment will:</p>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {changed.map(({ o, was, now }) => (
          <li key={o.id} className="flex justify-between gap-3">
            <span>{now === 0 ? "Fully pay" : "Part-pay"} {poNumber(orderById.get(o.id)!.number)} <span className="text-muted">({o.orderDate})</span></span>
            <span className="tabular-nums">{money(was - now)}{now > 0 && <span className="text-muted"> · {money(now)} left</span>}</span>
          </li>
        ))}
        {extra > 0 && (
          <li className="flex justify-between gap-3">
            <span>Stay with the vendor as advance</span><span className="tabular-nums">{money(extra)}</span>
          </li>
        )}
      </ul>
    </Card>
  );
}
