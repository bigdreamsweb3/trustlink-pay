import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
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
  const { prepareIntent, prepareFundingCompletion } = await load("authorization.ts");
  const { submitApprovedIntent } = await load("client.ts");
  const { inspectServices } = await load("network.ts");
  const { createFundingNoteV1 } = await import(pathToFileURL(path.join(sdk, "dist/gpru/funding-note.js")).href);
  const { buildTcapGpruWalletDepositTransaction, GPRU_TCAP_PROGRAM_ID } = await import(pathToFileURL(path.join(sdk, "dist/tcap-gpru-credit.js")).href);
  const owner = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const key = n => new PublicKey(new Uint8Array(32).fill(n));
  const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, GPRU_TCAP_PROGRAM_ID)[0];
  const registry = pda(Buffer.from("tcap:asset-registry:v1"));
  const accounts = { depositor: owner.publicKey, tcapProgramId: GPRU_TCAP_PROGRAM_ID, config: pda(Buffer.from("tcap:global-config:v1")),
    assetEntry: pda(Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), key(2).toBuffer()),
    reserveState: key(3), source: key(4), vault: key(5), mint: key(2), tokenProgram, fundingRootAccount: pda(Buffer.from("tcap:funding-root:v1")) };
  const input = { paymentId: "docs-offline-credit", recipientTin: "1234567890", recipientOwnerHash: "ab".repeat(32),
    senderWallet: owner.publicKey.toBase58(), tokenMint: key(2).toBase58(), tokenDecimals: 6,
    amount: "0.01", fee: "0", totalTokenRequiredUi: 0.01, nonce: "ab".repeat(16), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(),
    fundingNote: createFundingNoteV1() };
  const prepared = prepareIntent(input);
  const context = { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 200, contextSlot: 100 };
  assert.equal(prepared.authorization.amountBaseUnits, "10000");
  assert.match(prepared.authorization.message, /Recipient TIN: 1234567890/);
  assert.equal(prepared.authorization.feeBaseUnits, "0");
  // Synthetic owner approvals exercise construction without network or broadcast.
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(prepared.authorization.message), owner.secretKey)).toString("base64");
  const request = prepared.withWalletApproval(signature);
  assert.equal(request.recipientHash, input.recipientOwnerHash);
  assert.equal(request.amount, 0.01);
  assert.equal(request.senderFundingMode, "tcap_funded_note_v1");
  assert.deepEqual(request.fundingNote, input.fundingNote);
  assert.equal("senderSignedFundingTransaction" in request || "senderFundingBlockhashContext" in request, false);
  const readiness = { workId: input.paymentId, stateVersion: 3, authorizationPayloadCommitment: "ac".repeat(32), expiresAt: input.expiresAt,
    amountBaseUnits: "10000", depositAccounts: Object.fromEntries(Object.entries(accounts).map(([name, value]) => [name, value.toBase58()])) };
  const deposit = buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: 10000n, fundingNoteCommitment: input.fundingNote.commitment });
  deposit.recentBlockhash = context.blockhash; deposit.sign(owner);
  const completionInput = { request, readiness, workId: input.paymentId, senderFundingDepositTxB64: deposit.serialize().toString("base64"), senderFundingBlockhashContext: context };
  const completion = prepareFundingCompletion(completionInput);
  assert.equal(completion.workId, input.paymentId);
  assert.equal(completion.authorizationSignature, signature);
  assert.deepEqual(completion.senderFundingBlockhashContext, context);
  assert.equal("fundingNote" in completion || "senderAuthorizationMessage" in completion, false);
  assert.throws(() => prepareFundingCompletion({ ...completionInput, senderFundingBlockhashContext: { ...context, contextSlot: "100" } }), /BLOCKHASH_CONTEXT_INVALID/);
  assert.match(prepared.authorization.message, new RegExp(`Funding Note Commitment: ${input.fundingNote.commitment}`));
  assert.throws(() => prepareIntent({ ...input, recipientOwnerHash: input.recipientTin }).withWalletApproval("x"), /recipientHash/);
  assert.throws(() => prepareIntent({ ...input, amount: "0.0000001" }), /decimal|precision/i);
  let submitted;
  const accepted = await submitApprovedIntent({ nodeUrl: "https://node.invalid/", request, fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://node.invalid/intents");
    assert.equal(init.method, "POST");
    submitted = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: input.paymentId, status: "pending" }), { status: 202 });
  } });
  assert.equal(submitted.recipientHash, input.recipientOwnerHash);
  assert.equal("senderSignedFundingTransaction" in submitted || "senderFundingBlockhashContext" in submitted, false);
  assert.equal(accepted.status, "pending");
  await assert.rejects(submitApprovedIntent({ nodeUrl: "https://node.invalid", request, fetchImpl: async () => new Response("rejected", { status: 422 }) }), /422/);
  const health = await inspectServices({ nodeUrl: "https://node.invalid", receiverUrl: "https://receiver.invalid", rpcUrl: "https://rpc.invalid", fetchImpl: async (url) => {
    const body = String(url).includes("rpc") ? { result: "ok" } : String(url).includes("node") ? { value: [] } : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  } });
  assert.equal(health.readyForNativeTransactions, true);
  assert.equal(health.readyForCrossChainTransactions, false);
  console.log(JSON.stringify({ typedExamples: files.length, offlineScenarios: 13, scope: "Message-only authorization, exact same-work synthetic wallet funding completion, amount/note/context checks, HTTP acceptance/errors and health interpretation. Wallet-credit example typechecked only. No network or broadcast." }));
}
