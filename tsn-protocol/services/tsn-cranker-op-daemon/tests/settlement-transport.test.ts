import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createKeyPairTransactionSigner, createRemoteTransactionSigner, sendInstructionsV1 } from "@dbrix/solana";
import { getTransactionEncoder, type Transaction } from "@solana/kit";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { sendSettlementV1, type SettlementSubmission } from "../src/dbrix/settlement-transport.js";
import { nativeWorkRetryReason } from "../src/receiver/native-retry.js";

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
    let recorded: any, broadcasts = 0, statusCalls = 0, heightCalls = 0;
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
        assert.equal(body.params[1].preflightCommitment, "confirmed");
        assert.equal(body.params[1].minContextSlot, 1);
        assert.equal(recorded.wireSha256, createHash("sha256").update(wire).digest("hex"));
        assert.equal(recorded.wireBytes, wire.length);
        result = recorded.signature;
      } else if (body.method === "getSignatureStatuses") result = {context:{slot:2},value:[++statusCalls===1?null:{err:null,confirmationStatus:"confirmed",slot:2,confirmations:1}]};
      else { assert.equal(body.method,"getBlockHeight"); assert.equal(body.params[0].minContextSlot, 1); assert.equal(body.params[0].commitment, "confirmed"); result=++heightCalls===1?980:999; }
      return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result}));
    };
    const signature = await sendSettlementV1([ix], { payerSigner, additionalSigners:[motherSigner], rpcUrl:"http://127.0.0.1:8787",
      pollMs:1, onSigned:async s=>{recorded=s;} });
    assert.equal(signature,recorded.signature); assert.equal(broadcasts,1);
    assert.deepEqual(methods,["getLatestBlockhash","getBlockHeight","sendTransaction","getSignatureStatuses","getBlockHeight","getSignatureStatuses"]);
    assert.equal(recorded.lastValidBlockHeight,"1000"); assert.equal(recorded.wireSha256.length,64);

    // Lost send and lost confirmation responses retain the same exact identity;
    // the helper never performs a second broadcast or creates another message.
    for (const failure of ["sendTransaction", "getSignatureStatuses"]) {
      let known: any, sends=0;
      globalThis.fetch = async (_url, init) => {
        const body=JSON.parse(String(init?.body));
        if(body.method==="sendTransaction") sends++;
        if(body.method===failure) throw new Error("synthetic network interruption");
        return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result:body.method==="getLatestBlockhash"?{context:{slot:1},value:lifetime}:body.method==="getBlockHeight"?980:known.signature}));
      };
      await assert.rejects(sendSettlementV1([ix],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async s=>{known=s;}}),error=>String(error).includes(known.signature) && String(error).includes("phase=" + (failure === "sendTransaction" ? "SEND" : "CONFIRM")) && !String(error).includes("synthetic network interruption"));
      assert.equal(sends,1);
    }
    let sends=0;
    globalThis.fetch=async (_url,init)=>{const body=JSON.parse(String(init?.body)); if(body.method==="sendTransaction") sends++; return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,result:body.method==="getBlockHeight"?980:{context:{slot:1},value:lifetime}}));};
    await assert.rejects(sendSettlementV1([ix],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async()=>{throw new Error("checkpoint unavailable");}}),/checkpoint unavailable/);
    assert.equal(sends,0);
    const huge=new TransactionInstruction({...ix,data:Buffer.alloc(5000)});
    await assert.rejects(sendSettlementV1([huge],{payerSigner,additionalSigners:[motherSigner],rpcUrl:"https://offline.invalid",onSigned:async()=>assert.fail("oversize must not persist or submit") }));
  } finally { globalThis.fetch=originalFetch; }
});

