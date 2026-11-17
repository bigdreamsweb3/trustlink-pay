import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import nacl from "tweetnacl";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";
import * as sdk from "../../tsn-protocol/sdks/tsn-sdk/dist/index.js";

// Exercise the real XP route and SDK resolver/builder using synthetic RPC
// account data. No ports, real wallet approvals or chain submissions are used.
const filename = "../../protocol-tests/ui/server.mjs";
const source = ts.createSourceFile(filename, await readFile(new URL(filename, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "handleApi");
assert.ok(declaration, "XP handleApi must exist");
const handlerSource = declaration.getText(source);
const depositor = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const mint = new PublicKey(new Uint8Array(32).fill(2));
const reserve = new PublicKey(new Uint8Array(32).fill(3));
const vault = new PublicKey(new Uint8Array(32).fill(4));
const reserveAuthority = new PublicKey(new Uint8Array(32).fill(5));
const fundedSource = new PublicKey(new Uint8Array(32).fill(6));
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const program = sdk.GPRU_TCAP_PROGRAM_ID;
const [fundingRoot] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], program);
const [registry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-registry:v1")], program);
const [entry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], program);
const plain = value => JSON.parse(JSON.stringify(value));

function harness(balance = 2_000_000n, rootState = "valid") {
  const entryData = Buffer.alloc(287);
  createHash("sha256").update("account:TcapAssetEntryV1").digest().copy(entryData, 0, 0, 8);
  registry.toBuffer().copy(entryData, 12);
  entryData.writeUInt32LE(1, 44);
  tokenProgram.toBuffer().copy(entryData, 48);
  mint.toBuffer().copy(entryData, 80);
  reserve.toBuffer().copy(entryData, 148);
  vault.toBuffer().copy(entryData, 180);
  reserveAuthority.toBuffer().copy(entryData, 212);
  entryData[244] = 6;
  entryData[245] = entryData[283] = entryData[284] = 1;
  const tokenData = owner => {
    const data = Buffer.alloc(165);
    mint.toBuffer().copy(data, 0);
    owner.toBuffer().copy(data, 32);
    data.writeBigUInt64LE(balance, 64);
    return data;
  };
  const accountInfo = (owner, data) => ({ owner, data, executable: false, lamports: 1, rentEpoch: 0 });
  const connection = {
    async getAccountInfo(address) {
      if (address.equals(mint)) return accountInfo(tokenProgram, Buffer.alloc(82));
      assert.ok(address.equals(entry), "Resolver must read the canonical asset entry");
      return accountInfo(program, entryData);
    },
    async getMultipleAccountsInfo(addresses) {
      assert.deepEqual(Array.from(addresses, address => address.toBase58()), [reserve.toBase58(), vault.toBase58(), fundingRoot.toBase58()]);
      return [accountInfo(program, Buffer.alloc(128)), accountInfo(tokenProgram, tokenData(reserveAuthority)),
        rootState === "missing" ? null : accountInfo(rootState === "wrong-owner" ? tokenProgram : program, Buffer.alloc(128))];
    },
    async getTokenAccountsByOwner(owner, filter) {
      assert.ok(owner.equals(depositor) && filter.mint.equals(mint));
      return { value: [{ pubkey: fundedSource, account: accountInfo(tokenProgram, tokenData(depositor)) }] };
    },
    async getSlot() { return 100; },
  };
  const session = {
    wallet: depositor.toBase58(), csrfToken: "synthetic-test-token",
    resolvedTin: { tin: "1234567890", ownerPubkeyHash: "ab".repeat(32), expiresAt: Date.now() + 60_000 },
  };
  let blockhashReads = 0;
  const submitted = [];
  const handler = vm.runInNewContext(`${handlerSource}\nhandleApi`, {
    port: 4317, Buffer, PublicKey, createHash, AbortSignal,
    process: { env: {} }, tsnSdk: sdk,
    getSession: () => session,
    readJson: async request => request.body,
    json: (response, status, body) => Object.assign(response, { status, body }),
    resolveRpcUrl: async () => "http://127.0.0.1:1",
    createRpcReadSession: () => ({ read: operation => operation(connection) }),
    configuredNodeUrl: () => "http://127.0.0.1:1",
    fetch: async (url, options) => {
      if (String(url).endsWith("/intents")) {
        submitted.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ id: "synthetic-work", status: "RECEIVED" }) };
      }
      blockhashReads++;
      return { ok: true, json: async () => ({ recentBlockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 200, contextSlot: 100 }) };
    },
  });
  return {
    session, blockhashReads: () => blockhashReads, submitted,
    async prepare(amount = "1.25") {
      const response = {};
      await handler({ method: "POST", headers: { "x-trustlink-csrf": session.csrfToken }, body: { recipientTin: "1234567890", tokenMintAddress: mint.toBase58(), amount } }, response, { pathname: "/api/tsn/sdk/prepare-tin-credit" });
      return response;
    },
    async refresh() {
      const response = {};
      await handler({ method: "POST", headers: { "x-trustlink-csrf": session.csrfToken }, body: {} }, response,
        { pathname: "/api/tsn/sdk/refresh-tin-credit-blockhash" });
      return response;
    },
    async submit(request) {
      const response = {};
      await handler({ method: "POST", headers: { "x-trustlink-csrf": session.csrfToken }, body: { request } }, response,
        { pathname: "/api/tsn/sdk/submit-tin-credit" });
      return response;
    },
  };
}

