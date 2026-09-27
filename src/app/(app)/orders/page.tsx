"use client";

import Link from "next/link";
import { useState } from "react";
import { allocatePayments, orderBalance } from "@/lib/derive";
import { itemsSummary, poNumber, today } from "@/lib/format";
import type { Order } from "@/lib/types";
import { useSession } from "../../_components/Gate";
import { Badge, Button, Chips, EmptyState, LinkButton, Money, PageHeader, SearchBox, StatusBadge } from "../../_components/ui";

type Filter = "all" | "receive" | "pay";
const FILTERS: [Filter, string][] = [["all", "All"], ["receive", "To receive"], ["pay", "To pay"]];
const PAGE = 30;

export default function OrdersPage() {
  const { ledger } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const alloc = allocatePayments(ledger.orders, ledger.payments);
  const asOf = today();

  const q = query.trim().toLowerCase();
  const list = ledger.orders
    .filter((o) => filter === "all"
      || (filter === "receive" && o.status !== "received")
      || (filter === "pay" && orderBalance(o, alloc) > 0))
    .filter((o) => !q || matches(o, q))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number - a.number);

  return (
    <>
      <PageHeader title="Orders" action={<LinkButton href="/orders/new">＋ New order</LinkButton>} />

      {ledger.orders.length === 0 ? (
        <EmptyState title="No orders yet" text="Tap ＋ New order to make your first one."
          action={<LinkButton href="/orders/new">＋ New order</LinkButton>} />
      ) : (
        <>
          <SearchBox value={query} onChange={(v) => { setQuery(v); setShown(PAGE); }}
            placeholder="Search PO number, vendor or item" />
          <Chips label="Show" value={filter} options={FILTERS} onChange={(f) => { setFilter(f); setShown(PAGE); }} />

          {list.length === 0 ? (
            <EmptyState title="Nothing here" text={q ? `No orders match “${query.trim()}”.` : "No orders in this list right now."} />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.slice(0, shown).map((o) => {
                const balance = orderBalance(o, alloc);
                const late = o.status !== "received" && o.expectedDate != null && o.expectedDate < asOf;
                return (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{o.vendorName}</span>
                          <StatusBadge status={o.status} />
                          {late && <Badge tone="warning">Late</Badge>}
                        </p>
                        <p className="mt-0.5 truncate text-sm">{itemsSummary(o.items)}</p>
                        <p className="text-sm text-muted">{poNumber(o.number)} · {o.orderDate}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money value={o.amount} className="font-semibold" />
                        <p className={`text-sm ${balance > 0 ? "text-danger" : "text-success"}`}>
                          {balance > 0 ? <><Money value={balance} /> to pay</> : "Paid"}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length > shown && (
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({list.length - shown} left)
            </Button>
          )}
        </>
      )}
    </>
  );
}

function matches(o: Order, q: string): boolean {
  const digits = q.replace(/^po-?0*/, "");
  return o.vendorName.toLowerCase().includes(q)
    || poNumber(o.number).toLowerCase().includes(q)
    || (digits !== "" && /^\d+$/.test(digits) && String(o.number) === digits)
    || o.items.some((it) => it.name.toLowerCase().includes(q));
}
