import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { assertExternalWorkKind, assertAuthorizedFundingIngress, compactAuthorizedFundingVerification, crankerAuthorizationForWork, crankerExecutionPayload, createReceivedWork, publicCoordinationPayload } from "../lib/work-contract.ts";

const fundingNoteFixture = { version: 1, secret: "00".repeat(31) + "01", blinding: "00".repeat(31) + "02", commitment: "00".repeat(31) + "03" };

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let output = "";
  while (number) { const remainder = Number(number % 58n); output = alphabet[remainder] + output; number /= 58n; }
  for (const byte of bytes) { if (byte === 0) output = `1${output}`; else break; }
  return output;
}

test("receiver accepts only public work and creates monotonic initial state", () => {
  const work = createReceivedWork({
    id: "intent-1",
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", recipientHash: "h" },
  });
  assert.equal(work.status, "RECEIVED");
  assert.equal(work.stateVersion, 1);
  assert.match(work.payloadCommitment, /^[a-f0-9]{64}$/);
});

test("receiver rejects fields outside the durable allowlist, regardless of their name", () => {
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", totallyDifferentSecret: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.throws(() => createReceivedWork({
    kind: "SETTLEMENT",
    payload: { master_seed: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
});

test("funding work rejects plaintext TIN in its durable payload", () => {
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", fundingNote: fundingNoteFixture },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
});


test("TIN ingress accepts the current V1 shape and rejects retired or plaintext fields", () => {
  const payload = {
    intentType: "tin_creation",
    intentId: "operation-1",
    ownerPubkey: "owner",
    ownerSignature: "signature",
    ownerIntentHash: "hash",
    ownerIntentMessage: "approval",
    nonce: "nonce",
    expiry: 1,
    lookupCommitment: "commitment",
    lookupIssuanceProof: "proof",
    encryptedIdentityEnvelope: "identity",
    encryptedTinRecovery: "recovery",
    encryptedMasterSeed: "seed",
    encryptedMetadataHash: "metadata",
    routeVersion: 1,
    routeNonce: "route-nonce",
    tipRouteVersion: 1,
    gpruElgamalKeyVersion: 1,
    gpruElgamalPublicKey: "gpru-elgamal-public-key",
    gpruElgamalKeyCommitment: "gpru-elgamal-commitment",
    policyCommitment: "policy",
  };
  assert.equal(createReceivedWork({ kind: "TIN_OPERATION", payload }).status, "RECEIVED");
  for (const obsolete of ["programAssigned", "tin", "displayName", "pruConfigurationHash", "encryptedPublicRouteEnvelope"]) {
    assert.throws(
      () => createReceivedWork({ kind: "TIN_OPERATION", payload: { ...payload, [obsolete]: "legacy" } }),
      /UNSUPPORTED_PAYLOAD_FIELD/,
    );
  }
});

test("canonical commitment is independent of object insertion order", () => {
  const first = createReceivedWork({ kind: "SETTLEMENT", payload: { paymentId: "p", intentId: "i", recipientHash: "h", source: "test" } });
  const second = createReceivedWork({ kind: "SETTLEMENT", payload: { source: "test", recipientHash: "h", intentId: "i", paymentId: "p" } });
  assert.equal(first.payloadCommitment, second.payloadCommitment);
});

test("coordination views never include the encrypted envelope", () => {
  const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h", nodeEncryptedPayload: { version: 1, iv: "i", ciphertext: "c", tag: "t" } } });
  assert.deepEqual(publicCoordinationPayload(work), { paymentId: "p", recipientHash: "h" });
});

test("funding verification compaction never persists recipient TIN or sender authorization", () => {
  const payload = { paymentId: "p", recipientHash: "h", tokenMintAddress: "m", amount: 1 };
  const compact = compactAuthorizedFundingVerification(payload, {
    verificationType: "TSN_TCAP_V2_GPRU_CREDIT_INTENT",
    verifiedPayload: {
      ...payload,
      recipientTin: "1234567890",
      senderAuthorizationMessage: "Recipient TIN: 1234567890",
      senderAuthorizationSignature: "signature",
      senderWallet: "wallet",
      senderSignedFundingTransaction: "signed-transaction",
      senderFundingMode: "tcap_funded_note_v1",
      fundingNote: fundingNoteFixture,
      tcapCreditTransition: { nullifier: "private-transition-data" },
    },
  });
  assert.deepEqual(compact.payloadDelta, {
    addedFields: { senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1" },
    changedFields: {},
    removedFields: [],
  });
  assert.doesNotMatch(JSON.stringify(compact), /1234567890|senderAuthorization|senderWallet|tcapCreditTransition|fundingNote/);
  assert.deepEqual(crankerExecutionPayload("AUTHORIZED_FUNDING", { fundingNote: fundingNoteFixture, senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1" }), {
    senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1",
  });
});

test("public coordination filters recipient TIN from legacy verification records", () => {
  const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h" } });
  const legacyWork = {
    ...work,
    verification: { verifiedPayload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", privacyVersion: 1 } },
  };
  assert.deepEqual(publicCoordinationPayload(legacyWork), { paymentId: "p", recipientHash: "h" });
});


test("payment ingress requires a valid sender Ed25519 authorization", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const wallet = base58(der.subarray(-32));
  const message = "TSN payment authorization";
  const payload = { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", tokenMintAddress: "m", amount: 1, senderWallet: wallet, senderAuthorizationMessage: message, senderAuthorizationSignature: sign(null, Buffer.from(message), privateKey).toString("base64"), senderAuthorizationNonce: "n", senderFundingMode: "tcap_funded_note_v1", fundingNote: fundingNoteFixture, senderSignedFundingTransaction: "base64-serialized-owner-signed-transaction" };
  assert.doesNotThrow(() => assertAuthorizedFundingIngress(payload));
  assert.throws(() => assertAuthorizedFundingIngress({ ...payload, senderAuthorizationSignature: Buffer.alloc(64).toString("base64") }), /INVALID_SENDER_SIGNATURE/);
  assert.throws(() => assertAuthorizedFundingIngress({ ...payload, senderFundingMode: "tcap_deposit_v2" }), /FUNDED_NOTE_FUNDING_MODE_REQUIRED/);
  for (const note of [undefined, null, [], "private"]) {
    assert.throws(() => assertAuthorizedFundingIngress({ ...payload, fundingNote: note }), /FUNDED_NOTE_PRIVATE_OPENING_REQUIRED/);
  }
  const modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n.toString(16).padStart(64, "0");
  for (const note of [
    { ...fundingNoteFixture, version: 2 }, { ...fundingNoteFixture, secret: "00".repeat(32) },
    { ...fundingNoteFixture, commitment: "00".repeat(32) }, { ...fundingNoteFixture, secret: modulus },
    { ...fundingNoteFixture, blinding: modulus }, { ...fundingNoteFixture, commitment: modulus },
    { ...fundingNoteFixture, secret: "ff" }, { ...fundingNoteFixture, blinding: 2 },
  ]) assert.throws(() => assertAuthorizedFundingIngress({ ...payload, fundingNote: note }), /INVALID_FUNDED_NOTE_PRIVATE_OPENING/);
  assert.throws(() => assertAuthorizedFundingIngress({ ...payload, fundingNote: { ...fundingNoteFixture, witness: "private" } }), /UNSUPPORTED_PAYLOAD_FIELD:fundingNote.witness/);
  assert.doesNotThrow(() => assertAuthorizedFundingIngress({ ...payload, fundingNote: { ...fundingNoteFixture, blinding: "00".repeat(32) } }));
  for (const obsolete of ["pruSpendTin", "pruSpendSelections", "walletTopUpAmountBaseUnits", "privacyVersion", "senderTokenAccount", "encryptedSettlementToken"]) {
    assert.throws(
      () => assertAuthorizedFundingIngress({ ...payload, [obsolete]: "legacy" }),
      /UNSUPPORTED_PAYLOAD_FIELD/,
    );
  }
});

test("public Receiver ingress cannot create settlement or recovery work", () => {
  assert.throws(() => assertExternalWorkKind("SETTLEMENT"), /SETTLEMENT_WORK_INTERNAL_ONLY/);
  assert.doesNotThrow(() => assertExternalWorkKind("AUTHORIZED_FUNDING"));
});

test("settlement handoff includes the Memo body and removes hidden-head witness data", () => {
  const transition = {
    proof: { publicInputs: ["public"], fundingNote: fundingNoteFixture, secret: "private" }, fundingRootAccount: "public-root-account", memoPayload: "prefix:body", memoBodyPayload: "body", memoLedgerSlots: ["body"],
    fundingNote: fundingNoteFixture, fundingCommitment: "private", fundingSiblings: ["private"],
    accountSiblings: ["private"], accountPathKey: "private", priorSequence: "private", balanceBlindingDelta: "private",
    previousMemoCommitment: "private", recipientTin: "private", sequence: "private", witness: { secret: "private" },
  };
  assert.deepEqual(crankerExecutionPayload("SETTLEMENT", { tcapCreditTransition: transition }), {
    tcapCreditTransition: { proof: { publicInputs: ["public"] }, fundingRootAccount: "public-root-account", memoPayload: "prefix:body", memoBodyPayload: "body", memoLedgerSlots: ["body"] },
  });
});

test("settlement authorization retains only the matching verified public transition", () => {
  const transition = { proof: { publicInputs: Array(13).fill("public") }, fundingRootAccount: "public-root-account", tokenId: 1 };
  const work = { ...createReceivedWork({ kind: "SETTLEMENT", payload: { intentId: "funding" } }), verification: { verifiedPayload: { tcapCreditTransition: transition } } };
  const authorization = { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", leaseId: "lease", leaseVersion: 3,
    transition: { ...transition, fundingNote: fundingNoteFixture, proof: { ...transition.proof, secret: "private" } }, fundingNote: fundingNoteFixture };
  const sanitized = crankerAuthorizationForWork(work, authorization);
  assert.deepEqual(sanitized, { kind: authorization.kind, leaseId: "lease", leaseVersion: 3, transition });
  assert.doesNotMatch(JSON.stringify(sanitized), /fundingNote|secret|blinding/);
  for (const changed of [{ ...transition, tokenId: 2 }, { ...transition, fundingRootAccount: "another-root" }, { ...transition, proof: { publicInputs: Array(12).fill("public") } }]) {
    assert.throws(() => crankerAuthorizationForWork(work, { ...authorization, transition: changed }), /TRANSITION_MISMATCH/);
  }
  assert.throws(() => crankerAuthorizationForWork({ ...work, verification: null }, authorization), /TRANSITION_MISMATCH/);
});

test("coordination execution and authorization exclude private source lists and openings",()=>{
  for(const [kind,field,publicValue] of [["TCAP_FUNDING_POOL","tcapFundingPool",{assetEntry:"asset",reserveState:"reserve",tcapConfig:"config",root:"root",eligibleNoteCount:"2",sourceWalletCount:2,releaseSlot:"90"}],
    ["TCAP_EPOCH_ACCOUNTING","tcapEpochAccounting",{assetEntry:"asset",reserveState:"reserve",tcapConfig:"config",accountingEpoch:"epoch",total:"100",proof:{publicInputs:["1"],proofA:"a",proofB:"b",proofC:"c"}}]]) {
    const privateValue={...publicValue,amounts:[50,50],blindings:["secret"],sourceWallets:["private"]};
    if(privateValue.proof)privateValue.proof={...privateValue.proof,openings:["secret"]};
    assert.deepEqual(crankerExecutionPayload(kind,{[field]:privateValue}),{[field]:publicValue});
    const work={kind,verification:{verifiedPayload:{[field]:privateValue}}};
    const result=crankerAuthorizationForWork(work,{kind:"TSN_TCAP_COORDINATION_AUTHORIZATION_V1",transition:privateValue});
    assert.deepEqual(result.transition,publicValue);
    assert.throws(()=>crankerAuthorizationForWork(work,{kind:"TSN_TCAP_COORDINATION_AUTHORIZATION_V1",transition:{...publicValue,assetEntry:"other"}}),/AUTHORIZATION_MISMATCH/);
  }
});
