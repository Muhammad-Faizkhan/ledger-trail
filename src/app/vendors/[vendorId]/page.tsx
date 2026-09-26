import { VendorPage } from "./VendorPage";

export default async function Page({ params }: PageProps<"/vendors/[vendorId]">) {
  const { vendorId } = await params;
  return <VendorPage vendorId={vendorId} />;
}
