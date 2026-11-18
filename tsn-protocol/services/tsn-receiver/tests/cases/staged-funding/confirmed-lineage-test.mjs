import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { signFundingVerification } from "./sign-funding-verification.mjs";
import { readWork } from "./read-work.mjs";
import { responseJson } from "./response-json.mjs";

/** Confirmed fixture reports preserve final funding lineage and durable encrypted owner ingress. */
export async function confirmedLineageTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work, payload } = await createReadyWork(context);
  const params = attachmentParams(work);
  await context.attach(params);
  const leased = await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"]);
  const evidence = signFundingVerification(context, leased);
  await context.transition({ id: work.id, actor: "node", owner: "synthetic-node", expectedVersion: leased.stateVersion,
    status: "VERIFIED", evidence });
  const funding = await context.leaseCranker("synthetic-cranker", ["AUTHORIZED_FUNDING"]);
  assert.equal(funding.id, work.id);
  const execution = fixture.contract.crankerExecutionPayload(funding.kind, fixture.contract.verifiedPayloadForWork(funding));
  assert.deepEqual(execution, { senderSignedFundingTransaction: params.senderSignedFundingTransaction,
    senderFundingMode: payload.senderFundingMode, senderFundingBlockhashContext: params.senderFundingBlockhashContext });
  await context.transition({ id: work.id, actor: "cranker", owner: "synthetic-cranker", expectedVersion: funding.stateVersion,
    status: "CONFIRMED", evidence: { signature: "synthetic-confirmed-funding-signature", stage: "TCAP_DEPOSIT" } });
  const confirmed = await readWork(context, work.id);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.authorizationPayloadCommitment, work.authorizationPayloadCommitment);
  assert.equal(confirmed.payloadCommitment, leased.payloadCommitment);
  const receipt = fixture.contract.verifiedPayloadForWork(confirmed);
  assert.equal(Object.hasOwn(receipt, "senderSignedFundingTransaction"), false);
  assert.equal(Object.hasOwn(receipt, "senderFundingBlockhashContext"), false);
  assert.deepEqual((await context.forNode(work.id)).payload, leased.payload);
  const publicStatus = await context.getPublicStatus({ NextResponse: { json: responseJson }, createHash,
    getWork: readWork.bind(null, context) }, {}, { params: Promise.resolve({ id: work.id }) });
  assert.equal(publicStatus.data.result.signature, "synthetic-confirmed-funding-signature");
  assert.equal(publicStatus.data.settlement.status, "RECEIVED");
  assert.doesNotMatch(JSON.stringify(publicStatus.data), /synthetic-owner-signed-deposit-wire|private-1000000|private-route|nodeEncryptedPayload|senderFundingBlockhashContext/);
  await context.attach({ ...params, expectedVersion: 1 });
  assert.deepEqual(await readWork(context, work.id), confirmed);
  const settlement = await context.leaseNode("synthetic-node", ["SETTLEMENT"]);
  assert.equal(settlement.payload.intentId, work.id);
  assert.equal(settlement.payload.paymentId, payload.paymentId);
  assert.deepEqual(context.crankerWakes, ["VERIFIED"]);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING", "AUTHORIZED_FUNDING", "AUTHORIZED_FUNDING"]);
}