test("XP prepares the real resolver result with numeric metadata and builds the exact deposit from the selected funded source", async () => {
  const server = harness();
  const response = await server.prepare();
  assert.equal(response.status, 200);
  const body = plain(response.body);
  assert.equal(body.decimals, 6);
  assert.equal(body.amountBaseUnits, "1250000");
  assert.equal(body.sourceTokenBalance, "2000000");
  assert.equal(body.depositAccounts.source, fundedSource.toBase58());
  assert.deepEqual(plain(server.session.pendingTinCredit.accounts), body.depositAccounts);
  assert.equal(Object.values(body.depositAccounts).every(value => typeof value === "string"), true);
  assert.equal("tokenId" in body.depositAccounts || "decimals" in body.depositAccounts || "assetEntryAccount" in body.depositAccounts, false);
  const accounts = Object.fromEntries(Object.entries(body.depositAccounts).map(([name, value]) => [name, new PublicKey(value)]));
  const note = sdk.createFundingNoteV1();
  const transaction = sdk.buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: BigInt(body.amountBaseUnits), fundingNoteCommitment: note.commitment });
  assert.equal(transaction.feePayer.toBase58(), depositor.toBase58());
  assert.equal(transaction.instructions.length, 1);
  const instruction = transaction.instructions[0];
  assert.equal(instruction.programId.toBase58(), program.toBase58());
  assert.deepEqual(instruction.keys.map(key => key.pubkey.toBase58()), [depositor, accounts.config, entry, reserve, fundedSource, vault, mint, tokenProgram, fundingRoot].map(key => key.toBase58()));
  assert.equal(instruction.data.subarray(0, 8).toString("hex"), createHash("sha256").update("global:deposit_private_funding_v1").digest().subarray(0, 8).toString("hex"));
  assert.equal(instruction.data.readBigUInt64LE(8), 1_250_000n);
  assert.equal(instruction.data.subarray(16).toString("hex"), note.commitment);
  assert.equal("fundingNote" in body || "fundingNote" in server.session.pendingTinCredit, false);
});

test("XP retains insufficient-token-balance rejection before blockhash preparation", async () => {
  const server = harness(1_000_000n);
  const response = await server.prepare();
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "INSUFFICIENT_SENDER_TOKEN_BALANCE");
  assert.equal(server.blockhashReads(), 0);
  assert.equal(server.session.pendingTinCredit, undefined);
});

