import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import nacl from "tweetnacl";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";
import * as sdk from "../../tsn-protocol/sdks/tsn-sdk/dist/index.js";

// Parse and execute the actual XP route/browser functions against synthetic RPC.
// No ports, live wallet approvals, funding submissions or service starts occur.
const file = "../../protocol-tests/ui/server.mjs";
const source = ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const handlerSource = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "handleApi").getText(source);
const owner = Keypair.fromSeed(new Uint8Array(32).fill(1)), key = n => new PublicKey(new Uint8Array(32).fill(n));
const depositor = owner.publicKey, mint = key(2), reserve = key(3), vault = key(4), sourceAccount = key(6);
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), program = sdk.GPRU_TCAP_PROGRAM_ID;
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program)[0];
const registry = pda(Buffer.from("tcap:asset-registry:v1")), entry = pda(Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer());
const accounts = { depositor, config: pda(Buffer.from("tcap:global-config:v1")), assetEntry: entry, reserveState: reserve,
  source: sourceAccount, vault, mint, tokenProgram, tcapProgramId: program, fundingRootAccount: pda(Buffer.from("tcap:funding-root:v1")) };
const plain = value => JSON.parse(JSON.stringify(value));
const context = { blockhash: key(9).toBase58(), lastValidBlockHeight: 200, contextSlot: 100 };

function deferred() {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return { promise, resolve };
}

