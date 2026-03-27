import { TransactionDetailExperience } from "@/src/components/experiences/transaction-detail-experience";

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;

  return <TransactionDetailExperience paymentId={paymentId} />;
}
