export const TCAP_CONTRACT_VERSION = 1 as const;

export type TcapAssetId = Readonly<{
  tokenProgram: string;
  mint: string;
  registryVersion: number;
  assetCommitment: string;
}>;

export type TcapFundingBreakdown = Readonly<{
  principal: bigint;
  settlementFee: bigint;
  protocolFee: bigint;
}>;

export type TcapReserveLiabilities = Readonly<{
  settledClaims: bigint;
  pendingClaims: bigint;
  withdrawalLiabilities: bigint;
  reservedRefundLiabilities: bigint;
}>;

export type TsnFeeLiabilities = Readonly<{
  unpaidCrankerRewards: bigint;
  refundableSettlementFees: bigint;
  otherCommittedFees: bigint;
}>;

export type PaymentIntentCommitmentV1 = Readonly<{
  version: typeof TCAP_CONTRACT_VERSION;
  network: string;
  asset: TcapAssetId;
  amountCommitment: string;
  recipientRouteCommitment: string;
  refundAuthorityCommitment: string;
  feeCommitment: string;
  expiryUnixSeconds: bigint;
  nonceCommitment: string;
  settlementConditionsCommitment: string;
  pendingLiabilityCommitment: string;
}>;

function requireNonNegative(label: string, value: bigint): void {
  if (value < 0n) throw new RangeError(`${label} must not be negative`);
}

export function totalFunding(value: TcapFundingBreakdown): bigint {
  requireNonNegative("principal", value.principal);
  requireNonNegative("settlementFee", value.settlementFee);
  requireNonNegative("protocolFee", value.protocolFee);
  return value.principal + value.settlementFee + value.protocolFee;
}

export function assertTcapReserveBacked(
  vaultAssets: bigint,
  liabilities: TcapReserveLiabilities,
): void {
  requireNonNegative("vaultAssets", vaultAssets);
  requireNonNegative("settledClaims", liabilities.settledClaims);
  requireNonNegative("pendingClaims", liabilities.pendingClaims);
  requireNonNegative("withdrawalLiabilities", liabilities.withdrawalLiabilities);
  requireNonNegative("reservedRefundLiabilities", liabilities.reservedRefundLiabilities);
  const required =
    liabilities.settledClaims
    + liabilities.pendingClaims
    + liabilities.withdrawalLiabilities
    + liabilities.reservedRefundLiabilities;
  if (vaultAssets < required) throw new Error("tcap_reserve_underbacked");
}

export function assertTsnFeeReserveBacked(
  vaultAssets: bigint,
  liabilities: TsnFeeLiabilities,
): void {
  requireNonNegative("vaultAssets", vaultAssets);
  requireNonNegative("unpaidCrankerRewards", liabilities.unpaidCrankerRewards);
  requireNonNegative("refundableSettlementFees", liabilities.refundableSettlementFees);
  requireNonNegative("otherCommittedFees", liabilities.otherCommittedFees);
  const required =
    liabilities.unpaidCrankerRewards + liabilities.refundableSettlementFees + liabilities.otherCommittedFees;
  if (vaultAssets < required) throw new Error("tsn_fee_reserve_underbacked");
}

export function assertCanonicalAssetId(asset: TcapAssetId): void {
  if (!asset.tokenProgram || !asset.mint || !asset.assetCommitment) {
    throw new Error("invalid_tcap_asset_id");
  }
  if (!Number.isSafeInteger(asset.registryVersion) || asset.registryVersion < 1) {
    throw new Error("invalid_tcap_registry_version");
  }
}
