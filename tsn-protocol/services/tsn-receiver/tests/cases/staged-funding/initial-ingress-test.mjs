import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createAuthorization } from "./create-authorization.mjs";
import { readWork } from "./read-work.mjs";

/** Message-only ingress is durable and idempotent without creating downstream settlement. */
export async function initialIngressTest(fixture) {
  const context = createCaseDependencies(fixture);
  const payload = createAuthorization("message-only-work");
  const input = { id: "message-only-work", kind: "AUTHORIZED_FUNDING", payload };
  const work = await context.receive(input);
  assert.equal(work.status, "RECEIVED");
  assert.equal(work.fundingPhase, "AUTHORIZATION");
  assert.equal(work.authorizationPayloadCommitment, fixture.contract.payloadCommitment(payload));
  assert.equal(work.payloadCommitment, work.authorizationPayloadCommitment);
  const stored = await readWork(context, work.id);
  assert.doesNotMatch(JSON.stringify(stored), /senderAuthorizationSignature|senderAuthorizationMessage|fundingNote|senderWallet/);
  assert.deepEqual((await context.forNode(work.id)).payload, payload);
  assert.equal((await context.dependencies.workCollection.get()).docs.length, 1);
  const again = await context.receive(input);
  assert.deepEqual(again, stored);
  assert.deepEqual(context.nodeWakes, ["AUTHORIZED_FUNDING"]);
  assert.deepEqual(context.crankerWakes, []);
  await assert.rejects(context.receive.bind(null, { ...input, payload: { ...payload, amount: 2 } }), /IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await readWork(context, work.id), stored);
  assert.equal(await context.leaseCranker("synthetic-cranker", ["AUTHORIZED_FUNDING"]), null);
}
