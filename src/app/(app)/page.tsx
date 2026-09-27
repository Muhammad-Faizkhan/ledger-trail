"use client";

import Link from "next/link";
import { audit, methodLabel, recentActivity, totalOutstanding, type AuditReport } from "@/lib/derive";
import { money, poNumber, today } from "@/lib/format";
import { useSession } from "../_components/Gate";
import { Badge, Card, EmptyState, LinkButton, Money, Stat } from "../_components/ui";

export default function Home() {
  const { ledger } = useSession();
  const { orders, payments, vendors } = ledger;
  const report = audit(orders, payments, today());
  const owed = totalOutstanding(orders, payments);
  const toReceive = orders.filter((o) => o.status !== "received").length;
  const activity = recentActivity(orders, payments);

  if (vendors.length === 0 && orders.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-bold">Welcome</h1>
        <EmptyState
          title="Make your first order"
          text="Pick a vendor (or add a new one), list the items, and send it to them on WhatsApp."
          action={<LinkButton href="/orders/new">＋ New order</LinkButton>}
        />
      </>
    );
  }

  return (
    <>
      <h1 className="sr-only">Home</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Stat label="You owe vendors" value={money(Math.max(owed, 0))}
            hint={owed < 0 ? `You've paid ${money(-owed)} in advance` : undefined} />
        </div>
        <Link href="/orders" className="block"><Stat label="Orders to receive" value={toReceive} /></Link>
        <Link href="/payments" className="block">
          <Stat label="Cheques not cleared" value={report.pendingCheques.length} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LinkButton href="/orders/new" className="min-h-14 text-base">＋ New order</LinkButton>
        <LinkButton href="/payments/new" variant="secondary" className="min-h-14 text-base">Record payment</LinkButton>
      </div>

      <Attention report={report} />

      <Card>
        <h2 className="font-semibold">Recent</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Orders and payments you record will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {activity.map((a) => (
              <li key={`${a.kind}-${a.id}`}>
                <Link href={a.kind === "order" ? `/orders/${a.id}` : `/payments#${a.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.vendorName}</span>
                    <span className="block truncate text-sm text-muted">{a.date} · {a.label}</span>
                  </span>
                  <span className={`shrink-0 text-right text-sm font-semibold ${a.kind === "payment" ? "text-success" : ""}`}>
                    {a.kind === "payment" ? "Paid " : ""}<Money value={a.amount} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Attention({ report }: { report: AuditReport }) {
  const items: { key: string; href: string; tag: string; tone: "danger" | "warning"; text: string }[] = [
    ...report.lateDeliveries.map(({ order, days }) => ({
      key: `l-${order.id}`, href: `/orders/${order.id}`, tag: "Late", tone: "warning" as const,
      text: `${poNumber(order.number)} from ${order.vendorName} was due ${days} ${days === 1 ? "day" : "days"} ago`,
    })),
    ...report.overdue.map(({ order, balance, days }) => ({
      key: `o-${order.id}`, href: `/orders/${order.id}`, tag: "Unpaid", tone: "danger" as const,
      text: `${money(balance)} still owed on ${poNumber(order.number)} (${order.vendorName}), ${days} days old`,
    })),
    ...report.mismatches.map((o) => ({
      key: `m-${o.id}`, href: `/orders/${o.id}`, tag: "Bill differs", tone: "danger" as const,
      text: `${o.vendorName} billed ${money(o.invoiceAmount ?? 0)} for ${poNumber(o.number)}, but the order is ${money(o.amount)}`,
    })),
    ...report.staleCheques.map(({ payment, days }) => ({
      key: `c-${payment.id}`, href: `/payments#${payment.id}`, tag: "Cheque", tone: "warning" as const,
      text: `${methodLabel(payment)} to ${payment.vendorName} (${money(payment.amount)}) not cleared after ${days} days`,
    })),
  ];
  if (items.length === 0) return null;

  return (
    <Card>
      <h2 className="font-semibold">Needs attention <span className="text-muted">({items.length})</span></h2>
      <ul className="mt-2 divide-y divide-border">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 text-sm hover:bg-surface-2">
              <Badge tone={i.tone}>{i.tag}</Badge>
              <span>{i.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
