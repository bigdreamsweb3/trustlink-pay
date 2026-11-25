import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { readWork } from "./read-work.mjs";

/** Recheck the persisted phase under the transaction even when candidate selection saw signed funding. */
export async function signedFundingFilterRaceTest(fixture) {
  const context = createCaseDependencies(fixture);
  const reference = context.dependencies.workCollection.doc("phase-race");
  await reference.set({ id: "phase-race", kind: "AUTHORIZED_FUNDING", fundingPhase: "SIGNED_DEPOSIT",
    status: "RECEIVED", stateVersion: 4, payload: {} });
  const candidates = await context.dependencies.workCollection.where("status", "==", "RECEIVED").get();
  const candidate = candidates.docs[0];
  await reference.set({ ...(await readWork(context, reference.id)), fundingPhase: "AUTHORIZATION" });
  const before = await readWork(context, reference.id);
  assert.equal(before.status, "RECEIVED", "the phase race must retain otherwise claimable state");
  const claimed = await context.dependencies.db.runTransaction(fixture.claimWorkTransaction.bind(null,
    context.dependencies, candidate, "RECEIVED", "NODE_VERIFYING", "fast-node", "SIGNED_DEPOSIT"));
  assert.equal(claimed, null);
  assert.deepEqual(await readWork(context, reference.id), before);
  await reference.set({ ...before, fundingPhase: "SIGNED_DEPOSIT" });
  const signed = await readWork(context, reference.id);
  const authorization = await context.dependencies.db.runTransaction(fixture.claimWorkTransaction.bind(null,
    context.dependencies, candidate, "RECEIVED", "NODE_VERIFYING", "ordinary-node", "AUTHORIZATION"));
  assert.equal(authorization, null);
  assert.deepEqual(await readWork(context, reference.id), signed);
}