test("Mother signing can consume the hash lifetime without checkpointing or broadcasting stale bytes", async () => {
  const originalFetch = globalThis.fetch;
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(5));
  const mother = Keypair.fromSeed(new Uint8Array(32).fill(6));
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey);
  const motherSigner = await createKeyPairTransactionSigner(mother.secretKey);
  const ix = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    keys: [payer, mother].map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: true })), data: Buffer.from("offline-aging-fixture") });
  try {
    // Expired, final valid height, forwarding allowance of six, and a margin
    // just below twenty must all stop before any execution identity is saved.
    for (const remainingHeights of [-1, 0, 6, 19]) {
      let height = 850, motherFinished = false, checkpoints = 0, sends = 0;
      const methods: string[] = [];
      const delayedMother = { ...motherSigner, signTransactions: async (...args: Parameters<typeof motherSigner.signTransactions>) => {
        const signatures = await motherSigner.signTransactions(...args);
        height = 1000 - remainingHeights;
        motherFinished = true;
        return signatures;
      } };
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body)); methods.push(body.method);
        if (body.method === "sendTransaction") { sends++; assert.fail("stale bytes must not be broadcast"); }
        if (body.method === "getLatestBlockhash") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id,
          result: { context: { slot: 71 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 } } }));
        assert.equal(body.method, "getBlockHeight");
        assert.equal(motherFinished, true, "remaining lifetime must be checked after Mother signing");
        assert.deepEqual(body.params, [{ commitment: "confirmed", minContextSlot: 71 }]);
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: height }));
      };
      await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [delayedMother], rpcUrl: "https://offline.invalid",
        onSigned: async () => { checkpoints++; } }), error => error instanceof Error && error.message === "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION");
      assert.deepEqual(methods, ["getLatestBlockhash", "getBlockHeight"]);
      assert.equal(checkpoints, 0);
      assert.equal(sends, 0);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("malformed selected and observed block heights fail closed before checkpoint or broadcast", async () => {
  const originalFetch = globalThis.fetch;
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const mother = Keypair.fromSeed(new Uint8Array(32).fill(8));
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey);
  const motherSigner = await createKeyPairTransactionSigner(mother.secretKey);
  const ix = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    keys: [payer, mother].map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: true })), data: Buffer.from("offline-malformed-height-fixture") });
  try {
    for (const field of ["lastValidBlockHeight", "currentHeight"]) {
      for (const rawHeight of ["-1", "0", "980.5", "null", '"980"', "{}", "18446744073709551616", "1e999", "NaN"]) {
        let checkpoints = 0, sends = 0;
        globalThis.fetch = async (_url, init) => {
          const body = JSON.parse(String(init?.body));
          if (body.method === "sendTransaction") { sends++; assert.fail("invalid heights must not be broadcast"); }
          let result: string;
          if (body.method === "getLatestBlockhash") result = '{"context":{"slot":71},"value":{"blockhash":"11111111111111111111111111111111","lastValidBlockHeight":'
            + (field === "lastValidBlockHeight" ? rawHeight : "1000") + "}}";
          else {
            assert.equal(body.method, "getBlockHeight");
            assert.deepEqual(body.params, [{ commitment: "confirmed", minContextSlot: 71 }]);
            result = rawHeight;
          }
          // Preserve the exact JSON number token so Kit's lossless parser and
          // bigint transformer are part of the exercised validation boundary.
          return new Response('{"jsonrpc":"2.0","id":' + JSON.stringify(body.id) + ',"result":' + result + "}");
        };
        await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [motherSigner], rpcUrl: "https://offline.invalid",
          onSigned: async () => { checkpoints++; } }), error => {
          const expected = rawHeight === "NaN" ? field === "lastValidBlockHeight"
            ? "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_UNAVAILABLE" : "TCAP_TRANSACTION_BLOCKHASH_HEIGHT_UNAVAILABLE"
            : "TCAP_TRANSACTION_BLOCKHASH_HEIGHT_INVALID";
          assert.ok(error instanceof Error);
          assert.equal(error.message, expected);
          for (const kind of ["TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING", "SETTLEMENT"]) {
            assert.equal(nativeWorkRetryReason({ kind, verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1" } }, error), null);
          }
          return true;
        });
        assert.equal(checkpoints, 0);
        assert.equal(sends, 0);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("RPC submission diagnostics keep numeric rejection details and redact provider data", async () => {
  const originalFetch = globalThis.fetch;
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(3));
  const mother = Keypair.fromSeed(new Uint8Array(32).fill(4));
  const payerSigner = await createKeyPairTransactionSigner(payer.secretKey);
  const motherSigner = await createKeyPairTransactionSigner(mother.secretKey);
  const ix = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    keys: [payer, mother].map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: true })), data: Buffer.from("offline-fixture") });
  const privateText = "https://private.invalid/?api-key=SECRET signed-wire PRIVATE-MEMO";
  const cases = [
    { code: -32002, data: { err: { InstructionError: [0, { Custom: 6063 }] }, logs: [privateText] }, expected: /reason=PREFLIGHT_REJECTED rpcCode=-32002 solanaCode=\d+ instruction=0 programError=6063/ },
    { code: -32002, data: { err: "BlockhashNotFound", logs: [privateText] }, expected: /reason=PREFLIGHT_REJECTED rpcCode=-32002 solanaCode=7050008 transactionError=BLOCKHASH_NOT_FOUND/ },
    { code: -32002, data: { err: { InstructionError: [0, { BorshIoError: privateText }] }, logs: [privateText] }, expected: /reason=PREFLIGHT_REJECTED rpcCode=-32002 solanaCode=\d+ instruction=0/ },
    { code: -32602, data: { request: privateText }, expected: /reason=RPC_REJECTED rpcCode=-32602/ },
    { code: -32015, data: { request: privateText }, expected: /reason=RPC_REJECTED rpcCode=-32015/ },
  ];
  try {
    for (const fixture of cases) {
      let recorded: SettlementSubmission | undefined, sends = 0;
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.method === "sendTransaction") {
          sends++;
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: fixture.code, message: privateText, data: fixture.data } }));
        }
        if (body.method === "getBlockHeight") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: 980 }));
        assert.equal(body.method, "getLatestBlockhash");
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 } } }));
      };
      await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [motherSigner], rpcUrl: "https://offline.invalid",
        onSigned: async s => { recorded = s; } }), error => {
        const message = String(error);
        assert.match(message, fixture.expected);
        assert.match(message, /phase=SEND/);
        assert.ok(recorded && message.includes(recorded.signature));
        for (const sensitive of ["private.invalid", "SECRET", "signed-wire", "PRIVATE-MEMO"]) assert.ok(!message.includes(sensitive));
        return true;
      });
      assert.equal(sends, 1);
    }
    for (const status of [429, 503]) {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.method === "sendTransaction") return new Response(privateText, { status });
        if (body.method === "getBlockHeight") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: 980 }));
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 } } }));
      };
      await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [motherSigner], rpcUrl: "https://offline.invalid", onSigned: async () => {} }),
        error => String(error).includes(`reason=HTTP_ERROR httpStatus=${status}`) && !String(error).includes(privateText));
    }
    let sends = 0;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === "sendTransaction") {
        sends++;
        return new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!;
          if (signal.aborted) reject(signal.reason);
          else {
            const fallback = setTimeout(() => reject(new Error(privateText)), 500);
            signal.addEventListener("abort", () => { clearTimeout(fallback); reject(signal.reason); }, { once: true });
          }
        });
      }
      if (body.method === "getBlockHeight") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: 980 }));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000 } } }));
    };
    await assert.rejects(sendSettlementV1([ix], { payerSigner, additionalSigners: [motherSigner], rpcUrl: "https://offline.invalid", confirmationTimeoutMs: 20, onSigned: async () => {} }), /phase=SEND reason=TIMEOUT/);
    assert.equal(sends, 1);
  } finally { globalThis.fetch = originalFetch; }
});
