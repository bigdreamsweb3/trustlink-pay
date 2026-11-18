import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { createAuthorization } from "./create-authorization.mjs";
import { readWork } from "./read-work.mjs";

/** One filtered claim bypasses unrelated preparation without changing the next ordinary accounting claim. */
export async function signedFundingLeaseTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context, "signed-fast-work");
  await context.attach(attachmentParams(work));
  await context.receive({ id: "message-preparation", kind: "AUTHORIZED_FUNDING", payload: createAuthorization("message-preparation") });
  const stale = { id: "stale-tin", kind: "TIN_OPERATION", status: "NODE_VERIFYING", stateVersion: 2, payload: {},
    nodeLease: { owner: "old-node", expiresAt: new Date(0).toISOString(), leaseId: "stale-tin", version: 2 } };
  await context.dependencies.workCollection.doc(stale.id).set(stale);
  await context.dependencies.workCollection.doc("accounting-first").set({ id: "accounting-first", kind: "TCAP_EPOCH_ACCOUNTING",
    status: "RECEIVED", stateVersion: 1, payload: {} });
  const fast = await context.leaseNode("fast-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT");
  assert.equal(fast.id, work.id);
  assert.equal(fast.fundingPhase, "SIGNED_DEPOSIT");
  assert.equal(fast.status, "NODE_VERIFYING");
  assert.equal(fast.stateVersion, work.stateVersion + 2);
  assert.deepEqual(await readWork(context, stale.id), stale, "fast pass must not reclaim unrelated expired work");
  assert.equal((await readWork(context, "message-preparation")).status, "RECEIVED");
  const ordinary = await context.leaseNode("ordinary-node");
  assert.equal(ordinary.id, "accounting-first", "normal selection retains accounting priority after one funding claim");
  assert.equal((await readWork(context, stale.id)).status, "RECEIVED", "ordinary selection retains all-kind reclamation");
}
