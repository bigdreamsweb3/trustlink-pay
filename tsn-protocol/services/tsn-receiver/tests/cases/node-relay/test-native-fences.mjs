import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";
import { signReply } from "./sign-reply.mjs";

export async function testNativeFences(fixture) {
  const c = createRelayContext(fixture), d = c.dependencies;
  const reference = d.workCollection.doc("settlement-native");
  const lease = { owner: "operator", version: 7, leaseId: "original-lease", expiresAt: new Date(Date.now() + 180000).toISOString() };
  const work = { id: reference.id, kind: "SETTLEMENT", status: "CRANKER_LEASED", stateVersion: 7, crankerLease: lease };
  await reference.set(work);
  const request = { method: "POST", path: "/internal/settlement-authorizations/signature", search: "", headers: {}, body: JSON.stringify({workId:reference.id,crankerPubkey:"operator",messageBase64:"synthetic-message"}) };
  const first = await c.enqueueRelayRequest(d, request), again = await c.enqueueRelayRequest(d, request);
  assert.equal(first.id, again.id);
  const job = await c.claimRelayJob(d, "local-node", "SIGNING");
  await reference.set({ ...work, stateVersion: 8, crankerLease: { ...lease, version: 8 } });
  await assert.rejects(c.completeRelayJob(d, job.id, "local-node", job.version, job.requestHash, signReply(c, job)), /WORK_LEASE_INVALID/);
  const next = await c.enqueueRelayRequest(d, request);
  assert.notEqual(next.id, first.id);
  await assert.rejects(c.enqueueRelayRequest(d, request, first.id), /REQUEST_CONFLICT/);
}
