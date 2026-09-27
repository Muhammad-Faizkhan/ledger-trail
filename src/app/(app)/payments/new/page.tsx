import { RecordPaymentPage } from "./RecordPaymentPage";

export default async function Page({ searchParams }: PageProps<"/payments/new">) {
  const { vendor, order } = await searchParams;
  return (
    <RecordPaymentPage
      vendorId={typeof vendor === "string" ? vendor : undefined}
      orderId={typeof order === "string" ? order : undefined}
    />
  );
}
