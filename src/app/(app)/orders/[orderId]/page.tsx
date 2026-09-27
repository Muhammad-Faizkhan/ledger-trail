import { OrderPage } from "./OrderPage";

export default async function Page({ params }: PageProps<"/orders/[orderId]">) {
  const { orderId } = await params;
  return <OrderPage orderId={orderId} />;
}