function harness(options = {}) {
  let { initialFailures = 0, completeFailures = 0, malformedHash = false } = options;
  const data = Buffer.alloc(287);
  createHash("sha256").update("account:TcapAssetEntryV1").digest().copy(data, 0, 0, 8);
  registry.toBuffer().copy(data, 12); data.writeUInt32LE(1, 44); tokenProgram.toBuffer().copy(data, 48); mint.toBuffer().copy(data, 80);
  reserve.toBuffer().copy(data, 148); vault.toBuffer().copy(data, 180); key(5).toBuffer().copy(data, 212);
  data[244] = 6; data[245] = data[283] = data[284] = 1;
  const reads = { metadata: 0, funds: 0, hashes: 0 }, submitted = [], completed = [], readinessRequests = [], recoveryRequests = [];
  const statusOverrides = new Map(), workIds = new Map(), outcomeGate = options.delayOutcome ? deferred() : null;
  let recoveryOutcome = options.recoveryOutcome ?? { status: "OUTCOME_UNKNOWN", reason: "Synthetic RPC did not establish the original outcome." };
  const connection = { async getAccountInfo(address) { reads.metadata++; return { owner: address.equals(mint) ? tokenProgram : program,
    data: address.equals(mint) ? Buffer.alloc(82) : data }; },
    async getMultipleAccountsInfo() { reads.funds++; throw new Error("Source/reserve checks belong to Node authorization"); },
    async getTokenAccountsByOwner() { reads.funds++; throw new Error("Balance checks belong to Node authorization"); } };
  const session = { wallet: depositor.toBase58(), csrfToken: "synthetic-csrf", resolvedTin: { tin: "1234567890", ownerPubkeyHash: "ab".repeat(32), expiresAt: Date.now() + 60000 } };
  const ready = () => ({ workId: session.pendingTinCreditOperationId ?? "synthetic-work", stateVersion: 3, authorizationPayloadCommitment: "ac".repeat(32),
    expiresAt: session.pendingTinCredit.request.senderAuthorizationExpiresAt, amountBaseUnits: "1250000",
    depositAccounts: Object.fromEntries(Object.entries(accounts).map(([name, value]) => [name, value.toBase58()])) });
  const status = (operationId = session.pendingTinCreditOperationId ?? "synthetic-work") => plain(statusOverrides.get(operationId) ?? {
    operationId, kind: "AUTHORIZED_FUNDING", status: "FUNDING_READY", stateVersion: 3, fundingPhase: "AUTHORIZATION", fundingReady: true,
    fundingReadiness: { expiresAt: ready().expiresAt, authorizationPayloadCommitment: ready().authorizationPayloadCommitment } });
  const handler = vm.runInNewContext(`${handlerSource}\nhandleApi`, {
    Buffer, PublicKey, createHash, AbortSignal, process: { env: {} }, tsnSdk: sdk, mode: "local",
    getSession: () => session, readJson: async req => req.body, json: (res, status, body) => Object.assign(res, { status, body }),
    resolveRpcUrl: async () => "http://127.0.0.1:1", createRpcReadSession: () => ({ read: operation => operation(connection) }),
    inspectTinFundingOutcome: async args => {
      recoveryRequests.push(args); if (outcomeGate) await outcomeGate.promise;
      await options.onRecoveryInspect?.({ session, statusOverrides }); return plain(recoveryOutcome);
    },
    configuredNodeUrl: () => "http://127.0.0.1:1", fetch: async (url, options) => {
      if (String(url).endsWith("/intents")) { submitted.push(JSON.parse(options.body)); if (initialFailures-- > 0) throw new Error("lost ingress response");
        const paymentId = submitted.at(-1).paymentId;
        if (!workIds.has(paymentId)) workIds.set(paymentId, workIds.size ? `synthetic-work-${workIds.size + 1}` : "synthetic-work");
        return { ok: true, json: async () => ({ id: workIds.get(paymentId), stateVersion: 1, status: "RECEIVED" }) }; }
      if (String(url).endsWith("/network/funding/readiness")) { readinessRequests.push(JSON.parse(options.body)); return { ok: true, json: async () => ready() }; }
      if (String(url).endsWith("/network/funding/complete")) { completed.push(JSON.parse(options.body)); if (completeFailures-- > 0) throw new Error("lost completion response");
        return { ok: true, json: async () => ({ id: "synthetic-work", stateVersion: 4, fundingPhase: "SIGNED_DEPOSIT", status: "RECEIVED" }) }; }
      if (String(url).includes("/api/work-status/")) return { ok: true, json: async () => status(decodeURIComponent(String(url).split("/api/work-status/")[1])) };
      reads.hashes++; return { ok: true, json: async () => ({ recentBlockhash: context.blockhash, lastValidBlockHeight: 200, ...(malformedHash ? {} : { contextSlot: 100 }) }) };
    },
  });
  const call = async (pathname, body = {}, method = "POST", operationId) => {
    const res = {}; await handler({ method, headers: { "x-trustlink-csrf": session.csrfToken }, body }, res,
      { pathname, searchParams: new URLSearchParams(operationId ? { operationId } : {}) }); return res;
  };
  return { session, reads, submitted, completed, readinessRequests, recoveryRequests, ready, status, call,
    setStatus: (work, operationId = session.pendingTinCreditOperationId ?? "synthetic-work") => statusOverrides.set(operationId, {
      operationId, kind: "AUTHORIZED_FUNDING", stateVersion: 5, fundingPhase: "SIGNED_DEPOSIT", ...plain(work) }),
    setOutcome: outcome => { recoveryOutcome = outcome; }, releaseOutcome: () => outcomeGate?.resolve(),
    recover: (operationId = "synthetic-work") => call("/api/tsn/sdk/recover-tin-credit", { operationId }),
    prepare: (amount = "1.25") => call("/api/tsn/sdk/prepare-tin-credit", { recipientTin: "1234567890", tokenMintAddress: mint.toBase58(), amount }),
    authorize: request => call("/api/tsn/sdk/submit-tin-credit", { request }),
    prepareFunding: () => call("/api/tsn/sdk/prepare-tin-credit-funding", { operationId: "synthetic-work" }),
    refresh: () => call("/api/tsn/sdk/refresh-tin-credit-blockhash", { operationId: "synthetic-work", expectedStateVersion: 3, authorizationPayloadCommitment: "ac".repeat(32) }),
    complete: completion => call("/api/tsn/sdk/complete-tin-credit", { completion }) };
}

function authorizationRequest() {
  const note = sdk.createFundingNoteV1();
  const authorization = sdk.createPaymentAuthorization({ senderWallet: depositor.toBase58(), senderIdentity: depositor.toBase58(), receiverIdentity: "tin:1234567890",
    tokenMintAddress: mint.toBase58(), tokenDecimals: 6, amount: "1.25", senderFeeAmount: "0", totalTokenRequiredUi: 1.25, fundingNoteCommitment: note.commitment });
  return sdk.buildPaymentAuthorizationIntentRequest({ paymentId: "synthetic-work", recipientHash: "ab".repeat(32), recipientTin: "1234567890", tokenMintAddress: mint.toBase58(),
    tokenDecimals: 6, senderWallet: depositor.toBase58(), senderAuthorizationMessage: authorization.message,
    senderAuthorizationSignature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(authorization.message), owner.secretKey)).toString("base64"),
    senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt, senderAuthorizationExpiresAt: authorization.expiresAt,
    senderFundingMode: "tcap_funded_note_v1", fundingNote: note, amount: "1.25" });
}

