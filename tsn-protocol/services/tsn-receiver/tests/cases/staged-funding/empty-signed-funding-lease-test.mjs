import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createAuthorization } from "./create-authorization.mjs";
import { readWork } from "./read-work.mjs";

/** A missing signed deposit is an empty queue, never a claim of message-only authorization. */
export async function emptySignedFundingLeaseTest(fixture) {
  const context = createCaseDependencies(fixture);
  await context.receive({ id: "message-only-filter", kind: "AUTHORIZED_FUNDING", payload: createAuthorization("message-only-filter") });
  const before = await readWork(context, "message-only-filter");
  assert.equal(await context.leaseNode("fast-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT"), null);
  assert.deepEqual(await readWork(context, before.id), before);
  const ordinary = await context.leaseNode("ordinary-node", ["AUTHORIZED_FUNDING"]);
  assert.equal(ordinary.id, before.id);
  assert.equal(ordinary.fundingPhase, "AUTHORIZATION");
}
