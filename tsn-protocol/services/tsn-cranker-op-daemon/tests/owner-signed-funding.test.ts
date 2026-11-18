import assert from "node:assert/strict";
import test from "node:test";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createOwnerFundingSubmission, OwnerFundingSubmissionError, readOwnerSignedFunding, sendOwnerSignedFunding } from "../src/dbrix/owner-signed-funding.js";

const owner = Keypair.fromSeed(new Uint8Array(32).fill(21));
const hash = new PublicKey(new Uint8Array(32).fill(22)).toBase58();
const context = { blockhash: hash, lastValidBlockHeight: 1100, contextSlot: 99 };
const transaction = new Transaction({ feePayer: owner.publicKey, recentBlockhash: hash }).add(
  SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: new PublicKey(new Uint8Array(32).fill(23)), lamports: 1 }),
);
transaction.sign(owner);
const wire = transaction.serialize();

test("owner funding validates the Node-bound context and preserves every signed byte", () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  assert.deepEqual(funding.wire, wire);
  assert.deepEqual(funding.ownerSignature, transaction.signatures[0].signature);
  assert.deepEqual(funding.blockhashContext, context);
  assert.doesNotThrow(() => readOwnerSignedFunding(wire.toString("base64"), { ...context, contextSlot: 0 }));
});

test("missing, malformed, noncanonical or mismatched context refuses before an RPC send", async () => {
  let sends = 0;
  const connection = { getBlockHeight: async () => 1000, sendRawTransaction: async () => { sends++; return "unexpected"; } };
  const invalid: unknown[] = [undefined, null, [], {}, { ...context, extra: 1 },
    { blockhash: hash, contextSlot: 99 }, { ...context, blockhash: "invalid" },
    { ...context, blockhash: "11111111111111111111111111111111" },
    { ...context, blockhash: " " + hash },
    { ...context, blockhash: new PublicKey(new Uint8Array(32).fill(24)).toBase58() },
  ];
  for (const bad of ["99", -1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, true, NaN, Infinity]) {
    invalid.push({ ...context, contextSlot: bad });
  }
  for (const bad of ["1100", 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, true, NaN, Infinity]) {
    invalid.push({ ...context, lastValidBlockHeight: bad });
  }
  for (const rawContext of invalid) {
    await assert.rejects(async () => sendOwnerSignedFunding(connection,
      readOwnerSignedFunding(wire.toString("base64"), rawContext)), /TCAP_FUNDING_BLOCKHASH_CONTEXT_/);
  }
  assert.equal(sends, 0);
});

test("funding refuses noncanonical base64 and a damaged wallet signature", () => {
  assert.throws(() => readOwnerSignedFunding(wire.toString("base64") + "\n", context), /not valid base64/);
  const damaged = Buffer.from(wire);
  damaged[1] ^= 1;
  assert.throws(() => readOwnerSignedFunding(damaged.toString("base64"), context), /Signature verification failed/);
});