async function staged(server) {
  await server.prepare(); const request = authorizationRequest(); await server.authorize(request);
  const response = await server.prepareFunding(); assert.equal(response.status, 200); await server.refresh();
  const transaction = sdk.buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: 1250000n, fundingNoteCommitment: request.fundingNote.commitment });
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })); transaction.recentBlockhash = context.blockhash; transaction.sign(owner);
  const completion = sdk.buildCompleteTsnFundingRequest({ request, readiness: plain(response.body), workId: "synthetic-work",
    senderFundingDepositTxB64: transaction.serialize().toString("base64"), senderFundingBlockhashContext: context });
  return { request, transaction, completion };
}

test("XP prepares message metadata without source-funds checks or premature blockhash issuance", async () => {
  const server = harness(), response = await server.prepare(); assert.equal(response.status, 200);
  assert.equal(response.body.amountBaseUnits, "1250000"); assert.equal(response.body.decimals, 6);
  assert.equal(server.reads.metadata, 2); assert.equal(server.reads.funds, 0); assert.equal(server.reads.hashes, 0);
  assert.equal("depositAccounts" in response.body || "fundingNote" in response.body, false);
  assert.equal((await server.refresh()).status, 409);
});

test("XP retains registered precision validation before canonical intent approval", async () => {
  const server = harness(), response = await server.prepare("1.0000001");
  assert.equal(response.status, 422); assert.equal(response.body.error, "AMOUNT_EXCEEDS_TOKEN_DECIMALS"); assert.equal(server.reads.hashes, 0);
});

test("XP message-only ingress pins one private note and exact immutable authorization across retries", async () => {
  const server = harness(); await server.prepare(); const request = authorizationRequest();
  const old = await server.authorize({ ...request, senderFundingBlockhashContext: context }); assert.equal(old.status, 422);
  assert.equal((await server.authorize({ ...request, senderFundingDepositTxB64: "signed-wire" })).status, 422);
  const malformed = await server.authorize({ ...request, fundingNote: { ...request.fundingNote, secret: "00".repeat(32) } }); assert.equal(malformed.status, 422);
  assert.equal((await server.authorize(request)).status, 200); assert.equal((await server.authorize(request)).status, 200);
  assert.equal((await server.authorize({ ...request, paymentId: "other-work" })).status, 409);
  assert.equal(server.submitted.length, 2); assert.deepEqual(server.submitted[0], server.submitted[1]);
  assert.equal("senderSignedFundingTransaction" in server.submitted[0] || "senderFundingBlockhashContext" in server.submitted[0], false);
  assert.equal(server.reads.hashes, 0); assert.equal(server.session.pendingTinCreditOperationId, "synthetic-work");
});

test("XP owner-authenticated readiness and final wire bind the original message, note, work and issuance tuple", async () => {
  const server = harness(), { request, transaction, completion } = await staged(server);
  assert.deepEqual(server.readinessRequests[0], { workId: "synthetic-work", senderPubkey: request.senderWallet, authorizationSignature: request.senderAuthorizationSignature });
  for (const field of ["blockhash", "lastValidBlockHeight", "contextSlot"]) {
    const changed = { ...completion, senderFundingBlockhashContext: { ...context, [field]: field === "blockhash" ? key(8).toBase58() : 201 } };
    const result = await server.complete(changed); assert.equal(result.status, 409); assert.equal(result.body.error, "TIN_CREDIT_BLOCKHASH_CONTEXT_DIFFERS_FROM_ISSUANCE");
  }
  const changed = sdk.TcapGpruTransaction.from(transaction.serialize()); changed.add(SystemProgram.transfer({ fromPubkey: depositor, toPubkey: mint, lamports: 1 })); changed.sign(owner);
  assert.equal((await server.complete({ ...completion, senderFundingDepositTxB64: changed.serialize().toString("base64") })).status, 422);
  assert.equal((await server.complete(completion)).status, 200); assert.equal(server.completed.length, 1);
  assert.equal(server.completed[0].workId, "synthetic-work"); assert.deepEqual(server.session.pendingTinCredit.request.fundingNote, request.fundingNote);
  assert.deepEqual(server.completed[0].senderFundingBlockhashContext, context);
  assert.equal("fundingNote" in server.completed[0] || "senderAuthorizationMessage" in server.completed[0], false);
  assert.equal((await server.refresh()).status, 409);
});

