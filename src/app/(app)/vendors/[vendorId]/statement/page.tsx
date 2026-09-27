import { PrintStatement } from "./PrintStatement";

export default async function Page({ params }: PageProps<"/vendors/[vendorId]/statement">) {
  const { vendorId } = await params;
  return <PrintStatement vendorId={vendorId} />;
}
