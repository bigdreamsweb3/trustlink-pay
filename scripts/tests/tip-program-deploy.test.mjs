import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-deploy-test-'));
const preload = path.join(temporary, 'mock-deployment.mjs');
// Replace fetch and spawn before named builtin imports bind. No RPC/wallet/CLI
// operation is performed by these tests; the real script still constructs args.
fs.writeFileSync(preload, `
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
globalThis.fetch=async () => ({ok:true,json:async()=>({result:'ok'})});
cp.spawn=(command,args,options)=>{
  process.stdout.write('MOCK_DEPLOY_ARGS='+JSON.stringify({command,args,cwd:options.cwd})+'\\n');
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  setTimeout(()=>{
    child.stderr.write('test upload https://rpc.example/?api-');
    child.stderr.end('key=synthetic-test-credential\\n');
    child.stdout.end('mock upload complete\\n');
    child.emit('close',process.env.TIP_TEST_FAILURE==='1'?17:0);
  },10);
  return child;
};
syncBuiltinESMExports();
`);
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

function run(overrides = {}) {
  const env = { ...process.env, ANCHOR_PROVIDER_URL: 'https://api.devnet.solana.com' };
  delete env.TRUSTLINK_DEPLOY_TRANSPORT;
  delete env.TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS;
  delete env.TIP_TEST_FAILURE;
  Object.assign(env, overrides);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/tip-program-deploy.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  const line = result.stdout.split('\n').find(line => line.startsWith('MOCK_DEPLOY_ARGS='));
  return { ...result, deployment: line && JSON.parse(line.slice('MOCK_DEPLOY_ARGS='.length)) };
}
function option(args, name) { return args[args.indexOf(name) + 1]; }

test('explicit QUIC/public RPC uses existing TIP identity and selected retry budget', () => {
  const result = run({ TRUSTLINK_DEPLOY_TRANSPORT: 'quic', TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS: '5' });
  assert.equal(result.status, 0);
  assert.equal(result.deployment.command, 'solana');
  const args = result.deployment.args;
  assert.ok(args.includes('--use-quic'));
  assert.ok(!args.includes('--use-rpc'));
  assert.ok(args.includes('--verbose'));
  assert.equal(option(args, '--url'), 'https://api.devnet.solana.com');
  assert.equal(option(args, '--max-sign-attempts'), '5');
  assert.equal(option(args, '--program-id'), 'TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT');
  assert.equal(option(args, '--keypair'), option(args, '--upgrade-authority'));
  assert.match(result.stdout, /completed successfully/);
  assert.ok(!result.stderr.includes('synthetic-test-credential'));
  assert.match(result.stderr, /api-key=<redacted>/);
});

test('default RPC transport and twenty signing rounds are preserved', () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.ok(result.deployment.args.includes('--use-rpc'));
  assert.equal(option(result.deployment.args, '--max-sign-attempts'), '20');
});

test('invalid transport never starts a deploy command', () => {
  const result = run({ TRUSTLINK_DEPLOY_TRANSPORT: 'udp' });
  assert.notEqual(result.status, 0);
  assert.equal(result.deployment, undefined);
  assert.match(result.stderr, /must be rpc or quic/);
});

test('invalid signing-round values never start a deploy command', () => {
  for (const input of ['0', '4', '5invalid', '5.5']) {
    const result = run({ TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS: input });
    assert.notEqual(result.status, 0);
    assert.equal(result.deployment, undefined);
  }
});

test('CLI failure propagates without reporting deployment success', () => {
  const result = run({ TIP_TEST_FAILURE: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exited with status 17/);
  assert.ok(!result.stdout.includes('completed successfully'));
});
