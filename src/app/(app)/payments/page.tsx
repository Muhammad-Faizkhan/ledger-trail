"use client";

import { useState } from "react";
import { allocatePayments, byPaymentAge, methodLabel } from "@/lib/derive";
import type { Payment, PaymentMethod } from "@/lib/types";
import { useSession } from "../../_components/Gate";
import { PaymentRow } from "../../_components/PaymentRow";
import { Button, Chips, EmptyState, LinkButton, PageHeader, SearchBox } from "../../_components/ui";

type Filter = "all" | "uncleared" | PaymentMethod;
const FILTERS: [Filter, string][] = [
  ["all", "All"], ["uncleared", "Cheques not cleared"], ["bank", "Bank"], ["cheque", "Cheque"], ["cash", "Cash"],
];
const PAGE = 30;

export default function PaymentsPage() {
  const { ledger } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const alloc = allocatePayments(ledger.orders, ledger.payments);
  const q = query.trim().toLowerCase();

  const uncleared = (p: Payment) => p.method === "cheque" && p.clearedStatus !== "cleared";
  const list = ledger.payments
    .filter((p) => filter === "all" || (filter === "uncleared" ? uncleared(p) : p.method === filter))
    .filter((p) => !q || p.vendorName.toLowerCase().includes(q) || methodLabel(p).toLowerCase().includes(q))
    .sort((a, b) => Number(uncleared(b)) - Number(uncleared(a)) || byPaymentAge(b, a));

  return (
    <>
      <PageHeader title="Payments" action={<LinkButton href="/payments/new">Record payment</LinkButton>} />
      {ledger.payments.length === 0 ? (
        <EmptyState title="No payments yet" text="When you pay a vendor, tap Record payment to note it here."
          action={<LinkButton href="/payments/new">Record payment</LinkButton>} />
      ) : (
        <>
          <SearchBox value={query} onChange={(v) => { setQuery(v); setShown(PAGE); }} placeholder="Search vendor, cheque or reference" />
          <Chips label="Show" value={filter} options={FILTERS} onChange={(f) => { setFilter(f); setShown(PAGE); }} />
          {list.length === 0 ? (
            <EmptyState title="Nothing here" text="No payments in this list." />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.slice(0, shown).map((p) => <PaymentRow key={p.id} payment={p} alloc={alloc} />)}
            </ul>
          )}
          {list.length > shown && (
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>Show more ({list.length - shown} left)</Button>
          )}
        </>
      )}
    </>
  );
}