test("primary and fallback funding sends use identical signed bytes and confirmed minimum-context preflight", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  const trace = createOwnerFundingSubmission(funding);
  const savedFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, any> }[] = [];
  let sends = 0;
  try {
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), body });
      const result = body.method === "getBlockHeight"
        ? { result: String(url).includes("primary") ? 1070 : 1075 }
        : ++sends === 1
          ? { error: { code: -32002, message: "Transaction simulation failed: Blockhash not found", data: { err: "BlockhashNotFound", logs: [] } } }
          : { result: trace.expectedSignature };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...result }));
    };
    await assert.rejects(sendOwnerSignedFunding(new Connection("https://primary.invalid", { fetch: globalThis.fetch }), funding, trace), /BLOCKHASH_NOT_FOUND/);
    assert.equal(await sendOwnerSignedFunding(new Connection("https://fallback.invalid", { fetch: globalThis.fetch }), funding, trace, "FALLBACK"), trace.expectedSignature);
    assert.equal(calls.length, 4);
    const heightCalls = calls.filter(call => call.body.method === "getBlockHeight");
    for (const call of heightCalls) assert.deepEqual(call.body.params, [{ commitment: "confirmed", minContextSlot: 99 }]);
    const sendCalls = calls.filter(call => call.body.method === "sendTransaction");
    for (const call of sendCalls) {
      assert.equal(call.body.method, "sendTransaction");
      assert.equal(call.body.params[0], wire.toString("base64"));
      assert.equal(call.body.params[1].skipPreflight ?? false, false);
      assert.deepEqual(call.body.params[1], { encoding: "base64", preflightCommitment: "confirmed", minContextSlot: 99 });
    }
    assert.deepEqual(sendCalls[0].body.params, sendCalls[1].body.params);
    assert.deepEqual(trace.attempts.map(attempt => [attempt.endpoint, attempt.observedBlockHeight, attempt.remainingBlocks]), [
      ["PRIMARY", 1070, 30], ["FALLBACK", 1075, 25],
    ]);
    assert.deepEqual(funding.wire, wire);
  } finally { globalThis.fetch = savedFetch; }
});

test("funding refuses a signed wire below the 20-block margin and permits its exact boundary", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  for (const height of [1081, 1100, 1101]) {
    const trace = createOwnerFundingSubmission(funding);
    let sends = 0;
    await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => height,
      sendRawTransaction: async () => { sends++; return trace.expectedSignature; } }, funding, trace), (error: unknown) => {
      assert.ok(error instanceof OwnerFundingSubmissionError);
      assert.equal(error.reason, "BLOCKHASH_TOO_OLD_FOR_SUBMISSION");
      assert.equal(error.evidence.signature, trace.expectedSignature);
      assert.deepEqual(trace.attempts[0], { endpoint: "PRIMARY", phase: "BLOCK_HEIGHT", observedBlockHeight: height,
        remainingBlocks: 1100 - height, sendInvoked: false, outcome: "BLOCKHASH_TOO_OLD_FOR_SUBMISSION" });
      assert.doesNotMatch(error.message, /nonexecution|not executed|expired/i);
      return true;
    });
    assert.equal(sends, 0);
  }
  for (const height of [1079, 1080]) {
    const trace = createOwnerFundingSubmission(funding);
    assert.equal(await sendOwnerSignedFunding({ getBlockHeight: async () => height,
      sendRawTransaction: async () => trace.expectedSignature }, funding, trace), trace.expectedSignature);
  }
});

test("malformed or unavailable height observations fail closed without preserving raw RPC data", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  for (const height of ["1000", 0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, true, { secret: "SENSITIVE" }]) {
    const trace = createOwnerFundingSubmission(funding);
    let sends = 0;
    await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => height as number,
      sendRawTransaction: async () => { sends++; return trace.expectedSignature; } }, funding, trace), /BLOCK_HEIGHT_INVALID/);
    assert.equal(sends, 0);
    assert.equal(trace.attempts[0].observedBlockHeight, null);
    assert.doesNotMatch(JSON.stringify(trace), /SENSITIVE/);
  }
  const trace = createOwnerFundingSubmission(funding);
  await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => { throw Object.assign(new Error("https://private.invalid?key=SENSITIVE"), { code: -32016 }); },
    sendRawTransaction: async () => { throw new Error("must not send"); } }, funding, trace), (error: unknown) => {
    assert.ok(error instanceof OwnerFundingSubmissionError);
    assert.equal(error.reason, "BLOCK_HEIGHT_UNAVAILABLE");
    assert.equal(trace.attempts[0].rpcCode, -32016);
    assert.doesNotMatch(error.message + JSON.stringify(error.evidence), /private.invalid|SENSITIVE|must not send/);
    return true;
  });
});

