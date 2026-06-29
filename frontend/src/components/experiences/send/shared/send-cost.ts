export type SendCostEstimate = {
  tokenSymbol: string;
  senderFeeAmountUi: number;
  senderFeeAmountUsd: number | null;
  recipientFeeAmountUi: number;
  recipientFeeAmountUsd: number | null;
  recipientPayoutAmountUi: number;
  totalTokenRequiredUi: number;
  networkFeeSol: number;
  networkFeeUsd: number | null;
  settlementAssessment?: {
    likelihood: "likely_claimable" | "risky_claim_amount" | "economically_non_claimable";
    minimumTransferUi: number;
    reason: string;
  };
};

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSendCostEstimate(payload: unknown, amountUi: number): SendCostEstimate | null {
  const source = (payload && typeof payload === "object" && "estimate" in payload
    ? (payload as { estimate?: unknown }).estimate
    : payload) as Partial<SendCostEstimate> | null;
  if (!source || typeof source !== "object") return null;

  const senderFeeAmountUi = toFiniteNumber(source.senderFeeAmountUi);
  const recipientFeeAmountUi = toFiniteNumber(source.recipientFeeAmountUi);
  const recipientPayoutAmountUi = toFiniteNumber(source.recipientPayoutAmountUi);
  const networkFeeSol = toFiniteNumber(source.networkFeeSol);
  const totalTokenRequiredUi = toFiniteNumber(source.totalTokenRequiredUi);
  if (senderFeeAmountUi == null || networkFeeSol == null) return null;
  const safeRecipientFeeAmountUi = recipientFeeAmountUi ?? 0;
  const safeRecipientPayoutAmountUi =
    recipientPayoutAmountUi != null
      ? recipientPayoutAmountUi
      : Number(Math.max(0, amountUi - safeRecipientFeeAmountUi).toFixed(6));

  return {
    tokenSymbol: String(source.tokenSymbol || "Token"),
    senderFeeAmountUi,
    senderFeeAmountUsd: toFiniteNumber(source.senderFeeAmountUsd),
    recipientFeeAmountUi: safeRecipientFeeAmountUi,
    recipientFeeAmountUsd: toFiniteNumber(source.recipientFeeAmountUsd),
    recipientPayoutAmountUi: safeRecipientPayoutAmountUi,
    totalTokenRequiredUi:
      totalTokenRequiredUi != null && totalTokenRequiredUi > 0
        ? totalTokenRequiredUi
        : Number((amountUi + senderFeeAmountUi).toFixed(6)),
    networkFeeSol,
    networkFeeUsd: toFiniteNumber(source.networkFeeUsd),
    settlementAssessment: source.settlementAssessment,
  };
}

export function hasCompleteCostEstimate(estimate: SendCostEstimate | null) {
  return Boolean(
    estimate &&
      Number.isFinite(estimate.senderFeeAmountUi) &&
      estimate.senderFeeAmountUi >= 0 &&
      Number.isFinite(estimate.recipientFeeAmountUi) &&
      estimate.recipientFeeAmountUi >= 0 &&
      Number.isFinite(estimate.recipientPayoutAmountUi) &&
      estimate.recipientPayoutAmountUi > 0 &&
      Number.isFinite(estimate.totalTokenRequiredUi) &&
      estimate.totalTokenRequiredUi > 0 &&
      Number.isFinite(estimate.networkFeeSol) &&
      estimate.networkFeeSol >= 0,
  );
}

export function formatUsd(value: number | null | undefined, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
}
