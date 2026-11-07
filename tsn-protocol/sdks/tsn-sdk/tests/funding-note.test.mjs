import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { createFundingNoteV1, assertFundingNoteV1, deriveFundingNoteCommitmentV1,
  deriveFundingNullifierV1, deriveFundedLeafV1, GPRU_FUNDING_FIELD_MODULUS } from "../dist/gpru/funding-note.js";
import { createPaymentAuthorization, createCrossChainPaymentAuthorization, buildPaymentAuthorizationIntentRequest } from "../dist/payment-authorization.js";
import { buildTcapGpruWalletDepositTransaction, buildTsnRegisterTcapCreditAuthorizationV3Instruction, GPRU_TCAP_PROGRAM_ID, GPRU_PROGRAM_ID } from "../dist/tcap-gpru-credit.js";
import { parsePaymentIntentMessage, parseCrossChainPaymentIntentMessage } from "../dist/canonical-message.js";

const h = value => BigInt(value).toString(16).padStart(64, "0");
const note = { version: 1, secret: h(1), blinding: h(2), commitment: deriveFundingNoteCommitmentV1(h(1), h(2)) };

test("funding note, leaf and nullifier match the shared Poseidon vectors and bind actual token/amount", () => {
  assert.equal(note.commitment, "25e2b221e22ce1d857cb8b21b104432d92f39acf19f14b45818a471f03bf1756");
  assert.equal(deriveFundingNullifierV1(note.secret), "1ee2226d38d357bcd4ed079b93ff555c1af28a4b5ff97562deec82704fcc6485");
  assert.equal(deriveFundedLeafV1(note.commitment, 7, 1000n), "1c546aeaea68bc79050f46c8926e37ff7d0753ca5b2b2dcbd19295c3320c9838");
  assert.equal(deriveFundedLeafV1(note.commitment, 8, 1000n), "113366f2cc710256d8189ae852c52480b329339db93ce791801ce86fa783e03b");
  assert.equal(deriveFundedLeafV1(note.commitment, 7, 1001n), "188775286288109cd25168cde0623b76f221ac9956b21583ac0eddb41ba81f6f");
  assert.notEqual(deriveFundingNoteCommitmentV1(h(1), h(3)), note.commitment);
  assert.notEqual(deriveFundingNullifierV1(h(2)), deriveFundingNullifierV1(h(1)));
});

test("random notes use canonical independent openings and malformed or substituted openings fail", () => {
  const notes = Array.from({ length: 16 }, () => createFundingNoteV1());
  assert.equal(new Set(notes.map(value => value.commitment)).size, notes.length);
  for (const value of notes) assert.deepEqual(assertFundingNoteV1(value), value);
  assert.throws(() => assertFundingNoteV1({ ...note, secret: h(0) }), /nonzero canonical/);
  assert.throws(() => assertFundingNoteV1({ ...note, secret: h(GPRU_FUNDING_FIELD_MODULUS) }), /nonzero canonical/);
  assert.throws(() => assertFundingNoteV1({ ...note, secret: h(2) }), /opening does not match/);
  assert.throws(() => assertFundingNoteV1({ ...note, extra: "unexpected" }), /exactly/);
  assert.throws(() => deriveFundedLeafV1(note.commitment, 7, 0n), /on-chain range/);
});

test("canonical zero blinding is accepted while zero secrets and noncanonical blindings reject", () => {
  const commitment = "0bf68b278125d50ec8a04e17570ddbed271ea7f3c9bafa5efa50658b084289cd";
  assert.equal(deriveFundingNoteCommitmentV1(h(1), h(0)), commitment);
  assert.deepEqual(assertFundingNoteV1({ version: 1, secret: h(1), blinding: h(0), commitment }),
    { version: 1, secret: h(1), blinding: h(0), commitment });
  assert.throws(() => deriveFundingNoteCommitmentV1(h(0), h(0)), /nonzero canonical/);
  assert.throws(() => deriveFundingNoteCommitmentV1(h(1), h(GPRU_FUNDING_FIELD_MODULUS)), /canonical BN254/);
  assert.throws(() => assertFundingNoteV1({ version: 1, secret: h(1), blinding: h(0), commitment: h(0) }), /nonzero canonical/);
});

