import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";

test("expired failed credit resolves only with an unchanged finalized root, retaining original work", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-nonexecution-"));
  const names = ["TSN_RECEIVER_LOCAL_FILE", "TSN_RECEIVER_NODE_API_KEY", "TSN_RPC_URL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const realFetch = globalThis.fetch;
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
  process.env.TSN_RECEIVER_NODE_API_KEY = "synthetic-recovery-key";
  process.env.TSN_RPC_URL = "https://offline.invalid";
  try {
    for (const name of ["work-contract", "failed-settlement-resolution", "local-firestore", "store", "settlement-retry", "native-work-retry", "node-authorizations", "auth"]) {
      const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        .replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"').replace('from "firebase-admin/firestore"', 'from "./firestore-stub.mjs"')
        .replace('from "@solana/web3.js"', `from ${JSON.stringify(import.meta.resolve("@solana/web3.js"))}`);
      await writeFile(path.join(directory, `${name}.mjs`), compiled);
    }
    for (const [name, source] of Object.entries({
      firebase: 'import {localDb} from "./local-firestore.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
      "firestore-stub": "export const FieldPath={};export const Timestamp={};",
      "node-envelope": "export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
      "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
      "node-wake": "export const wakes=[];let check=async()=>{};export const setWakeCheck=fn=>{check=fn};export const wakeTsnNode=async reason=>{await check();wakes.push(reason)};",
      "cranker-wake": "export const publishCrankerWake=async()=>{};",
      "next-stub": "export class NextResponse {static json(data,options={}){return {status:options.status??200,data};}}",
    })) await writeFile(path.join(directory, `${name}.mjs`), source);
    const routeSource = await readFile(new URL("../app/api/internal/node/work/resolve-failed/route.ts", import.meta.url), "utf8");
    const route = ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
      .replace('from "next/server"', 'from "./next-stub.mjs"').replace(/from "(?:\.\.\/)+lib\/([^".]+)"/g, 'from "./$1.mjs"');
    await writeFile(path.join(directory, "route.mjs"), route);
    const load = name => import(pathToFileURL(path.join(directory, `${name}.mjs`)).href);
    const { db, workCollection } = await load("firebase");
    const { payloadCommitment, createReceivedWork, hasResolvedNonExecution } = await load("work-contract");
    const { resolveFailedSettlement } = await load("failed-settlement-resolution");
    const { leaseForNode } = await load("store");
    const { POST } = await load("route");
    const { wakes, setWakeCheck } = await load("node-wake");
    const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
    const [rootAddress, bump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:commitment-root:v1")], TCAP);
    const funding = { ...createReceivedWork({ id: "funded-old", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "old-payment" } }), status: "CONFIRMED", stateVersion: 5, result: { signature: "confirmed-funding" } };
    const id = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
    const signature = "4je4ACJRGaRfWzrHSRVw7k99KWp4pSGrdaPMcwcj7mhBDAsdLAkyF2RwJ8Tm5YChU6CyaadsLGd6YYyaCqKWrbqn";
    const transition = { commitmentRoot: rootAddress.toBase58(), previousTcapRoot: "aa".repeat(32), tcapRootSequence: "6", validAfterSlot: "850", expiresAtSlot: "900",
      proof: { publicInputs: ["aa".repeat(32), ...Array(12).fill("bb".repeat(32))] }, memoPayload: "synthetic encrypted Memo" };
    const work = { ...createReceivedWork({ id, kind: "SETTLEMENT", payload: { intentId: funding.id, paymentId: funding.payload.paymentId } }), status: "FAILED", stateVersion: 303,
      verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", payloadDelta: { addedFields: { tcapCreditTransition: transition }, changedFields: {}, removedFields: [] } },
      authorization: { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", transition, workStateVersion: 301, leaseId: id, leaseVersion: 301, leaseExpiresAt: new Date(0).toISOString() },
      result: { signature, blockhash: "AtsZHJL9F6j7kpmW3DQ4Sy25WZXTdbRYUiXFCBRgXtCd", lastValidBlockHeight: "500", wireSha256: "cc".repeat(32), wireBytes: 2909, stage: "TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", reason: "historical preflight rejection" },
      retryHistory: [{ reason: "retained original history" }], nodeLease: null, crankerLease: null };
    const nextFunding = { ...funding, id: "funded-next" };
    const next = createReceivedWork({ id: "new-settlement", kind: "SETTLEMENT", payload: { intentId: nextFunding.id } });
    const rootData = Buffer.alloc(124);
    createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().copy(rootData, 0, 0, 8);
    rootData.writeUInt16LE(1, 8); rootData.writeUInt16LE(1, 10); rootData.fill(0xaa, 12, 44); rootData.writeUInt32LE(6, 76); rootData.writeBigUInt64LE(5n, 80); rootData[123] = bump;
    const rootReply = slot => ({ context: { slot }, value: { owner: TCAP.toBase58(), data: [rootData.toString("base64"), "base64"] } });
    const params = { id, expectedVersion: 303, signature, execute: false };
    const request = (body = params, key = "synthetic-recovery-key") => ({ headers: new Headers({ "x-api-key": key }), json: async () => body });
    const reset = async (changedWork = work, changedFunding = funding) => {
      wakes.length = 0;
      await db.runTransaction(async tx => {
        tx.set(workCollection.doc(id), changedWork); tx.set(workCollection.doc(funding.id), changedFunding);
        tx.set(workCollection.doc(nextFunding.id), nextFunding); tx.set(workCollection.doc(next.id), next);
        tx.set(db.collection("tsn_private_credit_locks").doc("global-root"), { workId: id });
      });
    };
    let calls = [];
    const rpcFixture = (change = async (method, result) => result) => {
      calls = []; let roots = 0;
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "https://offline.invalid");
        const body = JSON.parse(init.body); calls.push(body);
        assert.ok(["getAccountInfo", "getTransaction", "getSignatureStatuses", "isBlockhashValid", "getBlockHeight"].includes(body.method), "no mutating RPC method is permitted");
        let result;
        if (body.method === "getAccountInfo") { roots++; result = rootReply(roots === 1 ? 1000 : 1003); assert.equal(body.params[0], rootAddress.toBase58()); assert.equal(body.params[1].commitment, "finalized"); if (roots > 1) assert.equal(body.params[1].minContextSlot, 1002); }
        if (body.method === "getTransaction") { result = null; assert.equal(body.params[0], signature); assert.equal(body.params[1].commitment, "finalized"); }
        if (body.method === "getSignatureStatuses") { result = { context: { slot: 1001 }, value: [null] }; assert.equal(body.params[1].searchTransactionHistory, true); }
        if (body.method === "isBlockhashValid") { result = { context: { slot: 1002 }, value: false }; assert.equal(body.params[1].minContextSlot, 1000); assert.equal(body.params[1].commitment, "finalized"); }
        if (body.method === "getBlockHeight") { result = 501; assert.equal(body.params[0].minContextSlot, 1002); assert.equal(body.params[0].commitment, "finalized"); }
        const changed = await change(body.method, structuredClone(result), roots);
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: changed }));
      };
    };
    await reset(); rpcFixture();
    setWakeCheck(async () => assert.equal(hasResolvedNonExecution((await workCollection.doc(id).get()).data()), true, "wake follows durable resolution"));

    await t.test("authentication, body validation and stale versions perform no RPC", async () => {
      assert.equal((await POST(request(params, "wrong"))).status, 401);
      assert.equal((await POST(request({ ...params, execute: "false" }))).status, 400);
      assert.equal((await POST(request({ ...params, expectedVersion: 0 }))).status, 400);
      await assert.rejects(resolveFailedSettlement({ ...params, expectedVersion: 302 }), /STALE_STATE_VERSION/);
      assert.equal(calls.length, 0); assert.equal(wakes.length, 0);
    });
    await t.test("preview preserves every original record and leaves the global lock blocking", async () => {
      assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
      const before = await readFile(process.env.TSN_RECEIVER_LOCAL_FILE, "utf8");
      const preview = await POST(request()); assert.equal(preview.status, 200); assert.equal(preview.data.executed, false);
      assert.equal(preview.data.resolution.finalizedSlot, 1003); assert.equal(preview.data.resolution.rootSequence, "5");
      assert.equal(await readFile(process.env.TSN_RECEIVER_LOCAL_FILE, "utf8"), before); assert.equal(wakes.length, 0);
      assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
    });
    await t.test("processed signature-status context never becomes a finalized bank minimum", async () => {
      await reset();
      rpcFixture(async (method, result) => method === "getSignatureStatuses" ? { ...result, context: { slot: 2000 } } : result);
      const preview = await resolveFailedSettlement(params);
      assert.equal(preview.executed, false); assert.equal(preview.resolution.signatureStatusContextSlot, 2000);
      assert.equal(preview.resolution.finalizedSlot, 1003);
      assert.equal(calls.find(call => call.method === "isBlockhashValid").params[1].minContextSlot, 1000);
    });
    await t.test("observed transactions, advanced roots and insufficient finality always retain the lock", async () => {
      const cases = [
        ["getTransaction", () => ({ meta: { err: null } }), /RECEIPT_OBSERVED/],
        ["getTransaction", () => ({ meta: { err: { InstructionError: [0, 1] } } }), /RECEIPT_OBSERVED/],
        ["getSignatureStatuses", r => ({ ...r, value: [{ confirmationStatus: "processed" }] }), /SIGNATURE_OBSERVED/],
        ["getSignatureStatuses", r => ({ ...r, context: { slot: 999 } }), /STALE_RPC_CONTEXT/],
        ["getAccountInfo", r => ({ ...r, context: { slot: 900 } }), /AUTHORIZATION_NOT_EXPIRED/],
        ["getAccountInfo", r => { const d = Buffer.from(r.value.data[0], "base64"); d.writeBigUInt64LE(6n, 80); r.value.data[0] = d.toString("base64"); return r; }, /ROOT_CHANGED/],
        ["getAccountInfo", r => { const d = Buffer.from(r.value.data[0], "base64"); d[12] ^= 1; r.value.data[0] = d.toString("base64"); return r; }, /ROOT_CHANGED/],
        ["getAccountInfo", r => ({ ...r, value: { ...r.value, owner: PublicKey.default.toBase58() } }), /INVALID_ROOT_ACCOUNT/],
        ["getAccountInfo", r => { const d = Buffer.from(r.value.data[0], "base64"); d[123] ^= 1; r.value.data[0] = d.toString("base64"); return r; }, /INVALID_ROOT_ACCOUNT/],
        ["isBlockhashValid", r => ({ ...r, value: true }), /BLOCKHASH_NOT_EXPIRED/],
        ["isBlockhashValid", r => ({ ...r, context: { slot: 999 } }), /STALE_RPC_CONTEXT/],
        ["getBlockHeight", () => 500, /BLOCKHASH_NOT_EXPIRED/],
        ["getBlockHeight", () => null, /BLOCKHASH_NOT_EXPIRED/],
      ];
      for (const [method, alter, reason] of cases) {
        await reset(); rpcFixture(async (called, result) => called === method ? alter(result) : result);
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), reason);
        assert.deepEqual((await workCollection.doc(id).get()).data(), work); assert.equal(wakes.length, 0);
        assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
      }
      for (const offset of [0, 8, 10]) {
        await reset(); rpcFixture(async (method, result) => {
          if (method === "getAccountInfo") { const d = Buffer.from(result.value.data[0], "base64"); d[offset] ^= 1; result.value.data[0] = d.toString("base64"); }
          return result;
        });
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /INVALID_ROOT_ACCOUNT/);
      }
      await reset(); rpcFixture(async (method, result) => method === "getAccountInfo" ? { ...result, value: { ...result.value, data: [Buffer.alloc(123).toString("base64"), "base64"] } } : result);
      await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /INVALID_ROOT_ACCOUNT/);
      await reset(); rpcFixture(async (method, result, roots) => method === "getAccountInfo" && roots === 2 ? { ...result, context: { slot: 1001 } } : result);
      await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /STALE_RPC_CONTEXT/);
    });
    await t.test("RPC transport, JSON-RPC errors and missing data are failures", async () => {
      for (const fetcher of [async () => { throw new Error("dependency secret must stay hidden"); }, async () => new Response("error", { status: 500 }),
        async () => new Response(JSON.stringify({ error: { message: "dependency secret" } })), async () => new Response(JSON.stringify({ jsonrpc: "2.0" })),
        async () => new Response(JSON.stringify({ result: null }))]) {
        await reset(); globalThis.fetch = fetcher;
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /RPC_UNAVAILABLE|STALE_RPC_CONTEXT/);
        assert.deepEqual((await workCollection.doc(id).get()).data(), work); assert.equal(wakes.length, 0);
      }
    });
    await t.test("checkpoint, authorization, payload and funding must retain exact correspondence", async () => {
      for (const changed of [
        { ...work, result: { ...work.result, wireSha256: "invalid" } },
        { ...work, result: { ...work.result, wireBytes: 0 } },
        { ...work, result: { ...work.result, blockhash: PublicKey.default.toBase58() } },
        { ...work, result: { ...work.result, stage: "different" } },
        { ...work, result: { ...work.result, signature: "different" } },
        { ...work, authorization: { ...work.authorization, kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2" } },
        { ...work, authorization: { ...work.authorization, transition: { ...transition, previousTcapRoot: "dd".repeat(32) } } },
        { ...work, payload: { ...work.payload, intentId: "changed-funding" } },
        { ...work, crankerLease: { owner: "still-leased", expiresAt: new Date(0).toISOString() } },
      ]) {
        await reset(changed); rpcFixture();
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true })); assert.equal(calls.length, 0); assert.equal(wakes.length, 0);
      }
      await reset(work, { ...funding, status: "FAILED" }); rpcFixture();
      await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /FUNDING_NOT_CONFIRMED/);
    });
    await t.test("concurrent work, authorization or funding changes reject the entire disposition", async () => {
      for (const mutate of [
        async () => db.runTransaction(async tx => tx.update(workCollection.doc(id), { stateVersion: 304 })),
        async () => db.runTransaction(async tx => tx.update(workCollection.doc(id), { authorization: { ...work.authorization, extraContext: "changed" } })),
        async () => db.runTransaction(async tx => tx.update(workCollection.doc(funding.id), { stateVersion: 6 })),
        async () => db.runTransaction(async tx => tx.update(workCollection.doc(id), { result: { ...work.result, reason: "changed" } })),
      ]) {
        await reset(); let mutated = false;
        rpcFixture(async (method, result) => { if (method === "getTransaction" && !mutated) { mutated = true; await mutate(); } return result; });
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /STALE_STATE_VERSION/);
        assert.equal((await workCollection.doc(id).get()).data().nonExecutionResolution, undefined); assert.equal(wakes.length, 0);
      }
    });
    await t.test("execution records nonexecution, preserves originals and permits the next normal lease", async () => {
      await reset(); rpcFixture();
      const response = await POST(request({ ...params, execute: true })); assert.equal(response.status, 200); assert.equal(response.data.executed, true); assert.equal(response.data.stateVersion, 304);
      const after = (await workCollection.doc(id).get()).data();
      assert.equal(after.status, "FAILED"); assert.equal(hasResolvedNonExecution(after), true);
      for (const field of ["authorization", "verification", "result", "payload", "payloadCommitment", "retryHistory", "nodeLease", "crankerLease"]) assert.deepEqual(after[field], work[field]);
      assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
      assert.deepEqual(after.nonExecutionHistory, [after.nonExecutionResolution]); assert.deepEqual(wakes, ["PRIVATE_CREDIT_NONEXECUTION_RESOLVED"]);
      assert.equal((await db.collection("tsn_private_credit_locks").doc("global-root").get()).data().workId, id, "recovery does not delete or redirect the lock");
      for (const field of ["result", "authorization", "verification", "payload"]) assert.equal(hasResolvedNonExecution({ ...after, [field]: { ...after[field], changed: true } }), false);
      assert.equal(hasResolvedNonExecution({ ...after, stateVersion: 305 }), false);
      assert.equal(hasResolvedNonExecution({ ...work, nonExecutionResolution: { kind: "EXPIRED_UNCHANGED_ROOT" } }), false);
      assert.equal((await leaseForNode("waiting-node", ["SETTLEMENT"])).id, next.id);
      await assert.rejects(resolveFailedSettlement({ ...params, expectedVersion: 304, execute: true }), /NOT_FAILED_NATIVE_CREDIT/);
      assert.equal(payloadCommitment(after.result), after.nonExecutionResolution.checkpointCommitment);
    });
  } finally {
    globalThis.fetch = realFetch;
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    await rm(directory, { recursive: true, force: true });
  }
});
