import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createAuthorization } from "./create-authorization.mjs";
import { signReadiness } from "./sign-readiness.mjs";
import { readWork } from "./read-work.mjs";

/** A readiness decision must bind its exact intent, approval metadata and private evidence. */
export async function readinessAttestationTest(fixture) {
  const context = createCaseDependencies(fixture);
  const payload = createAuthorization("ready-attestation-work");
  await context.receive({ id: "ready-attestation-work", kind: "AUTHORIZED_FUNDING", payload });
  const work = await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"]);
  const before = await readWork(context, work.id);
  const evidence = signReadiness(context, work);
  const params = { id: work.id, actor: "node", owner: "synthetic-node", expectedVersion: work.stateVersion,
    status: "FUNDING_READY", evidence };
  await assert.rejects(context.transition.bind(null, { ...params, status: "VERIFIED" }), /FUNDING_DEPOSIT_NOT_ATTACHED/);
  await assert.rejects(context.transition.bind(null, { ...params, evidence: { ...evidence,
    fundingReadiness: { ...evidence.fundingReadiness, expiresAt: new Date(Date.now() + 600000).toISOString() } } }), /NODE_ATTESTATION_CONTEXT_MISMATCH/);
  await assert.rejects(context.transition.bind(null, { ...params, evidence: { ...evidence,
    nodeAttestation: { ...evidence.nodeAttestation, executionPayloadCommitment: fixture.contract.payloadCommitment({ senderSignedFundingTransaction: "premature-wire" }) } } }), /NODE_ATTESTATION_CONTEXT_MISMATCH/);
  const wrongBinding = signReadiness(context, work, { fundingReadiness: { ...evidence.fundingReadiness, authorizationPayloadCommitment: "ab".repeat(32) } });
  await assert.rejects(context.transition.bind(null, { ...params, evidence: wrongBinding }), /READINESS|AUTHORIZATION.*COMMITMENT|FUNDING.*COMMITMENT/);
  const wrongLease = signReadiness(context, work, { receiverLease: { ...evidence.receiverLease, stateVersion: work.stateVersion + 1 } });
  await assert.rejects(context.transition.bind(null, { ...params, evidence: wrongLease }), /FUNDING_READINESS_LEASE_MISMATCH/);
  assert.deepEqual(await readWork(context, work.id), before);
  assert.equal((await readWork(context, work.id)).status, "NODE_VERIFYING");
  assert.deepEqual(context.crankerWakes, []);
  await context.transition(params);
}
