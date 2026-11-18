import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { readWork } from "./read-work.mjs";

/** Attach to the same durable work and create only the completed-payload settlement lineage. */
export async function signedAttachmentTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work, payload, evidence } = await createReadyWork(context);
  const params = attachmentParams(work);
  await context.attach(params);
  const attached = await readWork(context, work.id);
  assert.equal(attached.id, work.id);
  assert.equal(attached.fundingPhase, "SIGNED_DEPOSIT");
  assert.equal(attached.status, "RECEIVED");
  assert.equal(attached.stateVersion, work.stateVersion + 1);
  assert.equal(attached.authorizationPayloadCommitment, work.authorizationPayloadCommitment);
  assert.notEqual(attached.payloadCommitment, work.payloadCommitment);
  const finalPayload = { ...payload, senderSignedFundingTransaction: params.senderSignedFundingTransaction,
    senderFundingBlockhashContext: params.senderFundingBlockhashContext };
  assert.equal(attached.payloadCommitment, fixture.contract.payloadCommitment(finalPayload));
  assert.doesNotMatch(JSON.stringify(attached), /synthetic-owner-signed-deposit-wire|senderFundingBlockhashContext|private-1000000|private-route/);
  const node = await context.forNode(work.id);
  assert.deepEqual(node.payload, finalPayload);
  assert.deepEqual(node.authorizationPreflight, evidence.authorizationPreflight);
  assert.deepEqual(node.fundingReadinessReceiverLease, evidence.receiverLease);
  const settlementId = `settlement-${createHash("sha256").update(`${work.id}:${attached.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  const settlement = await readWork(context, settlementId);
  assert.equal(settlement.kind, "SETTLEMENT");
  assert.equal(settlement.status, "RECEIVED");
  assert.equal(settlement.payload.intentId, work.id);
  assert.equal(settlement.payload.paymentId, payload.paymentId);
  const oldSettlementId = `settlement-${createHash("sha256").update(`${work.id}:${work.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  assert.equal(await readWork(context, oldSettlementId), null);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 2);
  assert.deepEqual(await context.receive({ id: work.id, kind: "AUTHORIZED_FUNDING", payload }), attached);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING", "AUTHORIZED_FUNDING"]);
  assert.deepEqual(context.crankerWakes, []);
  assert.equal(await context.leaseCranker("synthetic-cranker", ["AUTHORIZED_FUNDING", "SETTLEMENT"]), null);
  const leased = await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"]);
  assert.equal(leased.id, work.id);
  assert.deepEqual(leased.payload, finalPayload);
  assert.deepEqual(leased.authorizationPreflight, evidence.authorizationPreflight);
  assert.deepEqual(leased.fundingReadinessReceiverLease, evidence.receiverLease);
}