test("XP saves ambiguous completion and permits only the identical wire retry", async () => {
  const server = harness({ completeFailures: 1 }), { completion } = await staged(server);
  await assert.rejects(server.complete(completion), /lost completion response/);
  assert.deepEqual(server.session.pendingTinCredit.completion, completion);
  assert.equal((await server.complete({ ...completion, expectedStateVersion: 4 })).status, 409);
  assert.equal((await server.call("/api/tsn/sdk/cancel-tin-credit")).status, 409);
  assert.equal((await server.complete(completion)).status, 200); assert.deepEqual(server.completed[0], server.completed[1]);
});

test("XP requires current readiness and canonical complete blockhash context", async () => {
  const server = harness({ malformedHash: true }); await server.prepare(); await server.authorize(authorizationRequest()); await server.prepareFunding();
  const badFence = await server.call("/api/tsn/sdk/refresh-tin-credit-blockhash", { operationId: "synthetic-work", expectedStateVersion: 2, authorizationPayloadCommitment: "ac".repeat(32) });
  assert.equal(badFence.status, 409); assert.equal(server.reads.hashes, 0);
  assert.equal((await server.refresh()).status, 503);
  assert.equal(server.session.pendingTinCredit.senderFundingBlockhashContext, undefined);
});

test("XP wallet change clears the pending owner approval and operation reference", async () => {
  const server = harness(); await server.prepare(); await server.authorize(authorizationRequest());
  await server.call("/api/session/wallet", { publicKey: key(7).toBase58() });
  assert.equal(server.session.pendingTinCredit, null); assert.equal(server.session.pendingTinCreditOperationId, null);
});

function browserClock() {
  let now = Date.now(), nextId = 0;
  const timers = new Map(), callbacks = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  return {
    Date: ClockDate,
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); callbacks.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); due[1].callback();
      }
    },
    ids: () => [...timers.keys()],
    invokeCancelled: id => callbacks.get(id)?.(),
    now: () => now,
  };
}

