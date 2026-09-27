"use client";

import { useSession } from "@/app/_components/Gate";
import { PrintSheet, printTable } from "@/app/_components/PrintSheet";
import { EmptyState, LinkButton } from "@/app/_components/ui";
import { byOrderAge, byPaymentAge, methodLabel } from "@/lib/derive";
import { itemsSummary, money, poNumber, today } from "@/lib/format";

interface Line {
  date: string;
  text: string;
  ordered: number;
  paid: number;
}

export function PrintStatement({ vendorId }: { vendorId: string }) {
  const { ledger } = useSession();
  const vendor = ledger.vendors.find((v) => v.id === vendorId);
  if (!vendor) {
    return <EmptyState title="This vendor doesn't exist" action={<LinkButton href="/vendors">See all vendors</LinkButton>} />;
  }

  // Orders before payments on the same day; each group already sorted oldest first.
  const lines: Line[] = [
    ...ledger.orders.filter((o) => o.vendorId === vendorId).sort(byOrderAge).map((o) => ({
      date: o.orderDate, text: `${poNumber(o.number)} · ${itemsSummary(o.items)}`, ordered: o.amount, paid: 0,
    })),
    ...ledger.payments.filter((p) => p.vendorId === vendorId).sort(byPaymentAge).map((p) => ({
      date: p.date,
      text: `${methodLabel(p)}${p.method === "cheque" && p.clearedStatus !== "cleared" ? " (not cleared)" : ""}`,
      ordered: 0, paid: p.amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.ordered - a.ordered);

  const rows = lines.reduce<(Line & { balance: number })[]>((acc, l) => {
    const before = acc.at(-1)?.balance ?? 0;
    acc.push({ ...l, balance: Math.round((before + l.ordered - l.paid) * 100) / 100 });
    return acc;
  }, []);
  const running = rows.at(-1)?.balance ?? 0;
  const ordered = lines.reduce((s, l) => s + l.ordered, 0);
  const paid = lines.reduce((s, l) => s + l.paid, 0);

  return (
    <PrintSheet title="Print statement" back={{ href: `/vendors/${vendor.id}`, label: vendor.name }}>
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-2xl font-bold">Statement</p>
          <p className="text-base font-semibold">{vendor.name}</p>
          {vendor.phone && <p>{vendor.phone}</p>}
        </div>
        <p><span className="text-gray-600">As of </span>{today()}</p>
      </div>

      {rows.length === 0 ? <p>No orders or payments yet.</p> : (
        <table className={printTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Details</th>
              <th className="!text-right">Ordered</th>
              <th className="!text-right">Paid</th>
              <th className="!text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap pr-2">{r.date}</td>
                <td className="pr-2">{r.text}</td>
                <td className="text-right tabular-nums">{r.ordered ? money(r.ordered) : ""}</td>
                <td className="text-right tabular-nums">{r.paid ? money(r.paid) : ""}</td>
                <td className="text-right tabular-nums">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 font-bold">Total</td>
              <td className="pt-2 text-right font-bold tabular-nums">{money(ordered)}</td>
              <td className="pt-2 text-right font-bold tabular-nums">{money(paid)}</td>
              <td className="pt-2 text-right text-base font-bold tabular-nums">{money(running)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="mt-6 text-base font-bold">
        {running < 0 ? `Paid in advance: ${money(-running)}` : `Balance due: ${money(running)}`}
      </p>
    </PrintSheet>
  );
}
