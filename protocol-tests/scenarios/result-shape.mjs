export function notImplementedScenario({ scenario, expectedOutcome, programIds, blocker }) {
  return {
    scenario, status: "NOT_IMPLEMENTED", expectedOutcome, observedOutcome: null,
    submitted: false, signatures: [], confirmedSlots: [], programIds,
    accounts: {}, stateBefore: null, stateAfter: null, invariantResults: [],
    error: { code: "NOT_IMPLEMENTED", message: blocker },
    evidenceClassification: "NO_CHAIN_EVIDENCE",
  };
}
