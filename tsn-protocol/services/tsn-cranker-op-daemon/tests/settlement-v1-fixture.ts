// Offline fixture: exercise the installed DBrix builder, stop before returning
// any signature, and permit only a mocked getLatestBlockhash RPC response.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { address, getTransactionEncoder, getTransactionSizeLimit, type Transaction } from "@solana/kit";
import { createRemoteTransactionSigner, sendInstructionsV1 } from "@dbrix/solana";
import { PublicKey } from "@solana/web3.js";
import { buildTsnRegisterTcapCreditAuthorizationV3Instruction } from "../../../sdks/tsn-sdk/src/tcap-gpru-credit.js";
import { createDbrixSettlementMemoInstruction } from "../src/dbrix/settlement-memo.js";

const fixture = JSON.parse(readFileSync(0, "utf8"));
const transition = fixture.transition;
const proof = transition.proof;
const instruction = buildTsnRegisterTcapCreditAuthorizationV3Instruction({
  ...transition,
  authority: new PublicKey(fixture.authority),
  motherEscrow: new PublicKey(fixture.motherEscrow),
  config: new PublicKey(transition.tcapConfig),
  assetEntry: new PublicKey(transition.assetEntry),
  commitmentRoot: new PublicKey(transition.commitmentRoot),
  reserveState: new PublicKey(transition.reserveState),
  accountingEpoch: new PublicKey(transition.accountingEpoch),
  fundingRootAccount: new PublicKey(transition.fundingRootAccount),
  tipRouteRoot: new PublicKey(fixture.tipRouteRoot),
  gpruVerifier: new PublicKey(fixture.gpruVerifier),
});
const memo = createDbrixSettlementMemoInstruction({
  payer: new PublicKey(fixture.operator),
  document: transition.memoDocument,
  expectedSlots: transition.memoLedgerSlots,
  expectedPayload: transition.memoBodyPayload,
  expectedMemoPayload: transition.memoPayload,
  expectedCommitment: transition.memoCommitment,
  successorPortfolioRoot: proof.publicInputs[6],
  successorBalancePoint: { x: proof.publicInputs[7], y: proof.publicInputs[8] },
  actionCommitment: proof.publicInputs[3],
  encryptedBlindingDelta: proof.publicInputs[9],
  deltaEphemeralPublicX: proof.publicInputs[10],
  deltaEphemeralPublicY: proof.publicInputs[11],
});

const stopBeforeSigning = new Error("OFFLINE_FIXTURE_STOP_BEFORE_SIGNING");
let captured: Transaction | undefined;
let motherMessage: Uint8Array | undefined;
const payerSigner = {
  address: address(fixture.operator),
  async signTransactions(transactions: readonly Transaction[]) {
    assert.equal(transactions.length, 1);
    captured = transactions[0];
    throw stopBeforeSigning;
  },
};
const motherSigner = createRemoteTransactionSigner(fixture.authority, async (messageBytes) => {
  motherMessage = messageBytes;
  throw stopBeforeSigning;
});

const rpcMethods: string[] = [];
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body));
  rpcMethods.push(request.method);
  assert.equal(request.method, "getLatestBlockhash", "Offline fixture cannot submit transactions");
  return new Response(JSON.stringify({
    jsonrpc: "2.0", id: request.id,
    result: { context: { slot: 50 }, value: { blockhash: fixture.blockhash, lastValidBlockHeight: 1000 } },
  }), { headers: { "Content-Type": "application/json" } });
};

try {
  await sendInstructionsV1([instruction, memo], {
    payerSigner, additionalSigners: [motherSigner], rpcUrl: "https://offline.invalid",
  });
  assert.fail("Offline fixture must stop before signing");
} catch (error) {
  assert.equal(error, stopBeforeSigning);
}
assert.ok(captured);
assert.ok(motherMessage);
assert.deepEqual(Buffer.from(captured.messageBytes), Buffer.from(motherMessage));
assert.deepEqual(rpcMethods, ["getLatestBlockhash"]);
assert.ok(Object.values(captured.signatures).every((signature) => signature === null));
const wire = getTransactionEncoder().encode(captured);
assert.equal(wire[0], 0x81);
assert.equal(wire.length, captured.messageBytes.length + 2 * 64);
process.stdout.write(JSON.stringify({
  messageBase64: Buffer.from(captured.messageBytes).toString("base64"),
  wireBytes: wire.length,
  transactionSizeLimit: getTransactionSizeLimit(captured),
  instructionBytes: instruction.data.length,
  memoBytes: memo.data.length,
  signerCount: Object.keys(captured.signatures).length,
  accountCount: captured.messageBytes[41],
}));
