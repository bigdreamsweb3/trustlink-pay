import type { TcapAssetId } from "./contracts.js";

export type Digest = string & { readonly __digest: unique symbol };
export type Commitment = string & { readonly __commitment: unique symbol };
export type Nullifier = string & { readonly __nullifier: unique symbol };
export type Ciphertext = string & { readonly __ciphertext: unique symbol };
export type SolanaAddress = string & { readonly __solanaAddress: unique symbol };

export type AssetAdmissionStatus = "proposed" | "active" | "deposits-paused" | "withdrawals-only" | "deprecated";
export type TransferFeePolicy = "reject" | "exact-net-received";
export type AuthorityRisk = "none-declared" | "freeze" | "clawback" | "freeze-and-clawback";

export interface TcapAssetRegistryV1 {
  version: 1;
  authority: SolanaAddress;
  registryVersion: number;
  entryRoot: Digest;
  frozen: boolean;
}

export interface TcapAssetEntryV1 {
  version: 1;
  asset: TcapAssetId;
  reserveVault: SolanaAddress;
  reserveAuthority: SolanaAddress;
  decimals: number;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  transferFeePolicy: TransferFeePolicy;
  authorityRisk: AuthorityRisk;
  governanceApproval: Digest;
  riskStatus: AssetAdmissionStatus;
  deprecated: boolean;
}

export interface TcapReserveStateV1 {
  version: 1;
  asset: TcapAssetId;
  assetEntry: SolanaAddress;
  vault: SolanaAddress;
  authority: SolanaAddress;
  actualReserveAssets: bigint;
  pendingLiabilities: bigint;
  settledLiabilities: bigint;
  withdrawalLiabilities: bigint;
  reservedRefundLiabilities: bigint;
  accountingEpoch: bigint;
  paused: boolean;
}

export interface TsnFeeReserveStateV1 {
  version: 1;
  asset: TcapAssetId;
  vault: SolanaAddress;
  authority: SolanaAddress;
  fundedFeeAssets: bigint;
  refundableFeeLiabilities: bigint;
  unpaidCrankerRewards: bigint;
  protocolFeeAllocations: bigint;
  carryForwardFeeLiabilities: bigint;
  claimedRewards: bigint;
  paused: boolean;
}

export type PendingLiabilityStatus = "funded" | "absorbed" | "settled" | "refundable" | "refunded" | "carried-forward";

export interface TcapPendingLiabilityV1 {
  version: 1;
  assetCommitment: Commitment;
  principalCommitment: Commitment;
  feeRelationshipCommitment: Commitment;
  refundAuthorityCommitment: Commitment;
  expiryUnixSeconds: bigint;
  fundingRecord: Digest;
  epochAbsorptionCommitment: Commitment | null;
  status: PendingLiabilityStatus;
  carryForwardCount: number;
}

export type PaymentIntentV2Status = "funded" | "epoch-assigned" | "carried-forward" | "settled" | "expired" | "refundable" | "closed";

export interface PaymentIntentV2 {
  version: 2;
  canonicalIntentDigest: Digest;
  fundedCommitmentReference: Digest;
  payerAuthorizationCommitment: Commitment;
  recipientRouteCommitment: Commitment;
  asset: TcapAssetId;
  amountCommitment: Commitment;
  settlementFeeCommitment: Commitment;
  protocolFeeCommitment: Commitment;
  expiryUnixSeconds: bigint;
  nonceCommitment: Commitment;
  replayProtectionCommitment: Commitment;
  refundPolicyCommitment: Commitment;
  settlementConditionsCommitment: Commitment;
  epochAssignmentCommitment: Commitment | null;
  pendingLiabilityCommitment: Commitment;
  proofDomainVersion: number;
  status: PaymentIntentV2Status;
}

export interface EpochCommitmentStateV1 {
  version: 1;
  epochId: bigint;
  acceptedIntentRoot: Digest;
  previousTcapStateRoot: Digest;
  eligibilityRoot: Digest;
  settlementResultRoot: Digest | null;
  nextTcapStateRoot: Digest | null;
  rewardAllocationRoot: Digest | null;
  carriedForwardIntentRoot: Digest | null;
  expiredIntentRoot: Digest | null;
  refundAllocationRoot: Digest | null;
  finalized: boolean;
}

export type NullifierDomain = "funded-intent-settlement" | "tcap-note-spend" | "public-refund" | "reward-claim";

