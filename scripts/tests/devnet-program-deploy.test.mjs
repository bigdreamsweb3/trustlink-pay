import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/devnet-program-deploy.mjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devnet-deploy-test-'));
const preload = path.join(temporary, 'mock-cli.mjs');
const primary = 'https://primary.invalid/';
const backup = 'https://backup.invalid/';
const publicDevnet = 'https://api.devnet.solana.com';
let runId = 0;

// Every child command is intercepted before the wrapper imports named builtins.
// Fixture files are the only real files the wrapper reads. Neither Solana tools,
// network requests, wallet operations nor checkout mutations occur in this suite.
fs.writeFileSync(preload, String.raw`
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const originalExists = fs.existsSync;
fs.existsSync = (filename) => /trustlink-tcap-buffer-signer\.json$/.test(String(filename)) || originalExists(filename);
globalThis.fetch = () => { throw new Error('Unexpected network access in offline deployment test'); };
globalThis.setTimeout = (callback, delay, ...args) => {
  process.nextTick(callback, ...args);
  return { ref() { return this; }, unref() { return this; } };
};
Atomics.wait = () => 'timed-out';

function shellWords(source) {
  const words = [];
  let word = '', quote = null, active = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"') word += source[++index];
      else word += char;
      active = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      active = true;
    } else if (/\s/.test(char)) {
      if (active) words.push(word);
      word = ''; active = false;
    } else if (char === '\\') {
      word += source[++index]; active = true;
    } else {
      word += char; active = true;
    }
  }
  if (quote) throw new Error('Unclosed shell quote in wrapper command');
  if (active) words.push(word);
  return words;
}

const scenario = process.env.DEPLOY_TEST_SCENARIO || 'success';
const attempts = new Map();
let uploads = 0;
const goodGenesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const option = (args, name) => args[args.indexOf(name) + 1];
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (stderr) => ({ status: 1, stdout: '', stderr });
const transient = (kind, rpc) => ({
  dns: 'Error: RPC request error: cluster version query failed: error sending request for url (' + rpc + '): dns error: failed to lookup address information: Name or service not known',
  rate: 'Error: RPC request error: HTTP status client error (429 Too Many Requests) for url (' + rpc + ')',
  server: 'Error: RPC request error: HTTP status server error (503 Service Unavailable) for url (' + rpc + ')',
  timeout: 'Error: RPC request error: operation timed out while sending request to ' + rpc,
})[kind];

cp.spawnSync = (rawCommand, rawArgs, options = {}) => {
  let command = rawCommand, args = rawArgs;
  if (rawCommand === 'wsl.exe') {
    const shell = rawArgs[2];
    const actual = shellWords(shell.slice(shell.lastIndexOf(' && ') + 4));
    command = actual[0]; args = actual.slice(1);
  }
  const record = { command, args, rawCommand, rawArgs, cwd: options.cwd, env: {
    ANCHOR_PROVIDER_URL: options.env?.ANCHOR_PROVIDER_URL,
    ANCHOR_WALLET: options.env?.ANCHOR_WALLET,
    SOLANA_WALLET: options.env?.SOLANA_WALLET,
  } };
  fs.appendFileSync(process.env.DEPLOY_TEST_RECORD, JSON.stringify(record) + '\n');
  const rpc = option(args, '--url');
  const attemptKey = command + ' ' + args.slice(0, 2).join(' ') + ' ' + rpc;
  const count = (attempts.get(attemptKey) || 0) + 1;
  attempts.set(attemptKey, count);
  const onPrimary = rpc === process.env.DEPLOY_TEST_PRIMARY;

  if (command === 'npm' || command === 'anchor' || command === 'solana-keygen' || command === 'chmod' || command === 'rm') return ok();
  if (command !== 'solana') throw new Error('Unexpected CLI command: ' + command);
  if (args[0] === 'address') return ok(scenario === 'wrong_program' ? 'WrongProgramIdentity' : 'tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF');
  if (args[0] === 'genesis-hash') {
    if (scenario === 'wrong_genesis' || (scenario === 'backup_wrong_genesis' && !onPrimary)) return ok('MainnetOrOtherClusterGenesis');
    if ((scenario === 'primary_genesis_dns' && onPrimary) || scenario === 'all_genesis_dns') return fail(transient('dns', rpc));
    if (scenario === 'genesis_spawn_timeout' && onPrimary) return { status: null, error: Object.assign(new Error('spawn solana ETIMEDOUT for ' + rpc), { code: 'ETIMEDOUT', spawnargs: args }) };
    if (scenario === 'backup_wrong_genesis' && onPrimary) return fail(transient('dns', rpc));
    if (scenario === 'genesis_auth') return fail('Error: RPC request error: HTTP status client error (401 Unauthorized) for url (' + rpc + ')');
    if (scenario === 'primary_capacity_dns') return ok(goodGenesis);
    return ok(goodGenesis);
  }
  if (args[0] === 'program' && args[1] === 'show') {
    if (uploads) {
      if (scenario === 'post_show_dns') return fail(transient('dns', rpc));
      if (scenario === 'post_show_malformed') return ok('Program Id: tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF\n');
    } else {
      if (scenario === 'primary_capacity_dns' && onPrimary) return fail(transient('dns', rpc));
      if (scenario.startsWith('capacity_retry_') && count === 1) return fail(transient(scenario.slice('capacity_retry_'.length), rpc));
      if (scenario === 'capacity_auth') return fail('Error: RPC request error: HTTP status client error (403 Forbidden) for url (' + rpc + ')');
      if (scenario === 'capacity_permanent') return fail('Error: Account is not an executable program');
      if (scenario === 'capacity_numeric_512') return fail('Error: invalid account data: expected 512 bytes');
      if (scenario === 'capacity_numeric_429') return fail('Error: invalid account data: record 429 has no program owner');
      if (scenario === 'capacity_tls') return fail('Error: RPC request error: error sending request for url (' + rpc + '): invalid peer certificate: UnknownIssuer');
      if (scenario === 'capacity_malformed') return ok('Program Id: tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF\n');
      if (scenario === 'initial_deploy') return fail('Error: Unable to find the account ' + 'tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF');
    }
    const length = scenario === 'small_capacity' || (scenario === 'primary_capacity_dns' && process.env.DEPLOY_TEST_SMALL_CAPACITY === '1') ? 1000000 : 1636352;
    return ok('Program Id: tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF\nData Length: ' + length + ' bytes\n');
  }
  if (args[0] === 'program' && args[1] === 'extend') return ok();
  if (args[0] === 'program' && args[1] === 'deploy') {
    uploads += 1;
    if (scenario === 'recover_upload' && uploads === 1) return fail('Blockhash expired. Upload failed.');
    if (scenario === 'uploads_fail') return fail('Blockhash expired. Upload failed.');
    return ok('Program Id: tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF');
  }
  throw new Error('Unexpected Solana command: ' + args.join(' '));
};
cp.execFileSync = (command, args, options) => {
  const result = cp.spawnSync(command, args, options);
  if (result.status) throw Object.assign(new Error('Mock CLI failure'), result);
  return result.stdout;
};
syncBuiltinESMExports();
`);