test("XP retains registered token precision checks before preparation", async () => {
  const server = harness();
  const response = await server.prepare("1.0000001");
  assert.equal(response.status, 422);
  assert.equal(response.body.error, "AMOUNT_EXCEEDS_TOKEN_DECIMALS");
  assert.equal(server.blockhashReads(), 0);
  assert.equal(server.session.pendingTinCredit, undefined);
});

test("XP rejects absent or wrongly owned funding roots before requesting a blockhash", async () => {
  for (const [state, error] of [["missing", "TCAP_FUNDING_ROOT_ACCOUNT_MISSING"], ["wrong-owner", "TCAP_FUNDING_ROOT_OWNER_MISMATCH"]]) {
    const server = harness(2_000_000n, state), response = await server.prepare();
    assert.equal(response.status, 409); assert.equal(response.body.error, error);
    assert.equal(server.blockhashReads(), 0); assert.equal(server.session.pendingTinCredit, undefined);
  }
});

test("XP restricted ingress rejects invalid and substituted openings before forwarding approved work", async () => {
  const server = harness(); await server.prepare();
  const note = sdk.createFundingNoteV1(), otherNote = sdk.createFundingNoteV1();
  const accounts = Object.fromEntries(Object.entries(server.session.pendingTinCredit.accounts).map(([name, value]) => [name, new PublicKey(value)]));
  const transaction = sdk.buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: 1_250_000n, fundingNoteCommitment: note.commitment });
  transaction.recentBlockhash = PublicKey.default.toBase58();
  transaction.sign(Keypair.fromSeed(new Uint8Array(32).fill(1)));
  const authorization = sdk.createPaymentAuthorization({ senderWallet: depositor.toBase58(), senderIdentity: depositor.toBase58(),
    receiverIdentity: "tin:1234567890", tokenMintAddress: mint.toBase58(), amount: "1.25", senderFeeAmount: "0",
    totalTokenRequiredUi: "1.25", tokenDecimals: 6, fundingNoteCommitment: note.commitment });
  const request = sdk.buildPaymentAuthorizationIntentRequest({ paymentId: "synthetic-work", recipientHash: "ab".repeat(32),
    recipientTin: "1234567890", tokenMintAddress: mint.toBase58(), tokenDecimals: 6, senderWallet: depositor.toBase58(),
    senderAuthorizationMessage: authorization.message, senderAuthorizationSignature: "offline-placeholder",
    senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt,
    senderAuthorizationExpiresAt: authorization.expiresAt, senderSignedFundingTransaction: transaction.serialize().toString("base64"),
    senderFundingMode: "tcap_funded_note_v1", fundingNote: note, amount: "1.25" });
  const malformed = await server.submit({ ...request, fundingNote: { ...note, secret: "00".repeat(32) } });
  assert.equal(malformed.status, 422); assert.equal(malformed.body.error, "INVALID_PRIVATE_FUNDING_NOTE");
  const substituted = await server.submit({ ...request, fundingNote: otherNote });
  assert.equal(substituted.status, 409); assert.equal(substituted.body.error, "TIN_CREDIT_REQUEST_DIFFERS_FROM_PREPARATION");
  assert.equal(server.submitted.length, 0);
  const extraTransfer = sdk.TcapGpruTransaction.from(transaction.serialize());
  extraTransfer.add(SystemProgram.transfer({ fromPubkey: depositor, toPubkey: mint, lamports: 1 }));
  extraTransfer.sign(Keypair.fromSeed(new Uint8Array(32).fill(1)));
  const rejected = await server.submit({ ...request, senderSignedFundingTransaction: extraTransfer.serialize().toString("base64") });
  assert.equal(rejected.status, 422); assert.equal(rejected.body.error, "SIGNED_FUNDING_TRANSACTION_DIFFERS_FROM_APPROVAL");
  assert.equal(server.submitted.length, 0);
  const budgetDeposit = sdk.TcapGpruTransaction.from(transaction.serialize());
  budgetDeposit.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10n }));
  budgetDeposit.sign(Keypair.fromSeed(new Uint8Array(32).fill(1)));
  request.senderSignedFundingTransaction = budgetDeposit.serialize().toString("base64");
  const accepted = await server.submit(request);
  assert.equal(accepted.status, 200); assert.deepEqual(server.submitted[0].fundingNote, note);
  assert.equal("fundingNote" in accepted.body, false); assert.equal(server.session.pendingTinCredit, null);
});

