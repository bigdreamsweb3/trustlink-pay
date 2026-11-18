import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { createPaymentAuthorization, buildPaymentAuthorizationIntentRequest } from "../dist/payment-authorization.js";
import { createFundingNoteV1 } from "../dist/gpru/funding-note.js";
import { assertTsnFundingReadiness, buildCompleteTsnFundingRequest, waitForTsnFundingReadiness } from "../dist/funding-authorization.js";
import { buildTcapGpruWalletDepositTransaction, GPRU_TCAP_PROGRAM_ID } from "../dist/tcap-gpru-credit.js";

function fixture() {
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(1)), key = value => new PublicKey(new Uint8Array(32).fill(value));
  const mint = key(2), tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), program = GPRU_TCAP_PROGRAM_ID;
  const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program)[0];
  const registry = pda(Buffer.from("tcap:asset-registry:v1"));
  const accounts = { depositor: wallet.publicKey, tcapProgramId: program, config: pda(Buffer.from("tcap:global-config:v1")),
    assetEntry: pda(Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()),
    reserveState: key(3), source: key(4), vault: key(5), mint, tokenProgram, fundingRootAccount: pda(Buffer.from("tcap:funding-root:v1")) };
  const note = createFundingNoteV1();
  const authorization = createPaymentAuthorization({ senderWallet: wallet.publicKey.toBase58(), senderIdentity: wallet.publicKey.toBase58(),
    receiverIdentity: "tin:1234567890", tokenMintAddress: mint.toBase58(), tokenDecimals: 6, amount: "1.25", senderFeeAmount: "0",
    totalTokenRequiredUi: 1.25, fundingNoteCommitment: note.commitment });
  const request = buildPaymentAuthorizationIntentRequest({ paymentId: "original-payment", recipientHash: "ab".repeat(32), recipientTin: "1234567890",
    tokenMintAddress: mint.toBase58(), tokenDecimals: 6, senderWallet: wallet.publicKey.toBase58(), senderAuthorizationMessage: authorization.message,
    senderAuthorizationSignature: "owner-message-signature", senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt,
    senderAuthorizationExpiresAt: authorization.expiresAt, senderFundingMode: "tcap_funded_note_v1", fundingNote: note, amount: "1.25" });
  const ready = { workId: "original-work", stateVersion: 3, authorizationPayloadCommitment: "ac".repeat(32), expiresAt: authorization.expiresAt,
    amountBaseUnits: "1250000", depositAccounts: Object.fromEntries(Object.entries(accounts).map(([name, value]) => [name, value.toBase58()])) };
  const context = { blockhash: key(9).toBase58(), lastValidBlockHeight: 200, contextSlot: 100 };
  const transaction = buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: 1250000n, fundingNoteCommitment: note.commitment });
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
  transaction.recentBlockhash = context.blockhash; transaction.sign(wallet);
  return { wallet, note, authorization, request, ready, context, transaction };
}

test("staged funding preserves one intent authorization and attaches only the original approved deposit", () => {
  const f = fixture(), original = JSON.stringify(f.request);
  const checked = assertTsnFundingReadiness(f.ready, f.request, f.ready.workId);
  assert.deepEqual(checked, f.ready); assert.notEqual(checked.depositAccounts, f.ready.depositAccounts);
  const completion = buildCompleteTsnFundingRequest({ request: f.request, readiness: checked, workId: f.ready.workId,
    senderFundingDepositTxB64: f.transaction.serialize().toString("base64"), senderFundingBlockhashContext: f.context });
  assert.equal(completion.workId, f.ready.workId); assert.equal(completion.expectedStateVersion, 3);
  assert.equal(completion.authorizationSignature, f.request.senderAuthorizationSignature);
  assert.equal(completion.senderFundingDepositTxB64, f.transaction.serialize().toString("base64"));
  assert.deepEqual(completion.senderFundingBlockhashContext, f.context);
  assert.equal(JSON.stringify(f.request), original);
  assert.equal("fundingNote" in completion || "senderAuthorizationMessage" in completion || "paymentId" in completion, false);
});

