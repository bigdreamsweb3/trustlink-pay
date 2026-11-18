import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { readWork } from "./read-work.mjs";
import { responseJson } from "./response-json.mjs";

/** Readiness authorizes later approval while preserving private preflight data and Cranker ineligibility. */
export async function readinessPrivacyTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work, evidence, leased } = await createReadyWork(context);
  assert.equal(work.status, "FUNDING_READY");
  assert.equal(work.fundingPhase, "AUTHORIZATION");
  assert.equal(work.stateVersion, leased.stateVersion + 1);
  assert.equal(work.nodeLease, null);
  assert.deepEqual(context.crankerWakes, []);
  assert.equal(await context.leaseCranker("synthetic-cranker", ["AUTHORIZED_FUNDING"]), null);
  const stored = await readWork(context, work.id);
  assert.doesNotMatch(JSON.stringify(stored), /private-1000000|private-route|"authorizationPreflight"/);
  const node = await context.forNode(work.id);
  assert.deepEqual(node.authorizationPreflight, evidence.authorizationPreflight);
  assert.deepEqual(node.fundingReadinessReceiverLease, evidence.receiverLease);
  const response = await context.getPublicStatus({ NextResponse: { json: responseJson }, createHash,
    getWork: readWork.bind(null, context), ...context.dependencies }, {}, { params: Promise.resolve({ id: work.id }) });
  assert.equal(response.status, 200);
  assert.equal(response.data.fundingPhase, "AUTHORIZATION");
  assert.equal(response.data.fundingReady, true);
  assert.equal(response.data.authorizationPayloadCommitment, work.authorizationPayloadCommitment);
  assert.deepEqual(response.data.fundingReadiness, evidence.fundingReadiness);
  assert.equal(response.data.settlement, null);
  assert.doesNotMatch(JSON.stringify(response.data), /private-1000000|private-route|nodeEncryptedPayload|authorizationPreflight|senderWallet/);
}