test("XP browser binds one private note into both wallet approvals and sends its opening only in restricted ingress", async () => {
  const browserFile = "../../protocol-tests/ui/public/tsn-dapp.js";
  const browserSource = ts.createSourceFile(browserFile, await readFile(new URL(browserFile, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let payTinSource;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "payTin") payTinSource = node.getText(browserSource);
    ts.forEachChild(node, visit);
  }
  visit(browserSource); assert.ok(payTinSource);
  const prepared = plain((await harness().prepare()).body), calls = [], logs = [], signatures = [];
  const freshBlockhash = new PublicKey(new Uint8Array(32).fill(7)).toBase58();
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const browserSdk = { ...sdk, PublicKey };
  const elements = { recipientTin: { value: "1234567890" }, tinAmount: { value: "1.25" }, tinMint: { value: mint.toBase58() }, tinResolution: { after() {} } };
  const payTin = vm.runInNewContext(`${payTinSource}\npayTin`, {
    Buffer, BigInt, Error, crypto: globalThis.crypto,
    window: { TsnRecipientCreditSdk: browserSdk }, $: name => elements[name],
    requireWallet() {}, requireNetwork() {}, resolvedTin: { tin: "1234567890", ownerPubkeyHash: "ab".repeat(32), displayName: "Synthetic owner" },
    activeWallet: { publicKey: wallet.publicKey, async signTransaction(transaction) {
      transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      transaction.partialSign(wallet); return transaction;
    } },
    sign: async message => { signatures.push(message); return Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey)).toString("base64"); },
    encodeBase64: bytes => Buffer.from(bytes).toString("base64"),
    api: async (path, options) => { calls.push({ path, body: JSON.parse(options.body) }); if (path.endsWith("refresh-tin-credit-blockhash")) {
      assert.equal(signatures.length, 1, "Refresh must follow amount approval");
      return { recentBlockhash: freshBlockhash, lastValidBlockHeight: 210 };
    }
    return path.endsWith("prepare-tin-credit") ? prepared : { id: "synthetic-work" }; },
    document: { createElement: () => ({ style: {} }) }, log: (...values) => logs.push(values), watchTinCredit() {},
  });
  await payTin();
  assert.equal(calls.length, 3, JSON.stringify(logs)); assert.equal(signatures.length, 1);
  assert.equal("fundingNote" in calls[0].body, false);
  const request = calls[2].body.request, note = sdk.assertFundingNoteV1(request.fundingNote);
  assert.equal(request.senderFundingMode, "tcap_funded_note_v1");
  assert.equal(sdk.parsePaymentIntentMessage(signatures[0]).fundingNoteCommitment, note.commitment);
  assert.equal(nacl.sign.detached.verify(new TextEncoder().encode(signatures[0]), Buffer.from(request.senderAuthorizationSignature, "base64"), wallet.publicKey.toBytes()), true);
  const transaction = sdk.TcapGpruTransaction.from(Buffer.from(request.senderSignedFundingTransaction, "base64"));
  assert.equal(transaction.verifySignatures(), true);
  assert.equal(transaction.recentBlockhash, freshBlockhash);
  assert.equal(transaction.instructions.length, 2);
  const deposit = transaction.instructions.find(instruction => instruction.programId.equals(program));
  assert.equal(deposit.data.subarray(16).toString("hex"), note.commitment);
  assert.equal(signatures[0].includes(note.secret) || signatures[0].includes(note.blinding), false);
  assert.equal(JSON.stringify(logs).includes(note.secret) || JSON.stringify(logs).includes(note.blinding), false);
});

