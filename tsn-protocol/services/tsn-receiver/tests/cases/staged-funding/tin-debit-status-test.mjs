import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { responseJson } from "./response-json.mjs";

/** Public status releases only exact rejected work with no retained execution attempt. */
export async function tinDebitStatusTest(fixture) {
  const rejected = { ...fixture.contract.createReceivedWork({ id: "rejected-debit", kind: "TIN_DEBIT", payload: { paymentId: "rejected-debit" } }),
    status: "REJECTED", nodeLease: null, crankerLease: null };
  for (const [patch, expected] of [
    [{}, true],
    [{ payload: { paymentId: "different-debit" } }, false],
    [{ kind: "TIN_OPERATION" }, undefined],
    [{ status: "FAILED" }, false],
    [{ status: "SUBMITTED" }, false],
    [{ nodeLease: { owner: "node", expiresAt: new Date(0).toISOString() } }, false],
    [{ crankerLease: { owner: "cranker", expiresAt: new Date(0).toISOString() } }, false],
    [{ authorization: { kind: "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" } }, false],
    [{ result: { signature: "unresolved-signed-attempt" } }, false],
    [{ retryHistory: [{ previousStatus: "CRANKER_LEASED" }] }, false],
    [{ nonExecutionHistory: [{ kind: "EXPIRED_UNCHANGED_ROOT" }] }, false],
  ]) {
    const work = { ...rejected, ...patch };
    const response = await fixture.getPublicStatus({ NextResponse: { json: responseJson }, createHash, getWork: async () => work },
      {}, { params: Promise.resolve({ id: work.id }) });
    assert.equal(response.data.safeToReplace, expected, JSON.stringify(patch));
    assert.doesNotMatch(JSON.stringify(response.data), /payloadCommitment|authorizationCommitment|retryHistory|nonExecutionHistory|senderOpening/);
  }
}
