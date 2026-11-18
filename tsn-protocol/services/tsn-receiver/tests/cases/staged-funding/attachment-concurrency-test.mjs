import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { readWork } from "./read-work.mjs";

/** Conflicting concurrent attachments produce one deposit identity and one matching settlement. */
export async function attachmentConcurrencyTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context);
  const first = attachmentParams(work), second = attachmentParams(work, { senderSignedFundingTransaction: "competing-wire" });
  const results = await Promise.allSettled([context.attach(first), context.attach(second)]);
  let successCount = 0, failureCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") successCount += 1;
    else { failureCount += 1; assert.match(String(result.reason), /CONFLICT|MISMATCH|ALREADY/); }
  }
  assert.equal(successCount, 1);
  assert.equal(failureCount, 1);
  const stored = await readWork(context, work.id);
  assert.equal(stored.stateVersion, work.stateVersion + 1);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 2);
  const node = await context.forNode(work.id);
  const winner = node.payload.senderSignedFundingTransaction === first.senderSignedFundingTransaction ? first : second;
  await context.attach(winner);
  assert.deepEqual(await readWork(context, work.id), stored);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING", "AUTHORIZED_FUNDING"]);
}
