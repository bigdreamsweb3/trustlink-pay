import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";
import { signReply } from "./sign-reply.mjs";

export async function testEncryptedRoundtrip(fixture) {
  const c = createRelayContext(fixture), d = c.dependencies;
  const request = { method: "POST", path: "/network/funding/readiness", search: "", headers: { authorization: "synthetic-private-header" }, body: '{"ownerApproval":"synthetic-private-approval"}' };
  const created = await c.enqueueRelayRequest(d, request);
  const stored = (await d.jobs.doc(created.id).get()).data();
  assert.equal(JSON.stringify(stored).includes("synthetic-private"), false);
  assert.equal((await d.activity.get()).get("revision"), 1);
  const claimed = await c.claimRelayJob(d, "local-node", "FUNDING");
  assert.deepEqual(claimed.request, request);
  assert.equal(await c.claimRelayJob(d, "other-node", "FUNDING"), null);
  const renewed = await c.renewRelayJob(d, claimed.id, "local-node", claimed.version, claimed.requestHash);
  assert.equal(renewed.version, claimed.version);
  const reply = signReply(c, claimed, '{"privateResult":"synthetic-private-result"}');
  const completed = await c.completeRelayJob(d, claimed.id, "local-node", claimed.version, claimed.requestHash, reply);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(JSON.stringify((await d.jobs.doc(claimed.id).get()).data()).includes("synthetic-private-result"), false);
  assert.equal((await d.activity.get()).get("active").FUNDING, 0);
  assert.deepEqual(await c.completeRelayJob(d, claimed.id, "local-node", claimed.version, claimed.requestHash, reply), completed);
  const response = await c.waitRelayReply(d, claimed.id, claimed.requestHash);
  assert.equal(await response.text(), reply.body);
}
