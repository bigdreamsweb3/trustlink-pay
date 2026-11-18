

export const LEGACY_MEMO_INPUT_COUNT_REJECTION = "GPRU transaction record is missing its twelve public hidden-head inputs";
export const FUNDED_ROOT_STALE = "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT";
export const NATIVE_REVERIFY_REASONS = new Set([FUNDED_ROOT_STALE,
  "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE",
  "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_EPOCH_ALREADY_ACCOUNTED", "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION",
  "TCAP_TRANSACTION_BLOCKHASH_HEIGHT_UNAVAILABLE", "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_UNAVAILABLE",
  "TIP route root changed since settlement verification", "TCAP credit authorization expired",
  "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature"]);
