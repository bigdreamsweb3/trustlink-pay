import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { readWork } from "./read-work.mjs";
import { createAuthorization } from "./create-authorization.mjs";

/** Attachment validates readiness, immutable binding, version and canonical tuple before any durable mutation. */
export async function attachmentGuardsTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context);
  const params = attachmentParams(work), before = await readWork(context, work.id);
  await assert.rejects(context.attach.bind(null, { ...params, expectedVersion: work.stateVersion + 1 }), /STALE_STATE_VERSION/);
  await assert.rejects(context.attach.bind(null, { ...params, authorizationPayloadCommitment: "ab".repeat(32) }), /FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH/);
  for (const bankContext of [undefined, null, {},
    { ...params.senderFundingBlockhashContext, blockhash: "11111111111111111111111111111111" },
    { ...params.senderFundingBlockhashContext, lastValidBlockHeight: "150" },
    { ...params.senderFundingBlockhashContext, lastValidBlockHeight: 0 },
    { ...params.senderFundingBlockhashContext, contextSlot: -1 },
    { ...params.senderFundingBlockhashContext, contextSlot: "17" },
  ]) await assert.rejects(context.attach.bind(null, { ...params, senderFundingBlockhashContext: bankContext }), /SENDER_FUNDING_BLOCKHASH_CONTEXT_(REQUIRED|INVALID)/);
  await assert.rejects(context.attach.bind(null, { ...params, senderSignedFundingTransaction: "" }), /OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED/);
  assert.deepEqual(await readWork(context, work.id), before);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 1);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING"]);
  const original = (await context.forNode(work.id)).payload;
  const altered = { ...before, payload: { ...before.payload,
    nodeEncryptedPayload: context.dependencies.encryptPayloadForNode({ ...original, amount: 2 }) } };
  await context.dependencies.workCollection.doc(work.id).set(altered);
  await assert.rejects(context.attach.bind(null, params), /FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH/);
  assert.deepEqual(await readWork(context, work.id), altered);
  await context.dependencies.workCollection.doc(work.id).set(before);
  const unreadyPayload = createAuthorization("unready-funding");
  const unready = await context.receive({ id: unreadyPayload.paymentId, kind: "AUTHORIZED_FUNDING", payload: unreadyPayload });
  await assert.rejects(context.attach.bind(null, attachmentParams(unready)), /FUNDING_NOT_READY/);
  assert.equal((await readWork(context, unready.id)).fundingPhase, "AUTHORIZATION");
  await context.dependencies.workCollection.doc(work.id).set({ ...before, fundingReadiness: {
    ...before.fundingReadiness, expiresAt: new Date(Date.now() - 1).toISOString(),
  } });
  const expired = await readWork(context, work.id);
  await assert.rejects(context.attach.bind(null, params), /FUNDING_READINESS_EXPIRED/);
  assert.deepEqual(await readWork(context, work.id), expired);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 2);
}