async function browserCreditHarness(options = {}) {
  const browserFile = "../../protocol-tests/ui/public/tsn-dapp.js";
  const browserSource = ts.createSourceFile(browserFile, await readFile(new URL(browserFile, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(["clearTinFundingReadinessTimer", "hasCurrentTinFundingReadiness", "renderTinFundingControls", "invalidateTinFundingApproval", "handleWalletDisconnect", "cancelTinFundingApproval", "requireCurrentTinFunding", "payTin", "watchTinFundingAuthorization", "approveTinFunding", "recoverTinCredit", "watchTinCredit"]), declarations = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) {
      const text = node.getText(browserSource);
      declarations.push(node.name.text === "watchTinCredit" ? text.replace("function watchTinCredit", "function actualWatchTinCredit") : text);
    }
    ts.forEachChild(node, visit);
  }
  visit(browserSource); assert.equal(declarations.length, names.size);
  const server = harness(options), clock = browserClock(), calls = [], logs = [], messages = [], elements = {};
  for (const name of ["payTin", "approveTinFunding", "cancelTinFunding", "recipientTin", "tinAmount", "tinMint", "tinResolution"]) elements[name] = { style: {}, after(element) { elements[element.id] = element; } };
  elements.recipientTin.value = "1234567890"; elements.tinAmount.value = "1.25"; elements.tinMint.value = mint.toBase58();
  let transactionSignatures = 0, lateReadyResolve;
  const lateReady = options.delayReadiness ? new Promise(resolve => { lateReadyResolve = resolve; }) : null;
  let lateCancelResolve, cancelFailures = options.cancelFailures ?? 0;
  const lateCancel = options.delayCancellation ? new Promise(resolve => { lateCancelResolve = resolve; }) : null;
  let lateSignResolve;
  const lateSign = options.delaySigning ? new Promise(resolve => { lateSignResolve = resolve; }) : null;
  const recoveryGate = options.delayRecoveryResponse ? deferred() : null;
  let recoveryFailures = options.recoveryFailures ?? 0, statusGate;
  const wallet = { publicKey: owner.publicKey, async signTransaction(transaction) {
    transactionSignatures++; if (lateSign) await lateSign;
    transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
    if (options.replaceBlockhash) transaction.recentBlockhash = key(8).toBase58(); transaction.partialSign(owner); return transaction;
  } };
  const instance = vm.runInNewContext(`let pendingTinCredit; let tinCreditInFlight = false; let tinCreditGeneration = 0; let tinFundingReadinessTimer; let pendingTinDebitId; const tinDebitRetryState = {};\n${declarations.join("\n")}\nfunction watchTinCredit(operationId){if(creditTrackingEnabled)return actualWatchTinCredit(operationId);}\n({payTin,approveTinFunding,cancelTinFundingApproval,recoverTinCredit,renderTinFundingControls,watchCredit:actualWatchTinCredit,getPending:()=>pendingTinCredit,getGeneration:()=>tinCreditGeneration,disconnectWallet:()=>handleWalletDisconnect(activeWallet),setWallet:wallet=>{activeWallet=wallet;renderTinFundingControls();}})`, {
    Buffer, BigInt, Error, AbortController, Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, crypto: globalThis.crypto,
    window: { TsnRecipientCreditSdk: { ...sdk, PublicKey } }, $: name => elements[name] ??= { style: {} },
    requireWallet() {}, requireNetwork() {}, setWalletConnectedView() {}, ownerTinIdentity: null, balanceController: null, balanceInFlight: null,
    creditTrackingEnabled: Boolean(options.trackCredit),
    resolvedTin: { tin: "1234567890", ownerPubkeyHash: "ab".repeat(32), displayName: "Synthetic owner" }, activeWallet: wallet,
    sign: async message => { messages.push(message); return Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), owner.secretKey)).toString("base64"); },
    encodeBase64: value => Buffer.from(value).toString("base64"),
    api: async (path, request = {}) => {
      const body = request.body ? JSON.parse(request.body) : {}; calls.push({ path, body });
      if (path.includes("tin-credit-status") && lateReady) await lateReady;
      const url = new URL(path, "http://127.0.0.1:1");
      if (path === "/api/tsn/sdk/cancel-tin-credit" && cancelFailures-- > 0) throw new Error("cancellation response unavailable");
      const result = await server.call(url.pathname, body, request.method ?? "GET", url.searchParams.get("operationId"));
      if (path === "/api/tsn/sdk/cancel-tin-credit" && lateCancel) await lateCancel;
      if (path.includes("tin-credit-status") && statusGate) await statusGate.promise;
      if (path === "/api/tsn/sdk/recover-tin-credit") {
        if (recoveryGate) await recoveryGate.promise;
        if (recoveryFailures-- > 0) throw new Error("recovery response unavailable");
      }
      if (result.status >= 400) throw new Error(result.body.error); return result.body;
    }, document: { createElement: () => ({ style: {} }) }, log: (...values) => logs.push(values),
  });
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { ...instance, server, clock, wallet, calls, logs, messages, elements, settle,
    holdStatusResponses: () => { statusGate = deferred(); }, releaseStatusResponses: () => { statusGate?.resolve(); statusGate = null; },
    releaseRecoveryResponse: () => recoveryGate?.resolve(),
    releaseReadiness: () => lateReadyResolve?.(), releaseCancellation: () => lateCancelResolve?.(), releaseSigning: () => lateSignResolve?.(), transactionSignatures: () => transactionSignatures };
}

test("XP browser signs only the canonical message before readiness and requires explicit funding approval", async () => {
  const browser = await browserCreditHarness(); await browser.payTin(); await browser.settle();
  assert.equal(browser.messages.length, 1, JSON.stringify(browser.logs)); assert.equal(browser.transactionSignatures(), 0); assert.equal(browser.server.reads.hashes, 0);
  assert.equal(browser.elements.approveTinFunding.hidden, false); assert.equal(browser.elements.approveTinFunding.textContent, "Ready to approve funding");
  assert.equal(browser.elements.approveTinFunding.disabled, false); assert.equal(browser.clock.ids().length, 1);
  const initial = browser.server.submitted[0], note = initial.fundingNote;
  await browser.approveTinFunding(); await browser.settle();
  assert.equal(browser.messages.length, 1); assert.equal(browser.transactionSignatures(), 1); assert.equal(browser.server.completed.length, 1);
  assert.equal(browser.clock.ids().length, 0, "attached funding must leave no readiness timer");
  const completion = browser.server.completed[0], transaction = sdk.TcapGpruTransaction.from(Buffer.from(completion.senderFundingDepositTxB64, "base64"));
  assert.equal(transaction.recentBlockhash, context.blockhash); assert.equal(transaction.verifySignatures(), true);
  assert.equal(transaction.instructions.find(ix => ix.programId.equals(program)).data.subarray(16).toString("hex"), note.commitment);
  assert.equal(completion.workId, browser.getPending().workId); assert.equal(browser.server.submitted.length, 1);
  assert.equal(JSON.stringify(browser.logs).includes(note.secret) || JSON.stringify(browser.logs).includes(note.blinding), false);
});

