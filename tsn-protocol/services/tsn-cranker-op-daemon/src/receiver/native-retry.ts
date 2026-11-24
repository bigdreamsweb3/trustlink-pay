/** Exact pre-signing conflicts accepted by Receiver's native re-verification route. */
const NATIVE_REVERIFY_REASONS = new Set([
  "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE",
  "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION",
  "TCAP_TRANSACTION_BLOCKHASH_HEIGHT_UNAVAILABLE",
  "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_UNAVAILABLE",
  "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_EPOCH_ALREADY_ACCOUNTED",
  "TIP route root changed since settlement verification",
  "TCAP credit authorization expired",
  "TCAP transfer authorization expired",
  "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature",
]);

export function nativeConflictReason(status: number, rejection: unknown): string | null {
  if (status !== 409 || !rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const body = rejection as Record<string, unknown>;
  // FastAPI uses detail; Receiver's own handlers use error. Never substring-match.
  const reason = body.detail ?? body.error;
  return typeof reason === "string" && NATIVE_REVERIFY_REASONS.has(reason) ? reason : null;
}

/** Only this exact service failure from the signing route is retryable availability. */
export function nativeSigningAvailabilityReason(path: string, status: number, rejection: unknown): string | null {
  if (path !== "/api/cranker/settlement-signature" || status !== 503
      || !rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  return (rejection as Record<string, unknown>).error === "TSN Node signing service is unavailable"
    ? "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE" : null;
}

export function nativeWorkRetryReason(work: {
  kind: string; result?: Record<string, unknown> | null;
  verification?: { verificationType?: string | null } | null;
}, error: unknown): string | null {
  if ((work.result && Object.keys(work.result).length) || !(error instanceof Error) || !NATIVE_REVERIFY_REASONS.has(error.message)) return null;
  const native = work.kind === "TCAP_EPOCH_ACCOUNTING"
    || (work.kind === "TIN_DEBIT" && work.verification?.verificationType === "TSN_TIN_DEBIT_V1")
    || (work.kind === "SETTLEMENT" && work.verification?.verificationType === "TSN_TCAP_GPRU_HIDDEN_HEAD_V1");
  return native ? error.message : null;
}
