import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { readWork } from "./read-work.mjs";

/** Lost-response replay remains exact after another lease; altered signed bytes or context fail closed. */
export async function attachmentIdempotencyTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context);
  const params = attachmentParams(work);
  await context.attach(params);
  await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"]);
  const before = await readWork(context, work.id);
  await context.attach({ ...params, expectedVersion: 1 });
  assert.deepEqual(await readWork(context, work.id), before);
  for (const change of [
    { senderSignedFundingTransaction: "changed-owner-signed-wire" },
    { senderFundingBlockhashContext: { ...params.senderFundingBlockhashContext, blockhash: "11111111111111111111111111111113" } },
    { senderFundingBlockhashContext: { ...params.senderFundingBlockhashContext, lastValidBlockHeight: 151 } },
    { senderFundingBlockhashContext: { ...params.senderFundingBlockhashContext, contextSlot: 18 } },
    { authorizationPayloadCommitment: "ab".repeat(32) },
  ]) await assert.rejects(context.attach.bind(null, { ...params, ...change }), /CONFLICT|MISMATCH|ALREADY|COMMITMENT/);
  assert.deepEqual(await readWork(context, work.id), before);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 2);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING", "AUTHORIZED_FUNDING"]);
}