test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

function run({ scenario = 'success', env: overrides = {}, configuredRpc = primary, automaticBuffer = false, operation = 'deploy', requested = 'tcap', wsl = false, useDefaultReadAttempts = false, importOnly = false } = {}) {
  const fixture = path.join(temporary, `run-${++runId}`);
  const workspace = path.join(fixture, 'tsn-protocol/programs/tcap-protocol');
  const artifactDirectory = path.join(workspace, 'target/deploy');
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const wallet = path.join(fixture, "wallet owner's fixture.json");
  const buffer = path.join(fixture, 'fixture-buffer.json');
  fs.writeFileSync(wallet, '[0]');
  fs.writeFileSync(buffer, '[0]');
  fs.writeFileSync(path.join(artifactDirectory, 'tcap-keypair.json'), '[0]');
  fs.writeFileSync(path.join(workspace, 'Anchor.toml'), `[provider]\ncluster = "${configuredRpc}"\nwallet = "${wallet.replaceAll('\\', '/')}"\n`);
  fs.writeFileSync(path.join(workspace, 'Cargo.lock'), 'version = 3\n');
  const artifact = fs.openSync(path.join(artifactDirectory, 'tcap.so'), 'w');
  fs.ftruncateSync(artifact, 1617120);
  fs.closeSync(artifact);
  const record = path.join(fixture, 'commands.jsonl');
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith('TRUSTLINK_DEPLOY_') || ['ANCHOR_PROVIDER_URL', 'ANCHOR_WALLET', 'SOLANA_RPC_URL', 'SOLANA_WALLET', 'NODE_OPTIONS'].includes(name)) delete env[name];
  }
  Object.assign(env, {
    TSN_NATIVE_SOLANA_TOOLS: wsl ? '0' : '1',
    TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '1',
    TRUSTLINK_DEPLOY_RECOVERY_ROUNDS: '1',
    DEPLOY_TEST_RECORD: record,
    DEPLOY_TEST_SCENARIO: scenario,
    DEPLOY_TEST_PRIMARY: configuredRpc,
  }, automaticBuffer ? {} : { TRUSTLINK_DEPLOY_BUFFER_SIGNER: buffer }, overrides);
  if (useDefaultReadAttempts) delete env.TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS;
  const args = ['--import', pathToFileURL(preload).href, ...(importOnly
    ? ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(script).href)})`]
    : [script, operation, requested])];
  const result = spawnSync(process.execPath, args, {
    cwd: fixture, env, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  const calls = fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { ...result, calls, wallet, buffer, fixture, output: `${result.stdout}\n${result.stderr}` };
}

function option(args, name) { return args[args.indexOf(name) + 1]; }
function solanaCalls(result, first, second) {
  return result.calls.filter(call => call.command === 'solana' && call.args[0] === first && (!second || call.args[1] === second));
}
function uploads(result) { return solanaCalls(result, 'program', 'deploy'); }
function writes(result) {
  return result.calls.filter(call => ['solana-keygen', 'chmod', 'rm'].includes(call.command) || (call.command === 'solana' && call.args[0] === 'program' && ['extend', 'deploy'].includes(call.args[1])));
}
function succeeds(result) { assert.equal(result.status, 0, result.output); }
function failsWithoutWrites(result) {
  assert.notEqual(result.status, 0, result.output);
  assert.deepEqual(writes(result), []);
}
function allRpcCalls(result) { return result.calls.filter(call => call.command === 'solana' && call.args.includes('--url')); }

test('workspace RPC remains primary despite generic SDK environment URLs', () => {
  const result = run({ env: { ANCHOR_PROVIDER_URL: 'https://sdk.invalid/', SOLANA_RPC_URL: 'https://other.invalid/' } });
  succeeds(result);
  assert.ok(allRpcCalls(result).every(call => option(call.args, '--url') === primary));
  assert.equal(solanaCalls(result, 'genesis-hash').length, 1);
  assert.equal(uploads(result).length, 1);
  assert.equal(option(uploads(result)[0].args, '--program-id'), 'target/deploy/tcap-keypair.json');
  assert.equal(option(uploads(result)[0].args, '--max-len'), '1636352');
  assert.equal(option(uploads(result)[0].args, '--max-sign-attempts'), '20');
  assert.ok(uploads(result)[0].args.includes('--use-rpc'));
});

test('dedicated deployment RPC override intentionally supersedes workspace and generic URLs', () => {
  const explicit = 'https://explicit.invalid/';
  const result = run({ env: { TRUSTLINK_DEPLOY_RPC_URL: explicit, ANCHOR_PROVIDER_URL: 'https://sdk.invalid/' } });
  succeeds(result);
  assert.ok(allRpcCalls(result).every(call => option(call.args, '--url') === explicit));
  assert.equal(path.resolve(option(uploads(result)[0].args, '--keypair')), path.resolve(result.wallet));
});

test('unavailable primary genesis read selects and verifies public Devnet backup', () => {
  const result = run({ scenario: 'primary_genesis_dns' });
  succeeds(result);
  const checks = solanaCalls(result, 'genesis-hash');
  assert.deepEqual(checks.map(call => option(call.args, '--url')), [primary, publicDevnet]);
  assert.ok(solanaCalls(result, 'program', 'show').every(call => option(call.args, '--url') === publicDevnet));
  assert.equal(option(uploads(result)[0].args, '--url'), publicDevnet);
});

test('three configured read attempts precede provider fallback', () => {
  const result = run({ scenario: 'primary_genesis_dns', env: { TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '3', TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: backup } });
  succeeds(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [primary, primary, primary, backup]);
});

test('default read budget performs three primary attempts before backup', () => {
  const result = run({ scenario: 'primary_genesis_dns', useDefaultReadAttempts: true });
  succeeds(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [primary, primary, primary, publicDevnet]);
});

test('a hostname containing 401 remains eligible for DNS retries and verified backup', () => {
  const rpc = 'https://401.provider.invalid/';
  const result = run({ scenario: 'primary_genesis_dns', configuredRpc: rpc, env: { TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '3' } });
  succeeds(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [rpc, rpc, rpc, publicDevnet]);
});

test('capacity-read DNS failure verifies backup and retains it for extension, upload and postcheck', () => {
  const result = run({ scenario: 'primary_capacity_dns', env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: backup, DEPLOY_TEST_SMALL_CAPACITY: '1' } });
  succeeds(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [primary, backup]);
  const extension = solanaCalls(result, 'program', 'extend');
  assert.equal(extension.length, 1);
  assert.equal(option(extension[0].args, '--url'), backup);
  assert.equal(option(uploads(result)[0].args, '--url'), backup);
  assert.equal(option(solanaCalls(result, 'program', 'show').at(-1).args, '--url'), backup);
  assert.equal(option(uploads(result)[0].args, '--max-len'), '1683456');
});

for (const kind of ['dns', 'rate', 'server', 'timeout']) {
  test(`transient ${kind} capacity error retries the same provider before fallback`, () => {
    const result = run({ scenario: `capacity_retry_${kind}`, env: { TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '3' } });
    succeeds(result);
    assert.equal(solanaCalls(result, 'genesis-hash').length, 1);
    assert.equal(solanaCalls(result, 'program', 'show').length, 3);
    assert.ok(allRpcCalls(result).every(call => option(call.args, '--url') === primary));
    assert.equal(uploads(result).length, 1);
  });
}

test('explicitly disabled provider fallback aborts unavailable reads before creating a buffer', () => {
  const result = run({ scenario: 'primary_genesis_dns', automaticBuffer: true, env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: 'none', TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '3' } });
  failsWithoutWrites(result);
  assert.equal(solanaCalls(result, 'genesis-hash').length, 3);
  assert.ok(allRpcCalls(result).every(call => option(call.args, '--url') === primary));
});

test('unavailable backup also aborts before any transaction or buffer operation', () => {
  const result = run({ scenario: 'all_genesis_dns', automaticBuffer: true, env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: backup } });
  failsWithoutWrites(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [primary, backup]);
});

for (const scenario of ['genesis_auth', 'capacity_auth', 'capacity_permanent', 'capacity_numeric_512', 'capacity_numeric_429', 'capacity_tls']) {
  test(`${scenario} is not treated as provider unavailability or an initial deployment`, () => {
    const result = run({ scenario, automaticBuffer: true, env: { TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: '3' } });
    failsWithoutWrites(result);
    assert.equal(solanaCalls(result, 'genesis-hash').length, 1);
    assert.ok(allRpcCalls(result).every(call => option(call.args, '--url') === primary));
    assert.equal(solanaCalls(result, 'program', 'show').length, scenario === 'genesis_auth' ? 0 : 1);
  });
}

test('wrong primary genesis never starts capacity inspection, buffer creation or upload', () => {
  const result = run({ scenario: 'wrong_genesis', automaticBuffer: true });
  failsWithoutWrites(result);
  assert.equal(solanaCalls(result, 'genesis-hash').length, 1);
  assert.equal(solanaCalls(result, 'program', 'show').length, 0);
  assert.match(result.output, /Devnet|genesis/i);
});

test('backup must also identify Devnet before any deployment writes', () => {
  const result = run({ scenario: 'backup_wrong_genesis', automaticBuffer: true, env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: backup } });
  failsWithoutWrites(result);
  assert.deepEqual(solanaCalls(result, 'genesis-hash').map(call => option(call.args, '--url')), [primary, backup]);
  assert.equal(solanaCalls(result, 'program', 'show').length, 0);
});

test('malformed existing-account capacity is rejected before extending or uploading', () => {
  const result = run({ scenario: 'capacity_malformed', automaticBuffer: true });
  failsWithoutWrites(result);
  assert.equal(solanaCalls(result, 'program', 'show').length, 1);
  assert.match(result.output, /capacity.*pars/i);
});

test('genuine missing-account result retains initial deployment and verifies program keypair', () => {
  const result = run({ scenario: 'initial_deploy' });
  succeeds(result);
  assert.equal(solanaCalls(result, 'address').length, 1);
  assert.equal(uploads(result).length, 1);
  assert.equal(option(uploads(result)[0].args, '--max-len'), '1683456');
  assert.equal(solanaCalls(result, 'program', 'extend').length, 0);
  assert.match(result.output, /initial deployment|not deployed/i);
});

test('transport recovery reuses one signer and provider across RPC and QUIC upload attempts', () => {
  const result = run({ scenario: 'recover_upload' });
  succeeds(result);
  const calls = uploads(result);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('--use-rpc'));
  assert.ok(calls[1].args.includes('--use-quic'));
  assert.deepEqual(calls.map(call => option(call.args, '--buffer')), [result.buffer, result.buffer]);
  assert.deepEqual(calls.map(call => option(call.args, '--url')), [primary, primary]);
});

test('exhausted upload recovery retains signer and reports chain state as unverified', () => {
  const result = run({ scenario: 'uploads_fail', automaticBuffer: true });
  assert.notEqual(result.status, 0);
  assert.equal(uploads(result).length, 2);
  assert.equal(result.calls.filter(call => call.command === 'rm').length, 0);
  assert.ok(!result.output.includes('The existing program was not replaced'));
  assert.match(result.output, /unverified|unknown|inspect|verify|reconcile/i);
});

test('post-deploy read failure preserves automatic signer and distinguishes upload success from verification', () => {
  const result = run({ scenario: 'post_show_dns', automaticBuffer: true });
  assert.notEqual(result.status, 0);
  assert.equal(uploads(result).length, 1);
  assert.equal(result.calls.filter(call => call.command === 'rm').length, 0);
  assert.match(result.output, /succeeded|success/i);
  assert.match(result.output, /verification.*incomplete|could not.*verif|not.*verified/i);
  assert.ok(!result.output.includes('flow completed'));
});

test('malformed post-deploy output retains signer and reports incomplete verification', () => {
  const result = run({ scenario: 'post_show_malformed', automaticBuffer: true });
  assert.notEqual(result.status, 0);
  assert.equal(uploads(result).length, 1);
  assert.equal(result.calls.filter(call => call.command === 'rm').length, 0);
  assert.match(result.output, /verification is incomplete/i);
});

test('automatic buffer cleanup follows successful post-deploy verification', () => {
  const result = run({ automaticBuffer: true });
  succeeds(result);
  const cleanup = result.calls.findIndex(call => call.command === 'rm');
  const finalShow = result.calls.findLastIndex(call => call.command === 'solana' && call.args[0] === 'program' && call.args[1] === 'show');
  assert.ok(cleanup > finalShow);
  assert.equal(result.calls.filter(call => call.command === 'rm').length, 1);
});

test('operator-supplied buffer signer is retained after successful deployment', () => {
  const result = run();
  succeeds(result);
  assert.equal(option(uploads(result)[0].args, '--buffer'), result.buffer);
  assert.equal(result.calls.filter(call => call.command === 'rm').length, 0);
});

test('incorrect program keypair identity aborts before any RPC deployment writes', () => {
  const result = run({ scenario: 'wrong_program', automaticBuffer: true });
  failsWithoutWrites(result);
  assert.equal(uploads(result).length, 0);
  assert.match(result.output, /expected|keypair/i);
});

test('read-attempt configuration accepts only complete integers in the documented range', () => {
  for (const value of ['0', '6', '1extra', '1.5', '-1']) {
    const result = run({ env: { TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS: value } });
    failsWithoutWrites(result);
    assert.match(result.output, /TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS/);
  }
});

test('invalid recovery-round configuration aborts before any build or CLI operation', () => {
  for (const value of ['0', '6', '1extra', '1.5', '-1']) {
    const result = run({ scenario: 'small_capacity', automaticBuffer: true, env: { TRUSTLINK_DEPLOY_RECOVERY_ROUNDS: value } });
    failsWithoutWrites(result);
    assert.deepEqual(result.calls, []);
    assert.match(result.output, /TRUSTLINK_DEPLOY_RECOVERY_ROUNDS/);
  }
});

test('malformed signing-attempt values never create a buffer, extend or upload', () => {
  for (const value of ['5junk', '5.5']) {
    const result = run({ scenario: 'small_capacity', automaticBuffer: true, env: { TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS: value } });
    failsWithoutWrites(result);
    assert.equal(solanaCalls(result, 'genesis-hash').length, 0);
    assert.match(result.output, /TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS/);
  }
});

test('invalid requested target exits without invoking build or deploy commands', () => {
  const result = run({ requested: 'unsupported' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
});

test('importing the wrapper has no build, deployment or RPC side effects', () => {
  const result = run({ importOnly: true });
  succeeds(result);
  assert.deepEqual(result.calls, []);
  assert.equal(result.stdout, '');
});

test('RPC credentials are redacted from logs and captured failure diagnostics', () => {
  const credentialRpc = 'https://synthetic-user:synthetic-password@primary.invalid/private-synthetic-token?api-key=synthetic-query-credential&token=synthetic-second-credential';
  const result = run({ scenario: 'primary_genesis_dns', configuredRpc: credentialRpc, env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: 'none' } });
  failsWithoutWrites(result);
  for (const secret of ['synthetic-user', 'synthetic-password', 'private-synthetic-token', 'synthetic-query-credential', 'synthetic-second-credential']) {
    assert.ok(!result.output.includes(secret), `Credential ${secret} leaked through wrapper output`);
  }
  assert.match(result.output, /redacted/);
  assert.equal(option(solanaCalls(result, 'genesis-hash')[0].args, '--url'), credentialRpc);
});

test('spawn timeout diagnostics redact RPC credentials and omit raw spawn arguments', () => {
  const credentialRpc = 'https://primary.invalid/private-synthetic-token?api-key=synthetic-query-credential';
  const result = run({ scenario: 'genesis_spawn_timeout', configuredRpc: credentialRpc, env: { TRUSTLINK_DEPLOY_RPC_FALLBACK_URL: 'none' } });
  failsWithoutWrites(result);
  assert.match(result.output, /ETIMEDOUT/);
  assert.ok(!result.output.includes('private-synthetic-token'));
  assert.ok(!result.output.includes('synthetic-query-credential'));
  assert.ok(!result.output.includes('spawnargs'));
});

test('WSL forwarding quotes wallet paths and translates Windows drive arguments', { skip: process.platform !== 'win32' }, () => {
  const credentialRpc = 'https://primary.invalid/?api-key=synthetic-query-credential';
  const result = run({ wsl: true, configuredRpc: credentialRpc });
  succeeds(result);
  assert.ok(result.calls.every(call => call.rawCommand === 'wsl.exe'));
  const deployment = uploads(result)[0];
  const asWsl = filename => `/mnt/${filename[0].toLowerCase()}/${filename.slice(3).replaceAll('\\', '/')}`;
  assert.equal(option(deployment.args, '--keypair'), asWsl(result.wallet));
  assert.equal(option(deployment.args, '--buffer'), asWsl(result.buffer));
  assert.equal(option(deployment.args, '--url'), credentialRpc);
  assert.ok(deployment.rawArgs[2].includes("'\"'\"'"));
  assert.ok(!result.output.includes('synthetic-query-credential'));
});
