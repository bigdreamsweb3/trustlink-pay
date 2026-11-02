import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "../../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sdk = path.join(root, "tsn-protocol/sdks/tsn-sdk");
const examples = path.join(root, "tsn-protocol/tsn-docs/sdk/examples");
const paths = {
  "@trustlink/tsn-sdk": [path.join(sdk, "src/index.ts")],
  "@trustlink/tsn-sdk/*": [path.join(sdk, "src/*")],
  "@solana/web3.js": [path.join(sdk, "node_modules/@solana/web3.js")],
};
const files = fs.readdirSync(examples).filter((f) => f.endsWith(".ts")).map((f) => path.join(examples, f));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, paths, types: ["node"], typeRoots: [path.join(sdk, "node_modules/@types")], lib: ["lib.es2022.d.ts", "lib.dom.d.ts"] };
const program = ts.createProgram(files, options);
const errors = ts.getPreEmitDiagnostics(program);
if (errors.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(errors, { getCurrentDirectory: () => root, getCanonicalFileName: (f) => f, getNewLine: () => "\n" }));
  process.exitCode = 1;
} else {
  async function load(filename) {
    let js = ts.transpileModule(fs.readFileSync(path.join(examples, filename), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    js = js.replace(/(["'])@trustlink\/tsn-sdk(?:\/([^"']+))?\1/g, (_, quote, subpath) => JSON.stringify(pathToFileURL(path.join(sdk, "dist", (subpath ?? "index") + ".js")).href));
    return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  }
  const { prepareIntent } = await load("authorization.ts");
  const { submitApprovedIntent } = await load("client.ts");
  const { inspectServices } = await load("network.ts");
  const input = { paymentId: "docs-offline-credit", recipientTin: "1234567890", recipientOwnerHash: "ab".repeat(32),
    senderWallet: "11111111111111111111111111111111", tokenMint: "11111111111111111111111111111111", tokenDecimals: 6,
    amount: "0.01", fee: "0", totalTokenRequiredUi: 0.01, nonce: "ab".repeat(16), issuedAt: "2026-11-02T00:00:00.000Z", expiresAt: "2026-11-02T00:05:00.000Z" };
  const prepared = prepareIntent(input);
  assert.equal(prepared.authorization.amountBaseUnits, "10000");
  assert.match(prepared.authorization.message, /Recipient TIN: 1234567890/);
  assert.equal(prepared.authorization.feeBaseUnits, "0");
  // Deliberately non-authorizing mock bytes: no signatures or transactions are created.
  const request = prepared.withWalletApproval("offline-signature-placeholder", "offline-deposit-placeholder");
  assert.equal(request.recipientHash, input.recipientOwnerHash);
  assert.equal(request.amount, 0.01);
  assert.equal(request.senderFundingMode, "tcap_deposit_v2");
  assert.throws(() => prepareIntent({ ...input, recipientOwnerHash: input.recipientTin }).withWalletApproval("x", "y"), /recipientHash/);
  assert.throws(() => prepareIntent({ ...input, amount: "0.0000001" }), /decimal|precision/i);
  let submitted;
  const accepted = await submitApprovedIntent({ nodeUrl: "https://node.invalid/", request, fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://node.invalid/intents");
    assert.equal(init.method, "POST");
    submitted = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: input.paymentId, status: "pending" }), { status: 202 });
  } });
  assert.equal(submitted.recipientHash, input.recipientOwnerHash);
  assert.equal(accepted.status, "pending");
  await assert.rejects(submitApprovedIntent({ nodeUrl: "https://node.invalid", request, fetchImpl: async () => new Response("rejected", { status: 422 }) }), /422/);
  const health = await inspectServices({ nodeUrl: "https://node.invalid", receiverUrl: "https://receiver.invalid", rpcUrl: "https://rpc.invalid", fetchImpl: async (url) => {
    const body = String(url).includes("rpc") ? { result: "ok" } : String(url).includes("node") ? { value: [] } : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  } });
  assert.equal(health.readyForNativeTransactions, true);
  assert.equal(health.readyForCrossChainTransactions, false);
  console.log(JSON.stringify({ typedExamples: files.length, offlineScenarios: 8, scope: "Canonical amount/hash, request construction, HTTP acceptance/errors and health interpretation. Wallet-credit example typechecked only. No network, signatures or submission." }));
}
