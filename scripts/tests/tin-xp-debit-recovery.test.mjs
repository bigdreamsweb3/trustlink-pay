import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";

// Execute the actual routes/browser functions against synthetic Receiver replies without starting services.
async function sourceFunctions(file, names) {
  const source = ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.set(node.name.text, node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return names.map(name => { assert.ok(found.has(name), `Missing XP function ${name}`); return found.get(name); }).join("\n");
}

const serverSource = await sourceFunctions("../../protocol-tests/ui/server.mjs", ["handleApi"]);
const browserSource = await sourceFunctions("../../protocol-tests/ui/public/tsn-dapp.js", ["reconcileTinDebitStatus", "sendTinDebit", "resolveTinForReview"]);
const outcome = (status, fields = {}) => ({ operationId: "original-debit", kind: "TIN_DEBIT", status, ...fields });

function serverHarness(result, ok = true) {
  const session = { wallet: "synthetic-owner", csrfToken: "synthetic-csrf", pendingTinDebit: { paymentId: "original-debit" } };
  const handler = vm.runInNewContext(`${serverSource}\nhandleApi`, {
    port: 4317, AbortSignal, process: { env: {} }, mode: "local", getSession: () => session,
    json: (res, status, body) => Object.assign(res, { status, body }),
    fetch: async () => ({ ok, status: ok ? 200 : 503, json: async () => result }),
  });
  return { session, async status() {
    const response = {};
    await handler({ method: "GET", headers: {} }, response, {
      pathname: "/api/tsn/sdk/tin-debit-status", searchParams: new URLSearchParams({ workId: "original-debit" }),
    });
    return response;
  } };
}

test("XP server releases only an exact confirmed or Receiver-proven unexecuted debit", async () => {
  for (const [reply, expected] of [
    [outcome("CONFIRMED"), true], [outcome("REJECTED", { safeToReplace: true }), true],
    [outcome("FAILED", { safeToReplace: true }), true], [outcome("REJECTED"), false],
    [outcome("FAILED", { safeToReplace: false }), false], [outcome("SUBMITTED", { safeToReplace: true }), false],
    [outcome("FAILED", { safeToReplace: "true" }), false],
    [outcome("REJECTED", { safeToReplace: true, operationId: "other-debit" }), false],
    [outcome("REJECTED", { safeToReplace: true, kind: "SETTLEMENT" }), false],
  ]) {
    const server = serverHarness(reply);
    await server.status();
    assert.equal(server.session.pendingTinDebit === null, expected, JSON.stringify(reply));
  }
  const failedHttp = serverHarness(outcome("REJECTED", { safeToReplace: true }), false);
  await failedHttp.status();
  assert.equal(failedHttp.session.pendingTinDebit.paymentId, "original-debit");
});

test("querying an older debit cannot clear a newer pending request or duplicate its archived identity", async () => {
  const server = serverHarness(outcome("REJECTED", { safeToReplace: true }));
  server.session.pendingTinDebit = { paymentId: "new-debit" };
  server.session.tinDebitAttempts = [{ workId: "original-debit", owner: server.session.wallet }];
  await server.status(); await server.status();
  assert.equal(server.session.pendingTinDebit.paymentId, "new-debit");
  assert.equal(server.session.tinDebitAttempts.length, 1);
});

test("XP reconnect checks original debit status before recipient resolution and unlocks only proven nonexecution", async () => {
  for (const [reply, released] of [
    [outcome("REJECTED", { safeToReplace: true }), true], [outcome("FAILED", { safeToReplace: true }), true],
    [outcome("FAILED", { safeToReplace: false }), false], [outcome("REJECTED"), false],
    [outcome("REJECTED", { safeToReplace: true, operationId: "other-debit" }), false],
  ]) {
    let reads = 0;
    const elements = { debitRecipientTin: { value: "" }, tinDebitResolution: {} };
    const context = vm.createContext({ activeWallet: {}, ownerTinIdentity: { tin: "1234567890" },
      tinDebitInFlight: false, pendingTinDebitId: "original-debit", tinDebitRetryState: { workId: "original-debit" },
      resolvedDebitTin: null, $: id => elements[id], log: () => {}, api: async () => { reads++; return reply; },
    });
    await vm.runInContext(`${browserSource}\nsendTinDebit()`, context);
    assert.equal(reads, 1, "Status must be readable without a new recipient resolution");
    assert.equal(context.pendingTinDebitId === undefined, released, JSON.stringify(reply));
    assert.equal(context.tinDebitRetryState.workId === undefined, released);
  }
});

test("XP clears private retry material only for the exact completed original work", () => {
  for (const [reply, released] of [[outcome("REJECTED", { safeToReplace: true }), true],
    [outcome("FAILED", { safeToReplace: false }), false], [outcome("CONFIRMED"), true]]) {
    const context = vm.createContext({ pendingTinDebitId: "original-debit", tinDebitRetryState: {
      workId: "original-debit", requestJson: "synthetic private request", intent: "original intent",
    }, $: () => ({}) });
    const reconcile = vm.runInContext(`${browserSource}\nreconcileTinDebitStatus`, context);
    assert.equal(reconcile(reply, "original-debit"), released);
    assert.equal(context.tinDebitRetryState.requestJson === undefined, released);
    assert.equal(context.tinDebitRetryState.intent === undefined, released);
  }
});


test("XP debit submits its own reviewed recipient, mint and amount without using credit controls", async () => {
  const elements = {
    debitRecipientTin: { value: "2222222222" }, debitMint: { value: "debit-mint" }, debitAmount: { value: "3.5" },
    recipientTin: { value: "3333333333" }, tinMint: { value: "credit-mint" }, tinAmount: { value: "99" },
    tinDebitResolution: {}, tinResolution: { textContent: "Credit status" }, sendTinDebit: {},
  };
  let submitted, sdkCalls = 0;
  const context = vm.createContext({ activeWallet: {}, ownerTinIdentity: { tin: "1111111111" },
    tinDebitInFlight: false, pendingTinDebitId: undefined, tinDebitRetryState: {},
    resolvedTin: { tin: "3333333333" }, resolvedDebitTin: { tin: "2222222222" },
    session: { sessionId: "synthetic-session", csrfToken: "synthetic-csrf" },
    crypto: { randomUUID: () => "new-debit" }, $: id => elements[id], log: () => {},
    window: { location: { origin: "http://synthetic-xp" }, TsnTinCreationSdk: {
      Connection: class {}, sendTinDebitV1: async params => {
        sdkCalls++; submitted = params;
        params.onProgress("Synthetic debit preparation");
        return { workId: "new-debit", status: "RECEIVED" };
      },
    } }, ownerIdentityClient: {},
    api: async () => ({ operationId: "new-debit", kind: "TIN_DEBIT", status: "REJECTED", safeToReplace: true }),
  });
  await vm.runInContext(`${browserSource}\nsendTinDebit()`, context);
  assert.equal(sdkCalls, 1);
  assert.equal(submitted.recipientTin, "2222222222");
  assert.equal(submitted.tokenMintAddress, "debit-mint");
  assert.equal(submitted.amount, "3.5");
  assert.equal(elements.tinResolution.textContent, "Credit status");
  assert.equal(elements.sendTinDebit.disabled, false);
  assert.equal(context.pendingTinDebitId, undefined);

  context.resolvedDebitTin = null;
  context.resolvedTin = { tin: "2222222222" };
  await vm.runInContext("sendTinDebit()", context);
  assert.equal(sdkCalls, 1, "A credit-panel review must not authorize the debit recipient");
});

test("XP resolves debit recipients independently from the credit review and status", async () => {
  const elements = {
    debitRecipientTin: { value: "2222222222" }, recipientTin: { value: "3333333333" },
    tinDebitResolution: { replaceChildren() {}, append() {} }, tinResolution: { textContent: "Credit status" },
    sendTinDebit: {}, payTin: { disabled: true },
  };
  let resolvedRequest;
  const context = vm.createContext({ resolvedTin: { tin: "3333333333" }, resolvedDebitTin: null,
    $: id => elements[id], requireNetwork: () => {}, log: () => {},
    document: { createElement: () => ({}) },
    api: async (path, options) => {
      assert.equal(path, "/api/tsn/sdk/resolve-tin");
      resolvedRequest = JSON.parse(options.body);
      return { tin: resolvedRequest.tin, displayName: "Synthetic recipient" };
    },
  });
  await vm.runInContext(`${browserSource}\nresolveTinForReview("debit")`, context);
  assert.equal(resolvedRequest.tin, "2222222222");
  assert.equal(context.resolvedDebitTin.tin, "2222222222");
  assert.equal(context.resolvedTin.tin, "3333333333");
  assert.equal(elements.tinResolution.textContent, "Credit status");
  assert.equal(elements.payTin.disabled, true);
  assert.equal(elements.sendTinDebit.disabled, false);
});
