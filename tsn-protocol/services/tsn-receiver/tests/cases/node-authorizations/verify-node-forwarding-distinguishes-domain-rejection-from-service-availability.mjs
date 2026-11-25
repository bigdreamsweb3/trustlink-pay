import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileReceiverFixture } from '../../support/compile-receiver-fixture.mjs';

/** Durable authorization preserves domain results and bounded availability diagnostics. */
export async function verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailability() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsn-node-relay-authorization-'));
  try {
    await compileReceiverFixture(directory, ['networking/node-authorization/request-node-authorization.ts']);
    const { requestNodeAuthorization } = await import(pathToFileURL(path.join(directory, 'networking/node-authorization/request-node-authorization.mjs')).href);
    const environment = { TSN_RECEIVER_NODE_API_KEY: 'test', TSN_NODE_VERIFICATION_PUBLIC_KEY: 'test-pin' };
    const body = { workId: 'work', crankerPubkey: 'operator', messageBase64: 'dGVzdA==' };
    const calls = [];
    let result = new Response('{}', { status: 404 });
    const dependencies = { environment, request: async request => { calls.push(request); if (result instanceof Error) throw result; return result; } };
    for (const status of [200, 400, 401, 403, 404, 409, 422]) {
      result = new Response(JSON.stringify({ detail: 'domain rejection' }), { status });
      const answer = await requestNodeAuthorization(dependencies, '/internal/settlement-authorizations/signature', body);
      assert.equal(answer.configured, true);
      assert.equal(answer.response, result);
      assert.equal(answer.nodeStatus, undefined);
    }
    assert.deepEqual(calls[0], { method: 'POST', path: '/internal/settlement-authorizations/signature', search: '', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const status of [500, 502, 503, 504]) {
      result = new Response('private diagnostic must not escape', { status });
      const answer = await requestNodeAuthorization(dependencies, '/internal/settlement-authorizations/signature', body);
      assert.equal(answer.response, null);
      assert.equal(answer.nodeStatus, status);
    }
    result = new Error('private transport detail');
    assert.deepEqual(await requestNodeAuthorization(dependencies, '/internal/settlement-authorizations/signature', body), { configured: true, response: null, nodeStatus: undefined });
    result = new Error('NODE_RELAY_WORK_NOT_FOUND');
    const missing = await requestNodeAuthorization(dependencies, '/internal/settlement-authorizations/signature', body);
    assert.equal(missing.response.status, 404);
    assert.deepEqual(await missing.response.json(), { detail: 'Receiver work was not found' });
    const count = calls.length;
    for (const config of [{}, { TSN_RECEIVER_NODE_API_KEY: 'test' }, { TSN_NODE_VERIFICATION_PUBLIC_KEY: 'test-pin' }]) {
      assert.deepEqual(await requestNodeAuthorization({ ...dependencies, environment: config }, '/internal/settlement-authorizations/signature', body), { configured: false, response: null, nodeStatus: undefined });
    }
    assert.equal(calls.length, count);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
