export const TCAP_DOMAINS = Object.freeze({
  fundedIntent: "trustlink:tcap:funded-intent:v1",
  fundingRecord: "trustlink:tcap:funding-record:v1",
  epochIntentLeaf: "trustlink:tsn:epoch-intent-leaf:v1",
  tcapNote: "trustlink:tcap:note:v1",
  recipientOutput: "trustlink:tcap:recipient-output:v1",
  fundedSettlementNullifier: "trustlink:tcap:funded-settlement-nullifier:v1",
  noteSpendNullifier: "trustlink:tcap:note-spend-nullifier:v1",
  refundNullifier: "trustlink:tcap:refund-nullifier:v1",
  feeReceipt: "trustlink:tsn:fee-receipt:v1",
  settlementReceipt: "trustlink:tsn:settlement-receipt:v1",
  rewardLeaf: "trustlink:tsn:reward-leaf:v1",
  rewardClaimNullifier: "trustlink:tsn:reward-claim-nullifier:v1",
} as const);

export type TcapDomain = (typeof TCAP_DOMAINS)[keyof typeof TCAP_DOMAINS];

if (new Set(Object.values(TCAP_DOMAINS)).size !== Object.values(TCAP_DOMAINS).length) {
  throw new Error("duplicate_tcap_domain");
}
