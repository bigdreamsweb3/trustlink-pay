import assert from "node:assert/strict";
import test from "node:test";
import { createKeyPairTransactionSigner } from "@dbrix/solana";
import { type Transaction } from "@solana/kit";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { createMotherNodeTransactionSigner } from "../src/dbrix/mother-node-signer.js";
import { sendSettlementV1, type SettlementSubmission } from "../src/dbrix/settlement-transport.js";

const payer = Keypair.fromSeed(new Uint8Array(32).fill(11));
const mother = Keypair.fromSeed(new Uint8Array(32).fill(12));
const finalHash = new PublicKey(new Uint8Array(32).fill(13));
const ix = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
  keys: [payer, mother].map(key => ({ pubkey: key.publicKey, isSigner: true, isWritable: true })),
  data: Buffer.from("synthetic-native-settlement") });

function response(messageBase64: string) {
  const message = Buffer.from(messageBase64, "base64");
  message.set(finalHash.toBytes(), 8);
  return { authority: mother.publicKey.toBase58(), messageBase64: message.toString("base64"),
    signatureBase64: Buffer.from(nacl.sign.detached(message, mother.secretKey)).toString("base64"),
    blockhash: finalHash.toBase58(), lastValidBlockHeight: "1100", blockhashContextSlot: "99" };
}

test("slow Mother validation can exhaust the initial hash; payer and broadcast use the final hash", async () => {
  const originalFetch = globalThis.fetch;
  const basePayer = await createKeyPairTransactionSigner(payer.secretKey);
  let motherDone = false, payerDone = false, checkpoints = 0, sends = 0, heightCalls = 0;
  let submission: SettlementSubmission | undefined, originalMessage: Buffer | undefined;
  const signer = createMotherNodeTransactionSigner(mother.publicKey, async message => {
    originalMessage = Buffer.from(message, "base64");
    // Verification finishes after the initial lastValidBlockHeight=100.
    await Promise.resolve();
    motherDone = true;
    return response(message);
  });
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      let result: unknown;
      if (body.method === "getLatestBlockhash") result = { context: { slot: 71 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100 } };
      else if (body.method === "getBlockHeight") {
        assert.deepEqual(body.params, [{ commitment: "confirmed", minContextSlot: 99 }]);
        heightCalls++; result = 1050;
      } else if (body.method === "sendTransaction") {
        assert.equal(checkpoints, 1); assert.equal(payerDone, true); sends++;
        assert.equal(body.params[1].minContextSlot, 99);
        const wire = Buffer.from(body.params[0], "base64"), message = wire.subarray(0, -128);
        assert.ok(originalMessage);
        assert.deepEqual(message.subarray(0, 8), originalMessage.subarray(0, 8));
        assert.deepEqual(message.subarray(40), originalMessage.subarray(40));
        assert.deepEqual(message.subarray(8, 40), Buffer.from(finalHash.toBytes()));
        assert.ok(nacl.sign.detached.verify(message, wire.subarray(-128, -64), payer.publicKey.toBytes()));
        assert.ok(nacl.sign.detached.verify(message, wire.subarray(-64), mother.publicKey.toBytes()));
        result = submission!.signature;
      } else {
        assert.equal(body.method, "getSignatureStatuses");
        result = { context: { slot: 100 }, value: [heightCalls === 1 ? null : { err: null, confirmationStatus: "finalized" }] };
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    };
    await sendSettlementV1([ix], {
      payerSigner: { address: basePayer.address, signTransactions: async (transactions, config) => {
        assert.equal(motherDone, true);
        assert.deepEqual(Buffer.from(transactions[0].messageBytes).subarray(8, 40), Buffer.from(finalHash.toBytes()));
        payerDone = true;
        return basePayer.signTransactions(transactions, config);
      } }, additionalSigners: [signer.signer], signedBlockhashContextSlot: signer.getBlockhashContextSlot,
      rpcUrl: "https://offline.invalid", pollMs: 1,
      onSigned: async value => { checkpoints++; submission = value; },
    });
    assert.equal(submission!.blockhash, finalHash.toBase58());
    assert.equal(submission!.lastValidBlockHeight, "1100");
    assert.equal(sends, 1); assert.equal(heightCalls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("altered message, signature, lifetime or bank context never reach a checkpoint", async () => {
  const originalFetch = globalThis.fetch;
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey);
  const mutations: ((value: Record<string, unknown>, original: string) => void)[] = [
    value => { value.authority = payer.publicKey.toBase58(); },
    value => { value.messageBase64 = String(value.messageBase64) + "\n"; },
    ...[0, 4, 50, -1].map(offset => (value: Record<string, unknown>) => {
      const message = Buffer.from(String(value.messageBase64), "base64");
      message[offset < 0 ? message.length - 1 : offset] ^= 1;
      value.messageBase64 = message.toString("base64");
      value.signatureBase64 = Buffer.from(nacl.sign.detached(message, mother.secretKey)).toString("base64");
    }),
    value => { value.signatureBase64 = Buffer.alloc(64).toString("base64"); },
    (value, original) => { value.signatureBase64 = Buffer.from(nacl.sign.detached(Buffer.from(original, "base64"), mother.secretKey)).toString("base64"); },
    value => { value.blockhash = payer.publicKey.toBase58(); },
    ...["0", "-1", "01", "1100.5", "18446744073709551616", 1100, null, true].flatMap(bad => [
      (value: Record<string, unknown>) => { value.lastValidBlockHeight = bad; },
      (value: Record<string, unknown>) => { value.blockhashContextSlot = bad; },
    ]),
    value => { value.blockhashContextSlot = "70"; },
    value => { value.lastValidBlockHeight = "1069"; },
  ];
  try {
    for (const mutate of mutations) {
      let checkpoints = 0, sends = 0;
      const signer = createMotherNodeTransactionSigner(mother.publicKey, async message => {
        const value = response(message); mutate(value, message); return value;
      });
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.method === "sendTransaction") { sends++; assert.fail("rejected signing response must never broadcast"); }
        const result = body.method === "getBlockHeight" ? 1050 : { context: { slot: 71 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100 } };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      };
      await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [signer.signer],
        signedBlockhashContextSlot: signer.getBlockhashContextSlot, rpcUrl: "https://offline.invalid",
        onSigned: async () => { checkpoints++; } }), /TCAP_MOTHER_|TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION/);
      assert.equal(checkpoints, 0); assert.equal(sends, 0);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("existing signatures and signing batches reject replacement before Mother is called", async () => {
  let calls = 0;
  const signer = createMotherNodeTransactionSigner(mother.publicKey, async message => { calls++; return response(message); });
  const transaction = { messageBytes: new Uint8Array(40), signatures: { [mother.publicKey.toBase58()]: new Uint8Array(64) } } as unknown as Transaction;
  await assert.rejects(signer.signer.modifyAndSignTransactions([transaction]), /TCAP_SETTLEMENT_EXECUTION_CHECKPOINT_PRESENT/);
  await assert.rejects(signer.signer.modifyAndSignTransactions([transaction, transaction]), /TCAP_MOTHER_SIGNING_TRANSACTION_COUNT_INVALID/);
  assert.equal(calls, 0);
});