test("XP refresh requires an unexpired prepared credit and does not extend its approval window", async () => {
  const server = harness();
  assert.equal((await server.refresh()).status, 409);
  await server.prepare();
  const expiry = server.session.pendingTinCredit.expiresAt;
  assert.equal((await server.refresh()).status, 200);
  assert.equal(server.session.pendingTinCredit.expiresAt, expiry);
  server.session.pendingTinCredit.expiresAt = Date.now() - 1;
  assert.equal((await server.refresh()).status, 409);
});

async function creditWatcherHarness(responses) {
  const file = "../../protocol-tests/ui/public/tsn-dapp.js";
  const source = ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let watcher;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "watchTinCredit") watcher = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(watcher);
  const logs = [], output = {};
  let polls = 0;
  const watch = vm.runInNewContext(watcher + "\nwatchTinCredit", {
    setTimeout: resolve => resolve(), log: (...values) => logs.push(values), $: () => output,
    api: async () => responses[Math.min(polls++, responses.length - 1)],
  });
  await watch("synthetic-work");
  return { logs, output, polls };
}

test("XP displays funding FAILED as a funding failure instead of settlement waiting", async () => {
  const { logs, output } = await creditWatcherHarness([{ status: "FAILED", settlement: { status: "RECEIVED" } }]);
  assert.equal(logs[0][0], "TIN CREDIT FUNDING FAILED");
  assert.equal(logs.some(([event]) => event === "TIN CREDIT SETTLEMENT WAITING"), false);
  assert.ok(output.textContent.includes("funding FAILED"));
});

test("XP displays a nested settlement rejection and preserves its reason separately from funding", async () => {
  const fundingReason = "Reserve deposit verified";
  const settlementReason = "Private funding root is locked by an unresolved submission";
  const { logs, output, polls } = await creditWatcherHarness([{
    status: "CONFIRMED", nodeDecisionReason: fundingReason,
    settlement: { status: "REJECTED", nodeDecisionReason: settlementReason },
  }]);
  assert.equal(polls, 1, "settlement rejection must stop the watcher");
  assert.equal(logs[0][0], "TIN CREDIT SETTLEMENT REJECTED");
  assert.ok(logs[0][1].includes(settlementReason));
  assert.ok(logs[0][1].includes("Reserve funding is CONFIRMED"));
  assert.equal(logs[0][1].includes(fundingReason), false);
  assert.equal(logs.some(([event]) => event === "TIN CREDIT NODE REJECTED" || event === "TIN CREDIT SETTLED"), false);
  assert.ok(output.textContent.includes(`settlement REJECTED: ${settlementReason}`));
});

test("XP displays settlement FAILED without assuming reserve funding is confirmed", async () => {
  const settlementReason = "Submission outcome needs reconciliation";
  const { logs, output, polls } = await creditWatcherHarness([{
    status: "SUBMITTED", settlement: { status: "FAILED", nodeDecisionReason: settlementReason },
  }]);
  assert.equal(polls, 1);
  assert.equal(logs[0][0], "TIN CREDIT SETTLEMENT FAILED");
  assert.ok(logs[0][1].includes(settlementReason));
  assert.ok(logs[0][1].includes("Reserve funding is SUBMITTED"));
  assert.equal(logs.some(([event]) => event === "TIN CREDIT FUNDING FAILED" || event === "TIN CREDIT SETTLED"), false);
  assert.ok(output.textContent.includes(`settlement FAILED: ${settlementReason}`));
});

test("XP tracks nested settlement reason changes while status stays unchanged", async () => {
  const { logs, polls } = await creditWatcherHarness([
    { status: "CONFIRMED", settlement: { status: "NODE_VERIFYING", nodeDecisionReason: "" } },
    { status: "CONFIRMED", settlement: { status: "NODE_VERIFYING", nodeDecisionReason: "Checking funding root" } },
    { status: "CONFIRMED", settlement: { status: "REJECTED", nodeDecisionReason: "Funding root unavailable" } },
  ]);
  assert.equal(polls, 3);
  assert.equal(logs.filter(([event]) => event === "TIN CREDIT STATUS").length, 2);
  assert.equal(logs.at(-1)[0], "TIN CREDIT SETTLEMENT REJECTED");
});