function accounts() {
  const key = n => new PublicKey(new Uint8Array(32).fill(n));
  return { depositor: key(1), config: key(2), assetEntry: key(3), reserveState: key(4), source: key(5),
    vault: key(6), mint: key(7), tokenProgram: key(8), tcapProgramId: GPRU_TCAP_PROGRAM_ID,
    fundingRootAccount: PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], GPRU_TCAP_PROGRAM_ID)[0] };
}

test("wallet signs the exact commitment deposit; secret openings never appear in its public instruction", () => {
  const fields = accounts();
  const transaction = buildTcapGpruWalletDepositTransaction({ accounts: fields, amountBaseUnits: 1000n, fundingNoteCommitment: note.commitment });
  const ix = transaction.instructions[0];
  assert.equal(ix.data.length, 48); assert.equal(ix.keys.length, 9);
  assert.equal(ix.data.subarray(0, 8).toString("hex"), createHash("sha256").update("global:deposit_private_funding_v1").digest().subarray(0, 8).toString("hex"));
  assert.equal(ix.data.readBigUInt64LE(8), 1000n); assert.equal(ix.data.subarray(16).toString("hex"), note.commitment);
  assert.equal(ix.keys[8].pubkey.toBase58(), fields.fundingRootAccount.toBase58()); assert.equal(ix.keys[8].isWritable, true);
  assert.equal(ix.data.includes(Buffer.from(note.secret, "hex")), false); assert.equal(ix.data.includes(Buffer.from(note.blinding, "hex")), false);
  assert.throws(() => buildTcapGpruWalletDepositTransaction({ accounts: { ...fields, fundingRootAccount: fields.mint }, amountBaseUnits: 1000n, fundingNoteCommitment: note.commitment }), /FUNDING_ROOT_NOT_CANONICAL/);
});

