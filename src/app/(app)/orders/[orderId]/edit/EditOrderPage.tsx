"use client";

import { OrderForm } from "@/app/_components/OrderForm";
import { useSession } from "@/app/_components/Gate";
import { EmptyState, LinkButton, PageHeader } from "@/app/_components/ui";
import { poNumber } from "@/lib/format";

export function EditOrderPage({ orderId }: { orderId: string }) {
  const { ledger } = useSession();
  const order = ledger.orders.find((o) => o.id === orderId);
  if (!order) {
    return <EmptyState title="This order doesn't exist" text="It may have been deleted."
      action={<LinkButton href="/orders">See all orders</LinkButton>} />;
  }
  return (
    <>
      <PageHeader title={`Edit ${poNumber(order.number)}`} subtitle={order.vendorName}
        back={{ href: `/orders/${order.id}`, label: poNumber(order.number) }} />
      <OrderForm order={order} />
    </>
  );
}
