"use client";

import { OrderForm } from "@/app/_components/OrderForm";
import { useSession } from "@/app/_components/Gate";
import { PageHeader } from "@/app/_components/ui";

export function NewOrderPage({ vendorId }: { vendorId?: string }) {
  const { ledger } = useSession();
  const known = vendorId && ledger.vendors.some((v) => v.id === vendorId) ? vendorId : undefined;
  return (
    <>
      <PageHeader title="New order" />
      <OrderForm initialVendorId={known} />
    </>
  );
}