test("XP browser double clicks cannot repeat the message or funding signature", async () => {
  const browser = await browserCreditHarness(); await Promise.all([browser.payTin(), browser.payTin()]); await browser.settle();
  await Promise.all([browser.approveTinFunding(), browser.approveTinFunding()]); await browser.settle();
  assert.equal(browser.messages.length, 1); assert.equal(browser.transactionSignatures(), 1); assert.equal(browser.server.submitted.length, 1); assert.equal(browser.server.completed.length, 1);
});

test("XP browser retries lost ingress and completion responses with the same intent and exact signed wire", async () => {
  const browser = await browserCreditHarness({ initialFailures: 1, completeFailures: 1 }); await browser.payTin(); await browser.payTin(); await browser.settle();
  assert.equal(browser.messages.length, 1); assert.deepEqual(browser.server.submitted[0], browser.server.submitted[1]);
  await browser.approveTinFunding(); assert.equal(browser.elements.approveTinFunding.textContent, "Retry funding submission");
  const pending = browser.getPending(), completion = pending.completion, reads = { ...browser.server.reads }, preparations = browser.server.readinessRequests.length;
  assert.equal(browser.clock.ids().length, 0, "saved signed completion must clear its readiness timer");
  browser.clock.advance(Date.parse(pending.readiness.expiresAt) - browser.clock.now() + 1); browser.renderTinFundingControls();
  assert.equal(browser.elements.approveTinFunding.disabled, false); assert.equal(browser.elements.approveTinFunding.textContent, "Retry funding submission");
  await browser.approveTinFunding();
  assert.equal(browser.getPending().completion, completion); assert.equal(browser.transactionSignatures(), 1);
  assert.deepEqual(browser.server.completed[0], browser.server.completed[1]); assert.deepEqual(browser.server.reads, reads);
  assert.equal(browser.server.readinessRequests.length, preparations, "exact completion retry must not request another readiness decision");
});

test("XP browser cancellation fences late readiness without approving or submitting funding", async () => {
  const browser = await browserCreditHarness({ delayReadiness: true }); await browser.payTin();
  await browser.cancelTinFundingApproval(); browser.releaseReadiness(); await browser.settle();
  assert.equal(browser.getPending(), null); assert.equal(browser.elements.approveTinFunding.hidden, true);
  assert.equal(browser.transactionSignatures(), 0); assert.equal(browser.server.reads.hashes, 0); assert.equal(browser.server.completed.length, 0);
});

test("XP browser rejects a wallet-replaced blockhash before same-intent completion", async () => {
  const browser = await browserCreditHarness({ replaceBlockhash: true }); await browser.payTin(); await browser.settle(); await browser.approveTinFunding();
  assert.equal(browser.server.completed.length, 0); assert.equal(browser.logs.some(values => values.join(" ").includes("BLOCKHASH_DIFFERS_FROM_ISSUANCE")), true);
});

test("XP browser expires idle funding approval without issuing a blockhash or discarding its original work", async () => {
  const browser = await browserCreditHarness(); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), request = pending.request, readiness = pending.readiness, calls = browser.calls.length;
  browser.clock.advance(Date.parse(readiness.expiresAt) - browser.clock.now());
  assert.equal(browser.elements.approveTinFunding.disabled, true); assert.equal(browser.elements.approveTinFunding.textContent, "Funding approval expired");
  assert.match(browser.elements.tinCreditResult.textContent, /approval expired/); assert.equal(browser.clock.ids().length, 0);
  assert.equal(browser.getPending(), pending); assert.equal(pending.request, request); assert.equal(pending.readiness, readiness); assert.equal(pending.controller.signal.aborted, false);
  await browser.approveTinFunding();
  assert.equal(browser.calls.length, calls); assert.equal(browser.transactionSignatures(), 0); assert.equal(browser.server.reads.hashes, 0); assert.equal(browser.server.completed.length, 0);
});

test("XP browser refuses funding approval when cached readiness no longer matches the original work", async () => {
  const browser = await browserCreditHarness(); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), originalId = pending.workId, calls = browser.calls.length;
  pending.readiness = { ...pending.readiness, workId: "different-work" }; browser.renderTinFundingControls();
  assert.equal(browser.elements.approveTinFunding.disabled, true); assert.equal(browser.clock.ids().length, 0);
  await browser.approveTinFunding();
  assert.equal(pending.workId, originalId); assert.equal(browser.calls.length, calls); assert.equal(browser.transactionSignatures(), 0);
});

