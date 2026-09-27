import { PrintOrder } from "./PrintOrder";

export default async function Page({ params }: PageProps<"/orders/[orderId]/print">) {
  const { orderId } = await params;
  return <PrintOrder orderId={orderId} />;
}
