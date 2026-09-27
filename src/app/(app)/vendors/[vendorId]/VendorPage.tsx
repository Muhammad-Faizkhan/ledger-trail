"use client";

import Link from "next/link";
import { useState } from "react";
import { allocatePayments, byPaymentAge, orderBalance, vendorStatement, vendorTotals } from "@/lib/derive";
import { itemsSummary, poNumber, today, whatsAppUrl } from "@/lib/format";
import type { Vendor } from "@/lib/types";
import { useSession } from "@/app/_components/Gate";
import { PaymentRow } from "@/app/_components/PaymentRow";
import {
  Button, Card, Chips, EmptyState, ErrorText, LinkButton, Money, PageHeader, StatusBadge, useAction,
} from "@/app/_components/ui";
import { createVendorLink, revokeVendorLink, vendorLinkUrl } from "@/app/_components/writes";

type Tab = "orders" | "payments" | "details";

export function VendorPage({ vendorId }: { vendorId: string }) {
  const { ledger } = useSession();
  const [tab, setTab] = useState<Tab>("orders");
  const vendor = ledger.vendors.find((v) => v.id === vendorId);

  if (!vendor) {
    return <EmptyState title="This vendor doesn't exist" action={<LinkButton href="/vendors">See all vendors</LinkButton>} />;
  }

  const t = vendorTotals(ledger.orders, ledger.payments).get(vendorId) ?? { ordered: 0, paid: 0, outstanding: 0 };
  const alloc = allocatePayments(ledger.orders, ledger.payments);
  const orders = ledger.orders.filter((o) => o.vendorId === vendorId)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number - a.number);
  const payments = ledger.payments.filter((p) => p.vendorId === vendorId).sort((a, b) => byPaymentAge(b, a));

  return (
    <>
      <PageHeader back={{ href: "/vendors", label: "Vendors" }} title={vendor.name}
        subtitle={vendor.phone && <a href={`tel:${vendor.phone}`} className="text-accent">{vendor.phone}</a>}
        action={<LinkButton href={`/vendors/${vendor.id}/edit`} variant="secondary">Edit</LinkButton>} />

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-xs text-muted">Ordered</p><Money value={t.ordered} className="font-semibold" /></div>
          <div><p className="text-xs text-muted">Paid</p><Money value={t.paid} className="font-semibold text-success" /></div>
          <div>
            <p className="text-xs text-muted">{t.outstanding < 0 ? "Advance" : "You owe"}</p>
            <Money value={Math.abs(t.outstanding)} className={`text-lg font-bold ${t.outstanding > 0 ? "text-danger" : "text-success"}`} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LinkButton href={`/orders/new?vendor=${vendor.id}`}>＋ New order</LinkButton>
          <LinkButton href={`/payments/new?vendor=${vendor.id}`} variant="secondary">Record payment</LinkButton>
        </div>
      </Card>

      <Chips label="Section" value={tab} onChange={setTab}
        options={[["orders", `Orders (${orders.length})`], ["payments", `Payments (${payments.length})`], ["details", "Details"]]} />

      {tab === "orders" && (orders.length === 0 ? (
        <EmptyState title="No orders yet" text={`Orders you make with ${vendor.name} will show here.`}
          action={<LinkButton href={`/orders/new?vendor=${vendor.id}`}>＋ New order</LinkButton>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const balance = orderBalance(o, alloc);
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">{poNumber(o.number)} <StatusBadge status={o.status} /></span>
                    <span className="block truncate text-sm">{itemsSummary(o.items)}</span>
                    <span className="block text-sm text-muted">{o.orderDate}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money value={o.amount} className="font-semibold" />
                    <span className={`block text-sm ${balance > 0 ? "text-danger" : "text-success"}`}>
                      {balance > 0 ? <><Money value={balance} /> to pay</> : "Paid"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}

      {tab === "payments" && (payments.length === 0 ? (
        <EmptyState title="No payments yet" text={`Payments you make to ${vendor.name} will show here.`}
          action={<LinkButton href={`/payments/new?vendor=${vendor.id}`}>Record payment</LinkButton>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {payments.map((p) => <PaymentRow key={p.id} payment={p} alloc={alloc} hideVendor />)}
        </ul>
      ))}

      {tab === "details" && <Details vendor={vendor} />}
    </>
  );
}

function Details({ vendor }: { vendor: Vendor }) {
  const { ledger } = useSession();
  const statementUrl = whatsAppUrl(
    vendor.phone, vendorStatement(vendor, ledger.orders, ledger.payments, ledger.business?.name ?? "", today()),
  );
  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Statement</h2>
        <p className="text-sm text-muted">Every order and payment with {vendor.name}, and the balance.</p>
        <div className="flex flex-wrap gap-2">
          {statementUrl
            ? <LinkButton href={statementUrl} external>Send on WhatsApp</LinkButton>
            : <p className="text-sm text-muted">Add a phone number below to send it on WhatsApp.</p>}
          <LinkButton href={`/vendors/${vendor.id}/statement`} variant="secondary">Print / PDF</LinkButton>
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Contact and notes</h2>
          <LinkButton href={`/vendors/${vendor.id}/edit`} variant="secondary">Edit</LinkButton>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Name</dt><dd className="font-medium">{vendor.name}</dd>
          <dt className="text-muted">Phone</dt><dd>{vendor.phone || <span className="text-muted">Not added</span>}</dd>
          <dt className="text-muted">Notes</dt>
          <dd className="whitespace-pre-wrap">{vendor.notes || <span className="text-muted">None</span>}</dd>
        </dl>
      </Card>
      <VendorLink vendor={vendor} />
    </>
  );
}

function VendorLink({ vendor }: { vendor: Vendor }) {
  const { busy, error, run } = useAction();
  const [copied, setCopied] = useState(false);
  const url = vendor.linkToken ? vendorLinkUrl(vendor.linkToken) : null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Vendor&apos;s own page</h2>
      <p className="text-sm text-muted">
        A private link where {vendor.name} can see their orders and payments, without an account.
      </p>
      {url ? (
        <>
          <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">{url}</code>
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}>{copied ? "Copied ✓" : "Copy link"}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => revokeVendorLink(vendor.id))}>
              Turn off link
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => createVendorLink(vendor.id))}>
            {busy ? "Creating…" : "Create link"}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