test("invalid JSON-RPC height types are refused before broadcast by the real Connection adapter", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  for (const height of ["1000", null, true, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const methods: string[] = [];
    const connection = new Connection("https://offline.invalid", { fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)); methods.push(request.method);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: height }));
    } });
    await assert.rejects(sendOwnerSignedFunding(connection, funding), /BLOCK_HEIGHT_INVALID/);
    assert.deepEqual(methods, ["getBlockHeight"]);
  }
});

test("fallback rechecks remaining lifetime and retains the original primary-send ambiguity", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  const trace = createOwnerFundingSubmission(funding);
  await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => 1070,
    sendRawTransaction: async () => { throw new Error("Blockhash not found SENSITIVE"); } }, funding, trace), /BLOCKHASH_NOT_FOUND/);
  let fallbackSends = 0;
  await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => 1081,
    sendRawTransaction: async () => { fallbackSends++; return trace.expectedSignature; } }, funding, trace, "FALLBACK"), (error: unknown) => {
    assert.ok(error instanceof OwnerFundingSubmissionError);
    const evidence = error.evidence.fundingSubmission as typeof trace;
    assert.equal(evidence.expectedSignature, trace.expectedSignature);
    assert.equal(evidence.attempts.length, 2);
    assert.equal(evidence.attempts[0].sendInvoked, true);
    assert.equal(evidence.attempts[1].sendInvoked, false);
    assert.equal(evidence.attempts[1].remainingBlocks, 19);
    assert.doesNotMatch(error.message + JSON.stringify(error.evidence), /SENSITIVE|nonexecution/i);
    return true;
  });
  assert.equal(fallbackSends, 0);
});

test("ambiguous send diagnostics preserve the exact signature and only numeric rejection details", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  const trace = createOwnerFundingSubmission(funding);
  const rpcError = Object.assign(new Error("private URL SENSITIVE signed wire " + wire.toString("base64")), {
    code: -32002, transactionError: { InstructionError: [0, { Custom: 6023 }] }, transactionLogs: ["SENSITIVE"],
  });
  await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => 1050,
    sendRawTransaction: async () => { throw rpcError; } }, funding, trace), (error: unknown) => {
    assert.ok(error instanceof OwnerFundingSubmissionError);
    assert.equal(error.evidence.signature, trace.expectedSignature);
    assert.equal(error.evidence.stage, "TCAP_PRIVATE_FUNDING_V1_FAILED");
    assert.equal(trace.attempts[0].phase, "SEND");
    assert.equal(trace.attempts[0].sendInvoked, true);
    assert.equal(trace.attempts[0].rpcCode, -32002);
    assert.equal(trace.attempts[0].instruction, 0);
    assert.equal(trace.attempts[0].programError, 6023);
    assert.doesNotMatch(error.message + JSON.stringify(error), /SENSITIVE|private URL|signed wire|nonexecution/i);
    return true;
  });
});

test("a wrong returned signature fails with the original identity and already-processed sends require confirmation", async () => {
  const funding = readOwnerSignedFunding(wire.toString("base64"), context);
  const trace = createOwnerFundingSubmission(funding);
  await assert.rejects(sendOwnerSignedFunding({ getBlockHeight: async () => 1050,
    sendRawTransaction: async () => "incorrect RPC signature SENSITIVE" }, funding, trace), (error: unknown) => {
    assert.ok(error instanceof OwnerFundingSubmissionError);
    assert.equal(error.reason, "RPC_SIGNATURE_MISMATCH");
    assert.equal(error.evidence.signature, trace.expectedSignature);
    assert.equal(trace.attempts[0].phase, "SIGNATURE");
    assert.doesNotMatch(JSON.stringify(error), /incorrect RPC signature|SENSITIVE/);
    return true;
  });
  const already = createOwnerFundingSubmission(funding);
  assert.equal(await sendOwnerSignedFunding({ getBlockHeight: async () => 1050,
    sendRawTransaction: async () => { throw new Error("Transaction has already been processed SENSITIVE"); } }, funding, already, "FALLBACK"), already.expectedSignature);
  assert.equal(already.attempts[0].outcome, "ALREADY_PROCESSED");
});
