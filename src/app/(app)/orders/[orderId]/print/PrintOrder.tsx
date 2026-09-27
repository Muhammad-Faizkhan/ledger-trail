"use client";

import { useSession } from "@/app/_components/Gate";
import { PrintSheet, printTable } from "@/app/_components/PrintSheet";
import { EmptyState, LinkButton, STATUS_LABEL } from "@/app/_components/ui";
import { money, num, poNumber } from "@/lib/format";

export function PrintOrder({ orderId }: { orderId: string }) {
  const { ledger } = useSession();
  const order = ledger.orders.find((o) => o.id === orderId);
  if (!order) {
    return <EmptyState title="This order doesn't exist" action={<LinkButton href="/orders">See all orders</LinkButton>} />;
  }
  const vendor = ledger.vendors.find((v) => v.id === order.vendorId);
  const po = poNumber(order.number);

  return (
    <PrintSheet title={`Print ${po}`} back={{ href: `/orders/${order.id}`, label: po }}>
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-2xl font-bold">Purchase order</p>
          <p className="text-lg">{po}</p>
        </div>
        <table className="text-left">
          <tbody>
            <tr><td className="pr-3 text-gray-600">Date</td><td>{order.orderDate}</td></tr>
            {order.expectedDate && <tr><td className="pr-3 text-gray-600">Deliver by</td><td>{order.expectedDate}</td></tr>}
            <tr><td className="pr-3 text-gray-600">Status</td><td>{STATUS_LABEL[order.status]}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mb-6">
        <p className="text-gray-600">To</p>
        <p className="text-base font-semibold">{order.vendorName}</p>
        {vendor?.phone && <p>{vendor.phone}</p>}
      </div>

      <table className={printTable}>
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Item</th>
            <th className="!text-right">Qty</th>
            <th className="!text-right">Rate</th>
            <th className="!text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{it.name}</td>
              <td className="text-right tabular-nums">{num(it.qty)} {it.unit}</td>
              <td className="text-right tabular-nums">{money(it.rate)}</td>
              <td className="text-right tabular-nums">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-2 text-right font-bold">Total</td>
            <td className="pt-2 text-right text-base font-bold tabular-nums">{money(order.amount)}</td>
          </tr>
        </tfoot>
      </table>

      {order.note && <p className="mt-6 whitespace-pre-wrap"><span className="text-gray-600">Note: </span>{order.note}</p>}
    </PrintSheet>
  );
}
