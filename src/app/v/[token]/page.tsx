import { VendorLinkView } from "./VendorLinkView";

export const metadata = { robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  return <VendorLinkView token={token} />;
}
