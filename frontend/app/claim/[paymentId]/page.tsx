import { ClaimExperience } from "@/src/components/experiences/claim-experience";

export default async function ClaimPage({
  params
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;

  return <ClaimExperience paymentId={paymentId} />;
}
