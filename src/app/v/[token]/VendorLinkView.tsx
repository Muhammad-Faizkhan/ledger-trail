"use client";

import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import { methodLabel } from "@/lib/derive";
import { functions } from "@/lib/firebase";
import { amountsDiffer, APP_NAME, money, num, poNumber, round2 } from "@/lib/format";
import type { Order, Payment } from "@/lib/types";
import { Badge, Card, Centered, StatusBadge } from "../../_components/ui";

// Shape returned by the resolveVendorLink Cloud Function.
type LinkOrder = Pick<Order, "id" | "number" | "items" | "amount" | "orderDate" | "expectedDate" | "status" | "invoiceAmount" | "invoiceNo" | "invoiceDate" | "note">;
type LinkPayment = Pick<Payment, "id" | "orderId" | "amount" | "method" | "date" | "bankRef" | "chequeNo" | "chequeBank" | "chequeDate" | "clearedStatus">;
interface LinkData {
  businessName: string;
  vendorName: string;
  orders: LinkOrder[];
  payments: LinkPayment[];
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: LinkData };

export function VendorLinkView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    httpsCallable<{ token: string }, LinkData>(functions, "resolveVendorLink")({ token })
      .then((res) => live && setState({ status: "ready", data: res.data }))
      .catch((err: { code?: string; message: string }) => live && setState({
        status: "error",
        message: err.code === "functions/not-found" ? err.message : "Couldn't load this page. Try again later.",
      }));
    return () => { live = false; };
  }, [token]);

  if (state.status === "loading") return <Centered><p className="text-muted">Loading…</p></Centered>;
  if (state.status === "error") {
    return <Centered><Card className="max-w-sm"><p>{state.message}</p></Card></Centered>;
  }

  const { businessName, vendorName, orders, payments } = state.data;
  const sortedOrders = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number - a.number);
  const sortedPayments = [...payments].sort((a, b) => b.date.localeCompare(a.date));
  const ordered = round2(orders.reduce((s, o) => s + o.amount, 0));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">{APP_NAME}</p>
        <h1 className="text-2xl font-semibold">{vendorName}</h1>
        <p className="text-muted">Your account with {businessName}</p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><p className="text-xs text-muted">Ordered</p><p className="mt-1 font-medium">{money(ordered)}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted">Paid to you</p><p className="mt-1 font-medium">{money(paid)}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted">Balance due</p><p className="mt-1 text-lg font-semibold">{money(ordered - paid)}</p></Card>
      </div>

      <Card>
        <h2 className="font-semibold">Orders</h2>
        {sortedOrders.length === 0 ? <p className="mt-2 text-sm text-muted">None yet.</p> : (
          <ul className="mt-2 divide-y divide-border">
            {sortedOrders.map((o) => (
              <li key={o.id} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium">{poNumber(o.number)} <StatusBadge status={o.status} /></span>
                  <span className="font-medium tabular-nums">{money(o.amount)}</span>
                </div>
                <p className="text-muted">{o.orderDate}{o.expectedDate ? ` · deliver by ${o.expectedDate}` : ""}</p>
                <ul className="mt-1">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{it.name}: {num(it.qty)} × {money(it.rate)}</span>
                      <span className="tabular-nums">{money(it.amount)}</span>
                    </li>
                  ))}
                </ul>
                {o.note && <p className="mt-1 text-muted">Note: {o.note}</p>}
                {o.invoiceAmount != null && (
                  <p className="mt-1">
                    Bill{o.invoiceNo ? ` #${o.invoiceNo}` : ""} {money(o.invoiceAmount)}{o.invoiceDate ? ` on ${o.invoiceDate}` : ""}{" "}
                    {amountsDiffer(o.invoiceAmount, o.amount) && <Badge tone="danger">differs from order</Badge>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Payments</h2>
        {sortedPayments.length === 0 ? <p className="mt-2 text-sm text-muted">None yet.</p> : (
          <ul className="mt-2 divide-y divide-border">
            {sortedPayments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="text-muted">{p.date} · </span>
                  {methodLabel({ ...p, cashTo: null })}
                  {p.method === "cheque" && (
                    <> <Badge tone={p.clearedStatus === "cleared" ? "accent" : "muted"}>
                      {p.clearedStatus === "cleared" ? "cleared" : "not cleared yet"}
                    </Badge></>
                  )}
                </span>
                <span className="font-medium">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