test("canonical sender approval and restricted ingress bind the same note and reject substitution", () => {
  const authorization = createPaymentAuthorization({ fundingNoteCommitment: note.commitment, senderWallet: "wallet", senderIdentity: "wallet",
    receiverIdentity: "tin:1234567890", tokenMintAddress: "mint", tokenDecimals: 6, amount: "1", senderFeeAmount: "0",
    totalTokenRequiredUi: 1, nonce: "nonce", issuedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:05:00.000Z" });
  assert.equal(parsePaymentIntentMessage(authorization.message).fundingNoteCommitment, note.commitment);
  assert.equal(authorization.message.includes(note.secret), false); assert.equal(authorization.message.includes(note.blinding), false);
  const fields = { paymentId: "payment", recipientHash: "ab".repeat(32), recipientTin: "1234567890", tokenMintAddress: "mint", tokenDecimals: 6,
    senderWallet: "wallet", senderAuthorizationMessage: authorization.message, senderAuthorizationSignature: "signature",
    senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt, senderAuthorizationExpiresAt: authorization.expiresAt,
    senderSignedFundingTransaction: "signed-wire", senderFundingMode: "tcap_funded_note_v1", fundingNote: note, amount: "1" };
  assert.deepEqual(buildPaymentAuthorizationIntentRequest(fields).fundingNote, note);
  const other = { version: 1, secret: h(3), blinding: h(2), commitment: deriveFundingNoteCommitmentV1(h(3), h(2)) };
  assert.throws(() => buildPaymentAuthorizationIntentRequest({ ...fields, fundingNote: other }), /differs from the sender-signed/);
  assert.throws(() => buildPaymentAuthorizationIntentRequest({ ...fields, senderFundingMode: "tcap_deposit_v2" }), /FUNDED_NOTE_V1_REQUIRED/);
});

test("runtime credit uses private V3 amounts and only the sealed thirteen-input ABI", () => {
  const a = accounts(), pda = seed => PublicKey.findProgramAddressSync([Buffer.from(seed)], GPRU_TCAP_PROGRAM_ID)[0];
  const pool = PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),a.assetEntry.toBuffer(),Buffer.from(h(1),"hex")],GPRU_TCAP_PROGRAM_ID)[0];
  const fields = { authority:a.depositor,motherEscrow:a.config,commitmentRoot:pda("tcap:commitment-root:v1"),
    assetEntry:a.assetEntry,reserveState:a.reserveState,config:pda("tcap:global-config:v1"),tipRouteRoot:a.mint,
    gpruVerifier:a.tokenProgram,fundingRootAccount:pool,accountingEpoch:a.vault,
    authorizationDigest:h(1),validAfterSlot:1n,expiresAtSlot:10n,previousTcapRoot:h(1),tcapRootSequence:1n,
    tokenId:7,amountCommitment:h(3),nullifier:h(2),proof:{publicInputs:Array(13).fill(h(1)),
      proofA:"01".repeat(64),proofB:"01".repeat(128),proofC:"01".repeat(64),actionKind:1,tokenId:7,
      amountCommitment:h(3),authorizationCommitment:h(1)}};
  const ix=buildTsnRegisterTcapCreditAuthorizationV3Instruction(fields);
  assert.equal(ix.data.length,905);assert.equal(ix.keys.length,16);
  assert.equal(ix.data.subarray(100,132).toString("hex"),h(3));
  assert.equal(ix.data.subarray(841,873).toString("hex"),h(3));
  assert.equal(ix.keys[7].isWritable,false);assert.equal(ix.keys[14].isWritable,true);
  assert.equal(ix.keys[12].pubkey.toBase58(),GPRU_PROGRAM_ID.toBase58());
  assert.equal(ix.keys[13].pubkey.toBase58(),pool.toBase58());
  assert.throws(()=>buildTsnRegisterTcapCreditAuthorizationV3Instruction({...fields,proof:{...fields.proof,publicInputs:Array(12).fill(h(1))}}),/exactly 13/);
  assert.throws(()=>buildTsnRegisterTcapCreditAuthorizationV3Instruction({...fields,amountCommitment:h(4)}),/PROOF_ACTION_MISMATCH/);
  assert.throws(()=>buildTsnRegisterTcapCreditAuthorizationV3Instruction({...fields,fundingRootAccount:a.fundingRootAccount}),/FUNDING_ROOT_NOT_CANONICAL/);
});

test("specialized cross-chain intent retains signed destination fields and binds its funded source note", () => {
  const authorization = createCrossChainPaymentAuthorization({ fundingNoteCommitment: note.commitment, intentId: "intent", senderWallet: "wallet",
    senderIdentity: "wallet", receiverIdentity: "tin:1234567890", tokenMintAddress: "mint", destinationToken: "0x" + "33".repeat(20),
    amount: "1", senderFeeAmount: "0", destinationNetwork: "destination-test", destinationExecutor: "0x" + "11".repeat(20),
    settlementRouteId: "22".repeat(32), nonce: "nonce", issuedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:05:00.000Z" });
  const signed = parseCrossChainPaymentIntentMessage(authorization.message);
  assert.equal(signed.fundingNoteCommitment, note.commitment); assert.equal(signed.destinationNetwork, "destination-test");
  assert.equal(signed.destinationExecutor, "0x" + "11".repeat(20)); assert.equal(signed.settlementRouteId, "22".repeat(32));
  const request = buildPaymentAuthorizationIntentRequest({ paymentId: "payment", recipientHash: "ab".repeat(32), recipientTin: "1234567890",
    tokenMintAddress: "mint", tokenDecimals: 6, senderWallet: "wallet", senderAuthorizationMessage: authorization.message,
    senderAuthorizationSignature: "signature", senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt,
    senderAuthorizationExpiresAt: authorization.expiresAt, senderSignedFundingTransaction: "signed-wire", senderFundingMode: "tcap_funded_note_v1",
    fundingNote: note, amount: "1", destinationNetwork: signed.destinationNetwork, destinationExecutor: signed.destinationExecutor,
    destinationToken: signed.destinationToken, settlementRouteId: signed.settlementRouteId });
  assert.equal(request.destinationExecutor, signed.destinationExecutor); assert.equal(request.fundingNote.commitment, note.commitment);
});