test("readiness rejects other work, amount, expired authorization and substituted canonical accounts", () => {
  const f = fixture();
  for (const change of [{ workId: "other" }, { stateVersion: 0 }, { authorizationPayloadCommitment: "bad" },
    { amountBaseUnits: "1250001" }, { expiresAt: new Date(Date.now() - 1).toISOString() },
    { expiresAt: new Date(Date.parse(f.authorization.expiresAt) + 1).toISOString() }]) {
    assert.throws(() => assertTsnFundingReadiness({ ...f.ready, ...change }, f.request, f.ready.workId), /READINESS_DIFFERS/);
  }
  for (const name of ["depositor", "mint", "config", "assetEntry", "fundingRootAccount", "tcapProgramId"]) {
    assert.throws(() => assertTsnFundingReadiness({ ...f.ready, depositAccounts: { ...f.ready.depositAccounts, [name]: f.ready.depositAccounts.source } }, f.request, f.ready.workId), /ACCOUNTS_DIFFERS/);
  }
  assert.throws(() => assertTsnFundingReadiness({ ...f.ready, depositAccounts: { ...f.ready.depositAccounts, source: PublicKey.default.toBase58() } }, f.request, f.ready.workId), /ACCOUNTS_INVALID/);
});

test("completion rejects a wallet-replaced blockhash and unauthorized extra transfer", () => {
  const f = fixture();
  f.transaction.recentBlockhash = new PublicKey(new Uint8Array(32).fill(8)).toBase58(); f.transaction.sign(f.wallet);
  assert.throws(() => buildCompleteTsnFundingRequest({ request: f.request, readiness: f.ready, workId: f.ready.workId,
    senderFundingDepositTxB64: f.transaction.serialize().toString("base64"), senderFundingBlockhashContext: f.context }), /BLOCKHASH_DIFFERS/);
  f.transaction.recentBlockhash = f.context.blockhash;
  f.transaction.add(SystemProgram.transfer({ fromPubkey: f.wallet.publicKey, toPubkey: new PublicKey(new Uint8Array(32).fill(19)), lamports: 1 }));
  f.transaction.sign(f.wallet);
  assert.throws(() => buildCompleteTsnFundingRequest({ request: f.request, readiness: f.ready, workId: f.ready.workId,
    senderFundingDepositTxB64: f.transaction.serialize().toString("base64"), senderFundingBlockhashContext: f.context }), /EXTRA_INSTRUCTION_INVALID/);
});

test("readiness polling retries status transport failure and never returns a different work", async () => {
  let polls = 0;
  const ready = { operationId: "work", status: "FUNDING_READY", stateVersion: 3, fundingPhase: "AUTHORIZATION", fundingReady: true,
    fundingReadiness: { expiresAt: new Date(Date.now() + 10000).toISOString(), authorizationPayloadCommitment: "ac".repeat(32) } };
  const result = await waitForTsnFundingReadiness({ workId: "work", pollIntervalMs: 1, timeoutMs: 1000, getStatus: async () => {
    if (++polls === 1) throw new Error("temporary read failure"); return polls === 2 ? { ...ready, status: "NODE_VERIFYING", fundingReady: false } : ready;
  } });
  assert.equal(result, ready); assert.equal(polls, 3);
  await assert.rejects(waitForTsnFundingReadiness({ workId: "other", getStatus: async () => ready }), /OPERATION_MISMATCH/);
  await assert.rejects(waitForTsnFundingReadiness({ workId: "work", getStatus: async () => ({ ...ready, status: "REJECTED", fundingReady: false }) }), /AUTHORIZATION_ENDED/);
});

test("cancelling readiness polling prevents a late ready response from enabling approval", async () => {
  const controller = new AbortController();
  await assert.rejects(waitForTsnFundingReadiness({ workId: "work", signal: controller.signal, getStatus: async () => {
    controller.abort(new Error("cancelled"));
    return { operationId: "work", status: "FUNDING_READY", stateVersion: 3, fundingPhase: "AUTHORIZATION", fundingReady: true };
  } }), /cancelled/);
});
