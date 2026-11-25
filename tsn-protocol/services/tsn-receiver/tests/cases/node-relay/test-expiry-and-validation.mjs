import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";

export async function testExpiryAndValidation(fixture) {
  const c = createRelayContext(fixture), d = c.dependencies;
  const request = { method: "GET", path: "/network/recent-blockhash", search: "", headers: {}, body: null };
  for (const change of [{path:"http://evil.invalid"},{path:"/internal/execute-command"},{path:"/network/../internal/settlement-authorizations/signature"},{headers:{"x-api-key":"forged"}},{body:"not-null"}]) {
    await assert.rejects(c.enqueueRelayRequest(d, {...request,...change}), /REQUEST_INVALID/);
  }
  const job = await c.enqueueRelayRequest(d, request);
  await d.jobs.doc(job.id).set({ ...job, expiresAt: new Date(0).toISOString() });
  assert.equal(await c.claimRelayJob(d, "local-node", "FUNDING"), null);
  assert.equal((await d.jobs.doc(job.id).get()).get("status"), "EXPIRED");
  assert.equal((await d.activity.get()).get("active").FUNDING, 0);
  const response = await c.waitRelayReply(d, job.id, job.requestHash);
  assert.equal(response.status, 409);
  const cursor = await c.syncLocalNode(d, "", 0);
  assert.equal(cursor.cursor, 1);
  await c.signalLocalNode(d);
  assert.equal((await c.syncLocalNode(d, cursor.epoch, cursor.cursor)).cursor, 2);
}
