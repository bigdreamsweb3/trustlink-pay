export const PROGRAM_IDS = {
  tip: process.env.TIP_PROGRAM_ID ?? "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
  tsn: process.env.TSN_PROGRAM_ID ?? "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
  tcap: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
};

const future = (name, requiredInstructions, missingState, blockingPhase, requiredPrograms = ["tip", "tsn", "tcap"]) => ({
  name, requiredPrograms, requiredInstructions, status: "NOT_IMPLEMENTED", missingState, blockingPhase,
});

export const scenarios = [
  future("wallet_to_tin_to_recipient_pru", ["TIP identity resolution", "TSN create_payment_intent_v1", "TCAP settle_funding_to_confidential_owner_v1"], "TIN route and PRU container", "TIP/TSN/TCAP settlement phase"),
  future("wallet_to_own_confidential_pru", ["TCAP settle_funding_to_confidential_owner_v1"], "ConfidentialAssetContainerV1", "TCAP settlement phase", ["tcap"]),
  future("wallet_to_public_wallet_exit", ["TCAP settle_funding_to_public_exit_v1"], "PublicExitAuthorizationV1", "TCAP exit phase", ["tcap"]),
  future("wallet_to_tin_to_public_exit", ["TIP identity resolution", "TSN create_payment_intent_v1", "TCAP settle_funding_to_public_exit_v1"], "TIN route and public exit authorization", "TIP/TSN/TCAP exit phase"),
  future("confidential_pru_to_confidential_pru", ["TSN create_payment_intent_v1", "TCAP settle_confidential_transfer_v1"], "ConfidentialOwnershipCommitmentV1 and NullifierV1", "TCAP ownership phase"),
  future("confidential_pru_to_public_wallet_exit", ["TCAP settle_confidential_to_public_exit_v1"], "NullifierV1 and PublicExitAuthorizationV1", "TCAP exit phase", ["tcap"]),
  future("funding_claim_to_confidential_owner", ["TCAP settle_funding_to_confidential_owner_v1"], "ConfidentialAssetContainerV1", "TCAP settlement phase", ["tcap"]),
  future("funding_claim_to_public_exit", ["TCAP settle_funding_to_public_exit_v1"], "PublicExitAuthorizationV1", "TCAP exit phase", ["tcap"]),
  future("replayed_tsn_intent", ["TSN create_payment_intent_v1"], "TsnPaymentIntentV1", "TSN integration phase", ["tsn"]),
  { name: "funding_entry_success", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "EXECUTOR_AVAILABLE" },
  { name: "stale_funding_nonce", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  future("stale_confidential_spend_nonce", ["TCAP settle_confidential_transfer_v1"], "ConfidentialSpendNonceV1", "TCAP ownership phase", ["tcap"]),
  future("expired_tsn_intent", ["TSN create_payment_intent_v1"], "TsnPaymentIntentV1", "TSN integration phase", ["tsn"]),
  { name: "duplicate_funding_claim", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  future("duplicate_nullifier", ["TCAP settle_confidential_transfer_v1"], "NullifierV1", "TCAP ownership phase", ["tcap"]),
  { name: "modified_amount", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  { name: "modified_destination", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  { name: "modified_fee", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  future("unauthorized_cranker", ["TSN settlement authorization instruction"], "Cranker authorization receipt", "TSN integration phase", ["tsn"]),
  { name: "unauthorized_reserve_movement", requiredPrograms: ["tcap"], requiredInstructions: ["deposit_with_funding_commitment_v1"], status: "NOT_IMPLEMENTED", blockingPhase: "scenario executor phase" },
  future("concurrent_settlement_race", ["TCAP settle_confidential_transfer_v1"], "Ownership state version and nullifier state", "TCAP ownership phase", ["tcap"]),
];

export function registryReport() {
  return Object.fromEntries(scenarios.map((scenario) => [scenario.name, { ...scenario }]));
}
