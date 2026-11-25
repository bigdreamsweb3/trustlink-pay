import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";
import { signReply } from "./sign-reply.mjs";

export async function testReplyMutations(fixture) {
  const c = createRelayContext(fixture), d = c.dependencies;
  await c.enqueueRelayRequest(d, { method: "GET", path: "/network/recent-blockhash", search: "", headers: {}, body: null });
  const job = await c.claimRelayJob(d, "local-node", "FUNDING"), reply = signReply(c, job);
  for (const changed of [{ ...reply, body: "altered" }, { ...reply, status: 201 }, { ...reply, contentType: "text/plain" }, { ...reply, signatureBase64: "bad" }]) {
    await assert.rejects(c.completeRelayJob(d, job.id, "local-node", job.version, job.requestHash, changed), /REPLY_SIGNATURE_INVALID/);
    assert.equal((await d.jobs.doc(job.id).get()).get("status"), "LEASED");
  }
  await assert.rejects(c.completeRelayJob(d, job.id, "other-node", job.version, job.requestHash, reply), /LEASE_INVALID/);
  await assert.rejects(c.completeRelayJob(d, job.id, "local-node", job.version + 1, job.requestHash, reply), /LEASE_INVALID/);
  await assert.rejects(c.completeRelayJob(d, job.id, "local-node", job.version, "00".repeat(32), reply), /LEASE_INVALID/);
}
