import { notImplementedScenario } from "./result-shape.mjs";

export const securityScenarios = [
  ["stale-funding-nonce", "stale_funding_nonce", "rejection with no state mutation"],
  ["duplicate-funding-claim", "duplicate_funding_claim", "rejection with no state mutation"],
  ["modified-amount", "modified_amount", "rejection with no state mutation"],
  ["modified-destination", "modified_destination", "rejection with no state mutation"],
  ["modified-fee", "modified_fee", "rejection with no state mutation"],
  ["unauthorized-reserve-movement", "unauthorized_reserve_movement", "rejection with no reserve mutation"],
];

export function runSecurityStub({ scenario, programIds }) {
  return notImplementedScenario({ scenario, programIds, expectedOutcome: "scenario-specific rejection", blocker: "Dedicated real-transaction executor is not implemented yet" });
}
