import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { readWork } from "./read-work.mjs";

/** An expired candidate that no longer matches the fast phase is untouched under the lock. */
export async function signedFundingReclamationRaceTest(fixture) {
  const context = createCaseDependencies(fixture);
  const reference = context.dependencies.workCollection.doc("reclamation-phase-race");
  await reference.set({ id: reference.id, kind: "AUTHORIZED_FUNDING", fundingPhase: "SIGNED_DEPOSIT",
    status: "NODE_VERIFYING", stateVersion: 5, payload: {},
    nodeLease: { owner: "old-node", expiresAt: new Date(0).toISOString(), leaseId: reference.id, version: 5 } });
  const candidates = await context.dependencies.workCollection.where("status", "==", "NODE_VERIFYING").get();
  const candidate = candidates.docs[0];
  await reference.set({ ...(await readWork(context, reference.id)), fundingPhase: "AUTHORIZATION" });
  const before = await readWork(context, reference.id);
  assert.equal(before.status, "NODE_VERIFYING", "the phase race must retain otherwise reclaimable state");
  await context.dependencies.db.runTransaction(fixture.reclaimExpiredWorkLease.bind(null,
    context.dependencies, candidate, "NODE_VERIFYING", "SIGNED_DEPOSIT"));
  assert.deepEqual(await readWork(context, reference.id), before);
  await context.dependencies.db.runTransaction(fixture.reclaimExpiredWorkLease.bind(null,
    context.dependencies, candidate, "NODE_VERIFYING", undefined));
  const ordinary = await readWork(context, reference.id);
  assert.equal(ordinary.status, "RECEIVED");
  assert.equal(ordinary.stateVersion, before.stateVersion + 1);
}