test("XP browser cancellation clears the readiness timer and fences a queued callback from a new approval", async () => {
  const browser = await browserCreditHarness(); await browser.payTin(); await browser.settle();
  const cancelledTimer = browser.clock.ids()[0]; await browser.cancelTinFundingApproval();
  assert.equal(browser.clock.ids().length, 0); assert.equal(browser.getPending(), null);
  await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), activeTimers = browser.clock.ids(); assert.equal(activeTimers.length, 1);
  browser.clock.invokeCancelled(cancelledTimer);
  assert.equal(browser.getPending(), pending); assert.deepEqual(browser.clock.ids(), activeTimers); assert.equal(browser.elements.approveTinFunding.disabled, false);
  assert.equal(browser.transactionSignatures(), 0); assert.equal(browser.server.completed.length, 0);
});

test("XP browser wallet disconnect clears unsigned readiness and preserves a signed completion for its original owner", async () => {
  const browser = await browserCreditHarness(); await browser.payTin(); await browser.settle();
  const cancelledTimer = browser.clock.ids()[0]; browser.disconnectWallet();
  assert.equal(browser.clock.ids().length, 0); assert.equal(browser.getPending(), null); assert.equal(browser.elements.approveTinFunding.hidden, true);
  browser.clock.invokeCancelled(cancelledTimer); assert.equal(browser.clock.ids().length, 0);
  const signed = await browserCreditHarness({ completeFailures: 1 }); await signed.payTin(); await signed.settle(); await signed.approveTinFunding();
  const pending = signed.getPending(), completion = pending.completion; signed.disconnectWallet();
  assert.equal(signed.getPending(), pending); assert.equal(pending.completion, completion); assert.equal(signed.elements.approveTinFunding.disabled, true);
  signed.setWallet({ publicKey: key(7) }); assert.equal(signed.elements.approveTinFunding.disabled, true);
  signed.setWallet(signed.wallet); assert.equal(signed.elements.approveTinFunding.disabled, false);
  await signed.approveTinFunding(); assert.equal(signed.transactionSignatures(), 1); assert.deepEqual(signed.server.completed[0], signed.server.completed[1]);
});

test("XP browser expiry during a wallet prompt keeps the original approval locked and prevents another signature", async () => {
  const browser = await browserCreditHarness({ delaySigning: true }); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), approval = browser.approveTinFunding(); await browser.settle();
  const readiness = pending.readiness; assert.equal(browser.transactionSignatures(), 1);
  browser.clock.advance(Date.parse(readiness.expiresAt) - browser.clock.now());
  assert.equal(browser.getPending(), pending); assert.equal(pending.readiness, readiness); assert.equal(pending.controller.signal.aborted, false);
  assert.equal(browser.elements.approveTinFunding.disabled, true); assert.equal(browser.elements.cancelTinFunding.disabled, true); assert.equal(browser.elements.recipientTin.disabled, true);
  assert.equal(browser.elements.approveTinFunding.textContent, "Funding approval expired");
  await browser.approveTinFunding(); assert.equal(browser.transactionSignatures(), 1);
  // Only the browser clock advances; SDK real-time expiry validation remains separately enforced.
  browser.releaseSigning(); await approval;
  assert.equal(browser.transactionSignatures(), 1); assert.equal(browser.server.completed.length, 1); assert.equal(browser.clock.ids().length, 0);
  assert.equal(browser.elements.cancelTinFunding.disabled, false);
});

test("XP browser cancellation serializes double clicks and prevents approval while its response is pending", async () => {
  const browser = await browserCreditHarness({ delayCancellation: true }); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), cancellation = browser.cancelTinFundingApproval(); await browser.settle();
  assert.equal(browser.elements.approveTinFunding.disabled, true); assert.equal(browser.elements.cancelTinFunding.disabled, true);
  await Promise.all([browser.cancelTinFundingApproval(), browser.approveTinFunding(), browser.payTin()]);
  assert.equal(browser.calls.filter(({ path }) => path === "/api/tsn/sdk/cancel-tin-credit").length, 1);
  assert.equal(browser.transactionSignatures(), 0); assert.equal(browser.server.reads.hashes, 0); assert.equal(browser.getPending(), pending);
  browser.releaseCancellation(); await cancellation;
  assert.equal(browser.getPending(), null); assert.equal(pending.controller.signal.aborted, true); assert.equal(browser.clock.ids().length, 0);
  assert.equal(browser.elements.payTin.disabled, false); assert.equal(browser.server.completed.length, 0);
});

