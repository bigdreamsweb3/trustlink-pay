import assert from "node:assert/strict";
import test from "node:test";
import { createKeyPairTransactionSigner, createRemoteTransactionSigner, sendInstructionsV1 } from "@dbrix/solana";
import { getTransactionEncoder, type Transaction } from "@solana/kit";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { sendSettlementV1 } from "../src/dbrix/settlement-transport.js";

test("HTTP settlement preserves DBrix V1 bytes and persists identity before one broadcast", async () => {
  const originalFetch = globalThis.fetch;
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const mother = Keypair.fromSeed(new Uint8Array(32).fill(2));
  const ix = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    keys: [payer, mother].map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: true })), data: Buffer.from("synthetic-transport-fixture") });
  const lifetime = { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 };
  let expected: Transaction | undefined;
  const stop = new Error("STOP_BEFORE_SIGNATURE");
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey);
  const motherSigner = await createKeyPairTransactionSigner(mother.secretKey);
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.method, "getLatestBlockhash");
      return new Response(JSON.stringify({jsonrpc:"2.0", id:body.id, result:{context:{slot:1},value:lifetime}}));
    };
    await assert.rejects(sendInstructionsV1([ix], { rpcUrl:"https://offline.invalid",
      payerSigner: { address:payerSigner.address, signTransactions:async transactions => { expected=transactions[0]; throw stop; } },
      additionalSigners:[createRemoteTransactionSigner(mother.publicKey.toBase58(), async () => { throw stop; })],
    }), error => error === stop);
    assert.ok(expected);
    const expectedWire = getTransactionEncoder().encode(expected);
    let recorded: any, broadcasts = 0, statusCalls = 0;
    const methods: string[] = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:8787");
      const body = JSON.parse(String(init?.body)); methods.push(body.method);
      let result: unknown;
      if (body.method === "getLatestBlockhash") result = {context:{slot:1},value:lifetime};
      else if (body.method === "sendTransaction") {
        assert.ok(recorded, "Receiver checkpoint must precede broadcast"); broadcasts++;
        const wire = Buffer.from(body.params[0], "base64");
        assert.equal(wire[0], 0x81); assert.equal(wire.length, expectedWire.length);
        assert.deepEqual(wire.subarray(0,-128), Buffer.from(expected!.messageBytes));
        assert.notDeepEqual(wire.subarray(-128), Buffer.alloc(128));
        assert.equal(body.params[1].skipPreflight, false);
        result = recorded.signature;
      } else if (body.method === "getSignatureStatuses") result = {context:{slot:2},value:[++statusCalls===1?null:{err:null,confirmationStatus:"confirmed",slot:2,confirmations:1}]};
      else { assert.equal(body.method,"getBlockHeight"); result=999; }
      return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result}));
    };
    const signature = await sendSettlementV1([ix], { payerSigner, additionalSigners:[motherSigner], rpcUrl:"http://127.0.0.1:8787",
      pollMs:1, onSigned:async s=>{recorded=s;} });
    assert.equal(signature,recorded.signature); assert.equal(broadcasts,1);
    assert.deepEqual(methods,["getLatestBlockhash","sendTransaction","getSignatureStatuses","getBlockHeight","getSignatureStatuses"]);
    assert.equal(recorded.lastValidBlockHeight,"1000"); assert.equal(recorded.wireSha256.length,64);

    // Lost send and lost confirmation responses retain the same exact identity;
    // the helper never performs a second broadcast or creates another message.
    for (const failure of ["sendTransaction", "getSignatureStatuses"]) {
      let known: any, sends=0;
      globalThis.fetch = async (_url, init) => {
        const body=JSON.parse(String(init?.body));
        if(body.method==="sendTransaction") sends++;
        if(body.method===failure) throw new Error("synthetic network interruption");
        return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result:body.method==="getLatestBlockhash"?{context:{slot:1},value:lifetime}:known.signature}));
      };
      await assert.rejects(sendSettlementV1([ix],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async s=>{known=s;}}),error=>String(error).includes(known.signature));
      assert.equal(sends,1);
    }
    let sends=0;
    globalThis.fetch=async (_url,init)=>{const body=JSON.parse(String(init?.body)); if(body.method==="sendTransaction") sends++; return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result:{context:{slot:1},value:lifetime}}));};
    await assert.rejects(sendSettlementV1([ix],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async()=>{throw new Error("checkpoint unavailable");}}),/checkpoint unavailable/);
    assert.equal(sends,0);
    const huge=new TransactionInstruction({...ix,data:Buffer.alloc(5000)});
    await assert.rejects(sendSettlementV1([huge],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async()=>assert.fail("oversize must not persist or submit") }));
  } finally { globalThis.fetch=originalFetch; }
});
