import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNodeResponse } from '../dist/lib/fetch-node-response.js';
const id = 'a'.repeat(64);
test('pending relay resumes exactly the same request and returns its result', async t => {
  const calls = [];
  const init = { method: 'POST', headers: { authorization: 'owner approval' }, body: '{"action":"original"}' };
  const pending = new Response(JSON.stringify({error:'NODE_RELAY_PENDING'}), {status:503, headers:{'x-tsn-relay-id':id}});
  const ready = new Response('{}', {status:200});
  const operation = fetchNodeResponse(async (url, options) => { calls.push({url, ...options, headers:new Headers(options.headers)}); return calls.length === 1 ? pending : ready; }, 'https://receiver.invalid/node/intents', init);
  assert.equal(await operation, ready);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.get('x-tsn-relay-id'), id);
  assert.equal(calls[1].headers.get('authorization'), 'owner approval');
  assert.equal(calls[1].body, init.body);
  assert.equal(calls[1].url, calls[0].url);
  assert.equal(new Headers(init.headers).has('x-tsn-relay-id'), false);
});
test('domain errors, arbitrary 503s and malformed relay IDs never retry', async () => {
  for (const response of [new Response('{}',{status:409}), new Response('{}',{status:503}), new Response('{"error":"OTHER"}',{status:503,headers:{'x-tsn-relay-id':id}}), new Response('{"error":"NODE_RELAY_PENDING"}',{status:503,headers:{'x-tsn-relay-id':'bad'}})]) {
    let count=0;
    assert.equal(await fetchNodeResponse(async()=>{count++;return response;}, 'https://receiver.invalid/node/intents', {method:'POST',body:'original'}), response);
    assert.equal(count,1);
  }
});
test('transport failure does not reissue a possibly executed request', async()=>{
  let count=0;
  await assert.rejects(fetchNodeResponse(async()=>{count++;throw new Error('offline');},'https://receiver.invalid/node/intents',{method:'POST',body:'original'}),/offline/);
  assert.equal(count,1);
});
test('pending work has a bounded two-retry budget', async t=>{
  let count=0;
  const operation=fetchNodeResponse(async()=>{count++;return new Response('{"error":"NODE_RELAY_PENDING"}',{status:503,headers:{'x-tsn-relay-id':id}});},'https://receiver.invalid/node/intents',{method:'POST',body:'original'});
  assert.equal((await operation).status,503);
  assert.equal(count,3);
});