export interface NullifierRecordV1 {
  version: 1;
  domain: NullifierDomain;
  nullifier: Nullifier;
  epochId: bigint;
  consumed: boolean;
}

export interface SettlementReceiptV1 {
  version: 1;
  epochId: bigint;
  settlementNullifier: Nullifier;
  mode: "public" | "confidential";
  assetCommitment: Commitment;
  resultCommitment: Commitment;
  crankerCommitment: Commitment;
  feeReceiptCommitment: Commitment;
}

export interface RewardAllocationStateV1 {
  version: 1;
  epochId: bigint;
  allocationRoot: Digest;
  totalAllocated: bigint;
  totalClaimed: bigint;
  finalized: boolean;
}

export interface FundedIntentOpeningV1 {
  version: 1;
  network: string;
  asset: TcapAssetId;
  principal: bigint;
  settlementFee: bigint;
  protocolFee: bigint;
  recipientRouteCommitment: Commitment;
  refundAuthorityCommitment: Commitment;
  expiryUnixSeconds: bigint;
  intentNonce: Uint8Array;
  settlementConditionsCommitment: Commitment;
  payerAuthorizationDomain: string;
  randomness: Uint8Array;
  minimumEpoch: bigint;
  maximumEpoch: bigint;
}

export interface EpochIntentLeafV1 {
  version: 1;
  blindedFundedCommitment: Commitment;
  fundingValidityCommitment: Commitment;
  admissibleEpochCommitment: Commitment;
}

export interface TcapNoteV1 {
  version: 1;
  assetCommitment: Commitment;
  valueCommitment: Commitment;
  ownerKeyCommitment: Commitment;
  randomnessCommitment: Commitment;
  encryptedPayload: Ciphertext;
}

export interface PublicSettlementRequestV1 {
  version: 1;
  epochId: bigint;
  acceptedEpochRoot: Digest;
  previousTcapRoot: Digest;
  settlementNullifier: Nullifier;
  asset: TcapAssetId;
  publicRecipientTokenAccount: SolanaAddress;
  publicAmount: bigint;
  proof: import("./proofs.js").PublicSettlementProof;
}

export interface ConfidentialSettlementRequestV1 {
  version: 1;
  epochId: bigint;
  acceptedEpochRoot: Digest;
  previousTcapRoot: Digest;
  settlementNullifier: Nullifier;
  encryptedRecipientOutput: Ciphertext;
  recipientOutputCommitment: Commitment;
  encryptedChangeOutput: Ciphertext | null;
  changeOutputCommitment: Commitment | null;
  nextTcapRoot: Digest;
  proof: import("./proofs.js").ConfidentialSettlementProof;
}

export interface TcapNoteSpendRequestV1 {
  version: 1;
  previousTcapRoot: Digest;
  noteNullifier: Nullifier;
  encryptedRecipientOutput: Ciphertext;
  recipientOutputCommitment: Commitment;
  encryptedChangeOutput: Ciphertext | null;
  changeOutputCommitment: Commitment | null;
  nextTcapRoot: Digest;
  proof: import("./proofs.js").TcapNoteSpendProof;
}

export interface AtomicFundingPlanV1 {
  version: 1;
  asset: TcapAssetId;
  payerTokenAccount: SolanaAddress;
  tcapReserve: SolanaAddress;
  tsnFeeReserve: SolanaAddress;
  protocolFeeDestination: SolanaAddress | null;
  principal: bigint;
  settlementFee: bigint;
  protocolFee: bigint;
  expectedDecimals: number;
  exactNetReceived: boolean;
  pendingLiabilityCommitment: Commitment;
  paymentIntentDigest: Digest;
  fundedIntentLeaf: EpochIntentLeafV1;
}

export interface CrankerWorkReceiptV1 {
  version: 1;
  epochId: bigint;
  crankerCommitment: Commitment;
  settlementReceiptCommitment: Commitment;
  earnedFeeCommitment: Commitment;
}

export interface RewardLeafV1 {
  version: 1;
  epochId: bigint;
  cranker: SolanaAddress;
  aggregateAmount: bigint;
  workReceiptRoot: Digest;
}

export interface RewardClaimV1 {
  version: 1;
  epochId: bigint;
  cranker: SolanaAddress;
  aggregateAmount: bigint;
  rewardRoot: Digest;
  rewardClaimNullifier: Nullifier;
  allocationProof: Uint8Array;
}
