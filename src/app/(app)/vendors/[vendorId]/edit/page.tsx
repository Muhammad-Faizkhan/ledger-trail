import { EditVendorPage } from "./EditVendorPage";

export default async function Page({ params }: PageProps<"/vendors/[vendorId]/edit">) {
  const { vendorId } = await params;
  return <EditVendorPage vendorId={vendorId} />;
}
