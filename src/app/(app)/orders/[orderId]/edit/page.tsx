import { EditOrderPage } from "./EditOrderPage";

export default async function Page({ params }: PageProps<"/orders/[orderId]/edit">) {
  const { orderId } = await params;
  return <EditOrderPage orderId={orderId} />;
}
