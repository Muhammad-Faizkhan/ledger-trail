import { NewOrderPage } from "./NewOrderPage";

export default async function Page({ searchParams }: PageProps<"/orders/new">) {
  const { vendor } = await searchParams;
  return <NewOrderPage vendorId={typeof vendor === "string" ? vendor : undefined} />;
}
