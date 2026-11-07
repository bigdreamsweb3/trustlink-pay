/** A confirmed transaction must not become a FAILED report when its receipt write fails. */
export class ConfirmedReceiptReportPending extends Error {
  constructor(readonly workId: string, readonly signature: string) {
    super(`Confirmed transaction receipt report is pending for ${workId}; reconcile signature ${signature}`);
    this.name = "ConfirmedReceiptReportPending";
  }
}

/** Availability failure only; authorization and receipt mismatches are never retried. */
export class RetryableConfirmedReportError extends Error {}

export function confirmedReportAvailabilityError(status: number, code?: unknown): boolean {
  return [429, 500, 502, 503, 504].includes(status)
    || (status === 409 && (code === "SETTLEMENT_RECONCILIATION_RPC_UNAVAILABLE"
      || code === "SETTLEMENT_RECONCILIATION_RPC_RECEIPT_UNAVAILABLE"));
}

function transient(error: unknown): boolean {
  if (error instanceof RetryableConfirmedReportError) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError"
    || (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message));
}

export async function sendConfirmedWorkReport(
  send: (signal: AbortSignal) => Promise<unknown>, workId: string, signature: string,
  options: { attempts?: number; timeoutMs?: number; delayMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const attempts = options.attempts ?? 6;
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    // This signal bounds all authentication/report requests and response reads.
    const signal = AbortSignal.timeout(options.timeoutMs ?? 25_000);
    try {
      await send(signal);
      return;
    } catch (error) {
      if ((!signal.aborted && !transient(error)) || attempt === attempts - 1) break;
      await wait(options.delayMs ?? 5_000);
    }
  }
  throw new ConfirmedReceiptReportPending(workId, signature);
}