test("XP browser cancellation cannot interrupt a wallet prompt or discard its uncertain signed completion", async () => {
  const browser = await browserCreditHarness({ delaySigning: true, completeFailures: 1 }); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), approval = browser.approveTinFunding(); await browser.settle();
  await browser.cancelTinFundingApproval(); assert.equal(browser.calls.some(({ path }) => path === "/api/tsn/sdk/cancel-tin-credit"), false);
  assert.equal(browser.getPending(), pending); assert.equal(pending.controller.signal.aborted, false);
  browser.releaseSigning(); await approval;
  const completion = pending.completion; assert.ok(completion); await browser.cancelTinFundingApproval();
  assert.equal(browser.getPending(), pending); assert.equal(pending.completion, completion); assert.equal(browser.transactionSignatures(), 1);
  assert.equal(browser.calls.some(({ path }) => path === "/api/tsn/sdk/cancel-tin-credit"), false);
  await browser.approveTinFunding(); assert.deepEqual(browser.server.completed[0], browser.server.completed[1]);
});

test("XP browser stale cancellation response cannot invalidate a reconnected wallet generation", async () => {
  const browser = await browserCreditHarness({ delayCancellation: true }); await browser.payTin(); await browser.settle();
  const cancellation = browser.cancelTinFundingApproval(); await browser.settle(); browser.disconnectWallet();
  await browser.server.call("/api/session/wallet", { publicKey: key(7).toBase58() }); browser.setWallet({ publicKey: key(7) });
  const generation = browser.getGeneration(); await browser.payTin();
  assert.equal(browser.messages.length, 1, "replacement approval remains serialized behind the outstanding cancellation");
  browser.releaseCancellation(); await cancellation;
  assert.equal(browser.getGeneration(), generation); assert.equal(browser.getPending(), null);
  assert.equal(browser.logs.some(([event]) => event === "TIN FUNDING APPROVAL CANCELLED"), false);
  assert.equal(browser.elements.payTin.disabled, false); assert.equal(browser.clock.ids().length, 0);
  await browser.server.call("/api/session/wallet", { publicKey: depositor.toBase58() }); browser.setWallet(browser.wallet);
  await browser.payTin(); await browser.settle();
  assert.equal(browser.messages.length, 2); assert.ok(browser.getPending().readiness); assert.equal(browser.elements.approveTinFunding.disabled, false);
});

test("XP browser failed cancellation releases controls and preserves the same unsigned authorization", async () => {
  const browser = await browserCreditHarness({ cancelFailures: 1 }); await browser.payTin(); await browser.settle();
  const pending = browser.getPending(), request = pending.request, generation = browser.getGeneration(); await browser.cancelTinFundingApproval();
  assert.equal(browser.getPending(), pending); assert.equal(pending.request, request); assert.equal(browser.getGeneration(), generation);
  assert.equal(pending.controller.signal.aborted, false); assert.equal(browser.elements.approveTinFunding.disabled, false);
  assert.equal(browser.logs.some(([event]) => event === "TIN FUNDING CANCELLATION BLOCKED"), true);
  await browser.approveTinFunding(); assert.equal(browser.transactionSignatures(), 1); assert.equal(browser.server.completed[0].workId, pending.workId);
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
  let controlsReleased = 0, timersCleared = 0, aborted = false;
  const context = {
    activeWallet: { publicKey: { toBase58: () => "synthetic-owner" } },
    pendingTinCredit: { workId: "synthetic-work", senderWallet: "synthetic-owner", controller: { abort() { aborted = true; } } }, tinCreditGeneration: 0,
    ownerTinIdentity: null, renderTinFundingControls() { controlsReleased++; }, clearTinFundingReadinessTimer() { timersCleared++; },
    setTimeout: resolve => resolve(), log: (...values) => logs.push(values), $: () => output,
    api: async () => responses[Math.min(polls++, responses.length - 1)],
  };
  const watch = vm.runInNewContext(watcher + "\nwatchTinCredit", context);
  await watch("synthetic-work");
  return { logs, output, polls, pending: context.pendingTinCredit, controlsReleased, timersCleared, aborted };
}

test("XP releases the completed approval session only after its linked settlement confirms", async () => {
  const result = await creditWatcherHarness([{ status: "CONFIRMED", settlement: { status: "CONFIRMED", result: { signature: "synthetic-confirmed-signature" } } }]);
  assert.equal(result.pending, null); assert.equal(result.controlsReleased, 1); assert.equal(result.timersCleared, 1); assert.equal(result.aborted, true);
  assert.match(result.output.textContent, /confirmed/);
});

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
