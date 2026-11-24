import assert from "node:assert/strict";
import test from "node:test";
import { createKeyPairTransactionSigner } from "@dbrix/solana";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { buildPublicTinDebitInstructionsV1 } from "../src/dbrix/tin-debit-transition.js";
import { sendSettlementV1 } from "../src/dbrix/settlement-transport.js";
import { nativeWorkRetryReason } from "../src/receiver/native-retry.js";
import { deriveGpruTinDebitAccountsV1, deriveGpruTinDebitDeploymentCommitmentV1, deriveGpruTinDebitAuthorizationDigestV1 } from "../../../sdks/tsn-sdk/src/tcap-gpru-tin-debit.js";
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const h = (value: bigint | number) => BigInt(value).toString(16).padStart(64, "0");
const x = h(5299619240641551281634865583518297030282874472190772894086521144482721001553n);
const y = h(16950150798460657717958625567821834550301663161624707787222815936182638968203n);
function fixture() {
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(71)), authority = Keypair.fromSeed(new Uint8Array(32).fill(72));
  const assetEntry = Keypair.fromSeed(new Uint8Array(32).fill(73)).publicKey;
  let accounts = deriveGpruTinDebitAccountsV1({ authority: authority.publicKey, assetEntry, authorizationDigest: h(0) });
  const deployment = deriveGpruTinDebitDeploymentCommitmentV1(accounts);
  const payloads = [0, 1].map(leg => {
    const binary = Buffer.alloc(416); binary.set([1, leg]);
    [h(31 + leg), x, y, h(21), h(23), x, y].forEach((value, index) => Buffer.from(value, "hex").copy(binary, 2 + index * 32));
    return "TSN_GPRU_TIN_DEBIT_MEMO_V1:" + binary.toString("base64url");
  });
  const memoHashes = payloads.map(payload => h(BigInt("0x" + Buffer.from(sha256(Buffer.from(payload))).toString("hex")) % FIELD));
  const publicInputs = [h(1), h(2), h(3), h(4), deployment, h(1), h(10), h(100), h(19), h(20), h(21), h(22),
    ...memoHashes, h(31), h(32), x, x, y, y, h(23), h(23), x, x, y, y];
  const digest = deriveGpruTinDebitAuthorizationDigestV1(accounts, publicInputs);
  accounts = deriveGpruTinDebitAccountsV1({ authority: authority.publicKey, assetEntry, authorizationDigest: digest });
  const transition = { ...Object.fromEntries(Object.entries(accounts).map(([key, value]) => [key, value.toBase58()])),
    proof: { publicInputs, proofA: "01".repeat(64), proofB: "01".repeat(128), proofC: "01".repeat(64) }, memoPayloads: payloads,
    authorizationDigest: digest, tokenId: 1, amountCommitment: h(19), authorizationCommitment: h(20), actionCommitment: h(21), nullifier: h(22),
    previousTcapRoot: h(1), newTcapRoot: h(2), tcapRootSequence: "5", validAfterSlot: "10", expiresAtSlot: "100", deploymentCommitment: deployment };
  return { payer, authority, accounts, transition };
}

test("TIN-Debit projection builds 1128 bytes then two 582-byte Mother Memo instructions", () => {
  const { authority, accounts, transition } = fixture();
  const { instructions } = buildPublicTinDebitInstructionsV1(transition, authority.publicKey, accounts.motherEscrow);
  assert.deepEqual(instructions.map(ix => ix.data.length), [1128, 582, 582]);
  assert.equal(instructions[0].keys.length, 13);
  for (const memo of instructions.slice(1)) assert.deepEqual(memo.keys, [{ pubkey: authority.publicKey, isSigner: true, isWritable: false }]);
  for (const field of ["amountBaseUnits", "senderTin", "balance", "routeKeyCommitment", "privatePath"]) assert.throws(() => buildPublicTinDebitInstructionsV1({ ...transition, [field]: "1" }, authority.publicKey, accounts.motherEscrow), /FIELD_SET/);
  assert.throws(() => buildPublicTinDebitInstructionsV1({ ...transition, tokenId: 2 }, authority.publicKey, accounts.motherEscrow), /STATEMENT/);
  assert.throws(() => buildPublicTinDebitInstructionsV1(transition, PublicKey.default, accounts.motherEscrow), /MOTHER/);
  assert.throws(() => buildPublicTinDebitInstructionsV1({ ...transition, memoPayloads: transition.memoPayloads.toReversed() }, authority.publicKey, accounts.motherEscrow), /STATEMENT/);
});

test("actual native V1 serializer records TIN-Debit as 2977 bytes and rejects oversize before either signer", async () => {
  const original = globalThis.fetch;
  const { payer, authority, accounts, transition } = fixture();
  const { instructions } = buildPublicTinDebitInstructionsV1(transition, authority.publicKey, accounts.motherEscrow);
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey), motherSigner = await createKeyPairTransactionSigner(authority.secretKey);
  let recorded: any, signs = 0, broadcasts = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      let result: unknown;
      if (body.method === "getLatestBlockhash") result = { context: { slot: 50 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 } };
      else if (body.method === "getBlockHeight") result = 980;
      else if (body.method === "sendTransaction") { assert.ok(recorded); broadcasts++; result = recorded.signature; }
      else if (body.method === "getSignatureStatuses") result = { context: { slot: 51 }, value: [{ err: null, confirmationStatus: "confirmed" }] };
      else assert.fail("Unexpected mocked RPC method");
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    };
    await sendSettlementV1(instructions, { rpcUrl: "https://offline.invalid", payerSigner, additionalSigners: [motherSigner], onSigned: async value => { recorded = value; } });
    assert.equal(recorded.wireBytes, 2977); assert.equal(broadcasts, 1);
    const oversized = [...instructions, new TransactionInstruction({ programId: PublicKey.default, keys: [], data: Buffer.alloc(2000) })];
    await assert.rejects(sendSettlementV1(oversized, { rpcUrl: "https://offline.invalid",
      payerSigner: { address: payerSigner.address, signTransactions: async () => { signs++; throw new Error("Signer invoked"); } },
      additionalSigners: [{ address: motherSigner.address, signTransactions: async () => { signs++; throw new Error("Signer invoked"); } }], onSigned: async () => assert.fail("Oversize checkpoint") }), /maximum is4096|maximum is 4096/);
    assert.equal(signs, 0); assert.equal(broadcasts, 1);
    const work = { kind: "TIN_DEBIT", verification: { verificationType: "TSN_TIN_DEBIT_V1" } };
    assert.equal(nativeWorkRetryReason(work, new Error("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")), "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT");
    assert.equal(nativeWorkRetryReason({ ...work, result: recorded }, new Error("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")), null);
  } finally { globalThis.fetch = original; }
});
