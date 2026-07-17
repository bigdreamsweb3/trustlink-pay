import { ClaimExperience } from "@/src/components/experiences/claim-experience";
import { WalletProvider } from "@/src/lib/wallet-provider";

export default async function ClaimPage({
  params
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;

  return (
    <WalletProvider>
      <ClaimExperience paymentId={paymentId} />
    </WalletProvider>
  );
}
