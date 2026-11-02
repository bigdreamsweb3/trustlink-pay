import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { Keypair, PublicKey } from "@solana/web3.js";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";
import * as sdk from "../../tsn-protocol/sdks/tsn-sdk/dist/index.js";

// Exercise the real XP route and SDK resolver/builder using synthetic RPC
// account data. No ports, wallet approvals or chain submissions are used.
const filename = "../../protocol-tests/ui/server.mjs";
const source = ts.createSourceFile(filename, await readFile(new URL(filename, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "handleApi");
assert.ok(declaration, "XP handleApi must exist");
const handlerSource = declaration.getText(source);
const depositor = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const mint = new PublicKey(new Uint8Array(32).fill(2));
const reserve = new PublicKey(new Uint8Array(32).fill(3));
const vault = new PublicKey(new Uint8Array(32).fill(4));
const reserveAuthority = new PublicKey(new Uint8Array(32).fill(5));
const fundedSource = new PublicKey(new Uint8Array(32).fill(6));
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const program = sdk.GPRU_TCAP_PROGRAM_ID;
const [registry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-registry:v1")], program);
const [entry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], program);
const plain = value => JSON.parse(JSON.stringify(value));

function harness(balance = 2_000_000n) {
  const entryData = Buffer.alloc(287);
  createHash("sha256").update("account:TcapAssetEntryV1").digest().copy(entryData, 0, 0, 8);
  registry.toBuffer().copy(entryData, 12);
  entryData.writeUInt32LE(1, 44);
  tokenProgram.toBuffer().copy(entryData, 48);
  mint.toBuffer().copy(entryData, 80);
  reserve.toBuffer().copy(entryData, 148);
  vault.toBuffer().copy(entryData, 180);
  reserveAuthority.toBuffer().copy(entryData, 212);
  entryData[244] = 6;
  entryData[245] = entryData[283] = entryData[284] = 1;
  const tokenData = owner => {
    const data = Buffer.alloc(165);
    mint.toBuffer().copy(data, 0);
    owner.toBuffer().copy(data, 32);
    data.writeBigUInt64LE(balance, 64);
    return data;
  };
  const accountInfo = (owner, data) => ({ owner, data, executable: false, lamports: 1, rentEpoch: 0 });
  const connection = {
    async getAccountInfo(address) {
      if (address.equals(mint)) return accountInfo(tokenProgram, Buffer.alloc(82));
      assert.ok(address.equals(entry), "Resolver must read the canonical asset entry");
      return accountInfo(program, entryData);
    },
    async getMultipleAccountsInfo(addresses) {
      assert.deepEqual(Array.from(addresses, address => address.toBase58()), [reserve.toBase58(), vault.toBase58()]);
      return [accountInfo(program, Buffer.alloc(128)), accountInfo(tokenProgram, tokenData(reserveAuthority))];
    },
    async getTokenAccountsByOwner(owner, filter) {
      assert.ok(owner.equals(depositor) && filter.mint.equals(mint));
      return { value: [{ pubkey: fundedSource, account: accountInfo(tokenProgram, tokenData(depositor)) }] };
    },
    async getSlot() { return 100; },
  };
  const session = {
    wallet: depositor.toBase58(), csrfToken: "synthetic-test-token",
    resolvedTin: { tin: "1234567890", ownerPubkeyHash: "ab".repeat(32), expiresAt: Date.now() + 60_000 },
  };
  let blockhashReads = 0;
  const handler = vm.runInNewContext(`${handlerSource}\nhandleApi`, {
    port: 4317, Buffer, PublicKey, createHash, AbortSignal,
    process: { env: {} }, tsnSdk: sdk,
    getSession: () => session,
    readJson: async request => request.body,
    json: (response, status, body) => Object.assign(response, { status, body }),
    resolveRpcUrl: async () => "http://127.0.0.1:1",
    createRpcReadSession: () => ({ read: operation => operation(connection) }),
    configuredNodeUrl: () => "http://127.0.0.1:1",
    fetch: async () => {
      blockhashReads++;
      return { ok: true, json: async () => ({ recentBlockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 200, contextSlot: 100 }) };
    },
  });
  return {
    session, blockhashReads: () => blockhashReads,
    async prepare(amount = "1.25") {
      const response = {};
      await handler({ method: "POST", headers: { "x-trustlink-csrf": session.csrfToken }, body: { recipientTin: "1234567890", tokenMintAddress: mint.toBase58(), amount } }, response, { pathname: "/api/tsn/sdk/prepare-tin-credit" });
      return response;
    },
  };
}

test("XP prepares the real resolver result with numeric metadata and builds the exact deposit from the selected funded source", async () => {
  const server = harness();
  const response = await server.prepare();
  assert.equal(response.status, 200);
  const body = plain(response.body);
  assert.equal(body.decimals, 6);
  assert.equal(body.amountBaseUnits, "1250000");
  assert.equal(body.sourceTokenBalance, "2000000");
  assert.equal(body.depositAccounts.source, fundedSource.toBase58());
  assert.deepEqual(plain(server.session.pendingTinCredit.accounts), body.depositAccounts);
  assert.equal(Object.values(body.depositAccounts).every(value => typeof value === "string"), true);
  assert.equal("tokenId" in body.depositAccounts || "decimals" in body.depositAccounts || "assetEntryAccount" in body.depositAccounts, false);
  const accounts = Object.fromEntries(Object.entries(body.depositAccounts).map(([name, value]) => [name, new PublicKey(value)]));
  const transaction = sdk.buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: BigInt(body.amountBaseUnits) });
  assert.equal(transaction.feePayer.toBase58(), depositor.toBase58());
  assert.equal(transaction.instructions.length, 1);
  const instruction = transaction.instructions[0];
  assert.equal(instruction.programId.toBase58(), program.toBase58());
  assert.deepEqual(instruction.keys.map(key => key.pubkey.toBase58()), [depositor, accounts.config, entry, reserve, fundedSource, vault, mint, tokenProgram].map(key => key.toBase58()));
  assert.equal(instruction.data.subarray(0, 8).toString("hex"), createHash("sha256").update("global:deposit_asset_v2").digest().subarray(0, 8).toString("hex"));
  assert.equal(instruction.data.readBigUInt64LE(8), 1_250_000n);
});

test("XP retains insufficient-token-balance rejection before blockhash preparation", async () => {
  const server = harness(1_000_000n);
  const response = await server.prepare();
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "INSUFFICIENT_SENDER_TOKEN_BALANCE");
  assert.equal(server.blockhashReads(), 0);
  assert.equal(server.session.pendingTinCredit, undefined);
});

test("XP retains registered token precision checks before preparation", async () => {
  const server = harness();
  const response = await server.prepare("1.0000001");
  assert.equal(response.status, 422);
  assert.equal(response.body.error, "AMOUNT_EXCEEDS_TOKEN_DECIMALS");
  assert.equal(server.blockhashReads(), 0);
  assert.equal(server.session.pendingTinCredit, undefined);
});
