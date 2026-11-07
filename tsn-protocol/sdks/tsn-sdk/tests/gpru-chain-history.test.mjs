import { deriveCreditAmountCommitmentV2 } from "../dist/gpru/credit-amount.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey, Keypair } from "@solana/web3.js";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { encrypt } from "@dbrix/core";
import nacl from "tweetnacl";
import { deriveGpruElgamalPublicKey } from "../dist/gpru.js";
import { deriveGpruBalanceScanKeyV1, encryptBalanceBlindingDeltaV1 } from "../dist/gpru/babyjub-delta-cipher.js";
import { deriveGpruTransactionRecordKeyV1 } from "../dist/gpru/transaction-record.js";
import { buildTsnRegisterTcapCreditAuthorizationV3Instruction, GPRU_TCAP_PROGRAM_ID as TCAP, GPRU_PROGRAM_ID as GPRU } from "../dist/tcap-gpru-credit.js";
import { loadTinGpruTokenBalancesV1, loadGpruFinalizedCreditHistoryV1, decodeFinalizedGpruCreditV1 } from "../dist/gpru/chain-history.js";
import { decodeGpruHistoryTransactionV1 } from "../dist/gpru/native-credit-wire.js";

const hex = bytes => Buffer.from(bytes).toString("hex");
const hash = bytes => hex(sha256(bytes));
const field = h => (BigInt(`0x${h}`) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n).toString(16).padStart(64, "0");
const h = n => BigInt(n).toString(16).padStart(64, "0");
const disc = value => Buffer.from(hash(Buffer.from(value)).slice(0, 16), "hex");
const pda = (program, ...seeds) => PublicKey.findProgramAddressSync(seeds.map(s => typeof s === "string" ? Buffer.from(s) : s), program)[0];
const TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const TIP = new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const root = pda(TCAP, "tcap:commitment-root:v1"), registry = pda(TCAP, "tcap:asset-registry:v1");
const fundingRootAccount = pda(TCAP, "tcap:funding-root:v1");
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const mint = Keypair.fromSeed(new Uint8Array(32).fill(6)).publicKey;
const assetEntry = pda(TCAP, "tcap:asset-entry:v1", registry.toBytes(), tokenProgram.toBytes(), mint.toBytes());
const reserve = pda(TCAP, "tcap:reserve-state:v1", assetEntry.toBytes());
const payer = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
const authority = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(8));
const empty = "14935d601de8d6fbd04b084de8f8510dd25b5ed1d80ab5382b8f908dc0734b3a";
const ownerSeed = new Uint8Array(32).fill(17), otherSeed = new Uint8Array(32).fill(18);
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

function makeCredit({ sequence, ownerSequence, masterSeed, previousMemo = h(0), oldRoot, newRoot, amount = 100000n, funded = true, privateAmount = funded }) {
  const nullifier = h(sequence + 100), actionCommitment = h(sequence + 200);
  const fundingRoot = h(sequence + 700);
  const amountCommitment = deriveCreditAmountCommitmentV2(1,amount,h(sequence+900),nullifier);
  const accountingEpoch = pda(TCAP,"tcap:credit-epoch:v1",assetEntry.toBuffer(),u64(0));
  const pool = pda(TCAP,"tcap:sealed-funding:v1",assetEntry.toBuffer(),Buffer.from(fundingRoot,"hex"));
  const auth = hash(Buffer.concat([Buffer.from(privateAmount ? "TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0" : funded ? "TSN_GPRU_TCAP_CREDIT_FUNDED_NOTE_V1\0" : "TSN_GPRU_TCAP_CREDIT_HIDDEN_HEAD_V1\0"), root.toBuffer(), Buffer.from(oldRoot, "hex"),
    u64(sequence), u64(1), u64(1000), privateAmount ? Buffer.from(amountCommitment,"hex") : u64(amount), u32(1), Buffer.from(nullifier, "hex"), ...(funded ? [Buffer.from(fundingRoot, "hex")] : []), ...(privateAmount ? [accountingEpoch.toBuffer(),pool.toBuffer()] : [])]));
  const publicKey = deriveGpruElgamalPublicKey(masterSeed);
  const scan = deriveGpruBalanceScanKeyV1(masterSeed);
  const delta = encryptBalanceBlindingDeltaV1({ delta: 12n, scanPublicKey: scan.publicKey, ephemeralScalar: 3n });
  const dna = new Uint8Array(32).fill(sequence), ephemeral = ristretto255.Point.BASE.multiply(9n).toBytes();
  const key = deriveGpruTransactionRecordKeyV1({ masterSeed, gpruElgamalPublicKey: publicKey, dna, recordEphemeralPublicKey: ephemeral });
  const body = encrypt({ version: privateAmount ? 2 : 1, recordType: privateAmount ? "tsn-gpru-balance-action-v2" : "tsn-gpru-balance-action-v1",
    ...(privateAmount ? {amountCommitment, amountBlinding:h(sequence+900)} : {}), sequence: String(ownerSequence),
    previousMemoCommitment: previousMemo, actionCommitment, authorizationCommitment: field(auth), nullifier,
    actionKind: 1, tokenId: 1, amountBaseUnits: amount.toString() }, key);
  key.fill(0);
  const envelope = { version: 1, algorithm: "dbrix-core-secretbox-v1", dna: hex(dna), recordEphemeralPublicKey: hex(ephemeral), ...body };
  const prefix = [h(sequence + 300), h(1), h(2), actionCommitment, h(delta.encryptedDelta), h(delta.ephemeralPublicKey.x), h(delta.ephemeralPublicKey.y)];
  const memo = `TSN_GPRU_HEAD_V1:${prefix.join(":")}:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
  const inputs = [oldRoot, newRoot, field(hash(Buffer.from(memo))), actionCommitment, nullifier, h(1),
    prefix[0], prefix[1], prefix[2], prefix[4], prefix[5], prefix[6]];
  if (funded) inputs.push(fundingRoot);
  const fields = { authority: new PublicKey(authority.publicKey), fundingRootAccount:privateAmount ? pool : fundingRootAccount, accountingEpoch, amountCommitment,
    motherEscrow: pda(TSNP, "tsn_mother_escrow"), commitmentRoot: root, assetEntry, reserveState: reserve,
    config: pda(TCAP, "tcap:global-config:v1"), tipRouteRoot: pda(TIP, "tip:route-merkle-root:v1"),
    gpruVerifier: pda(GPRU, "gpru:hidden-head-verifier:v1"), authorizationDigest: auth, validAfterSlot: 1n, expiresAtSlot: 1000n,
    previousTcapRoot: oldRoot, tcapRootSequence: BigInt(sequence), tokenId: 1, amountBaseUnits: amount, nullifier,
    proof: { publicInputs: inputs, proofA: "01".repeat(64), proofB: "01".repeat(128), proofC: "01".repeat(64),
      actionKind: 1, tokenId: 1, amount, amountCommitment, authorizationCommitment: field(auth) } };
  let ix;
  if (privateAmount) {
    ix = buildTsnRegisterTcapCreditAuthorizationV3Instruction(fields);
  } else {
    // Historical bytes are fixtures, never a runtime compatibility builder.
    const keys = [fields.authority, fields.motherEscrow, TCAP, TSNP, fields.config, assetEntry, root, reserve,
      pda(TSNP, "tsn:tcap-authorization:v1", Buffer.from(auth, "hex")), fields.tipRouteRoot, fields.gpruVerifier,
      new PublicKey("Sysvar1nstructions1111111111111111111111111"), GPRU, ...(funded ? [fundingRootAccount] : [])];
    ix = { keys: keys.map(pubkey => ({ pubkey })), data: Buffer.concat([
      disc("global:tsn_register_tcap_credit_authorization_v2"), Buffer.from(auth, "hex"), u64(1), u64(1000),
      Buffer.from(oldRoot, "hex"), u64(sequence), u32(1), u64(amount), Buffer.from(nullifier, "hex"),
      ...inputs.map(value => Buffer.from(value, "hex")), Buffer.alloc(64, 1), Buffer.alloc(128, 1), Buffer.alloc(64, 1),
      Buffer.from([1]), u32(1), u64(amount), Buffer.from(field(auth), "hex"),
    ]) };
  }
  const keys = [new PublicKey(payer.publicKey), new PublicKey(authority.publicKey), root, privateAmount ? accountingEpoch : reserve];
  for (const k of [...ix.keys.map(k => k.pubkey), TSNP, MEMO]) if (!keys.some(key => key.equals(k))) keys.push(k);
  const index = key => keys.findIndex(k => k.equals(key));
  const header = Buffer.alloc(42); header.set([0x81, 2, 0, keys.length - 4]); header.writeUInt32LE(12, 4); header[40] = 2; header[41] = keys.length;
  const limits = Buffer.concat([u32(1400000), u32(67108864)]);
  const ixHeader = (program, count, size) => Buffer.from([index(program), count, size & 255, size >> 8]);
  const message = Buffer.concat([header, ...keys.map(k => k.toBuffer()), limits, ixHeader(TSNP, ix.keys.length, ix.data.length), ixHeader(MEMO, 1, Buffer.byteLength(memo)),
    Buffer.from(ix.keys.map(k => index(k.pubkey))), ix.data, Buffer.from([0]), Buffer.from(memo)]);
  const signatureBytes = nacl.sign.detached(message, payer.secretKey);
  const wire = Buffer.concat([message, signatureBytes, nacl.sign.detached(message, authority.secretKey)]);
  const signature = decodeGpruHistoryTransactionV1(wire).signatures[0];
  return { wire, signature, memo, sequence, oldRoot, newRoot, slot: 100 + sequence };
}
function setup(firstAmount = 100000n) {
  const a = makeCredit({ sequence: 1, ownerSequence: 1, masterSeed: ownerSeed, oldRoot: empty, newRoot: h(11), amount: firstAmount, funded: false });
  const b = makeCredit({ sequence: 2, ownerSequence: 1, masterSeed: otherSeed, oldRoot: h(11), newRoot: h(12), funded: false });
  const c = makeCredit({ sequence: 3, ownerSequence: 2, masterSeed: ownerSeed, previousMemo: field(hash(Buffer.from(a.memo))),
    oldRoot: h(12), newRoot: h(13), amount: 1000000n });
  const credits = [a, b, c];
  const rootData = Buffer.alloc(124); disc("account:TcapCommitmentRootStateV1").copy(rootData);
  rootData.writeUInt16LE(1, 8); Buffer.from(h(13), "hex").copy(rootData, 12); Buffer.from(h(12), "hex").copy(rootData, 44);
  rootData.writeBigUInt64LE(3n, 80); rootData[88] = 1;
  const assetData = Buffer.alloc(287); disc("account:TcapAssetEntryV1").copy(assetData); assetData.writeUInt16LE(1, 8);
  registry.toBuffer().copy(assetData, 12); assetData.writeUInt32LE(1, 44); tokenProgram.toBuffer().copy(assetData, 48);
  mint.toBuffer().copy(assetData, 80); reserve.toBuffer().copy(assetData, 148); assetData[244] = 6;
  const receipts = new Map(credits.map(c => [c.signature, { slot: c.slot, meta: { err: null }, transaction: [c.wire.toString("base64"), "base64"] }]));
  const connection = {
    getAccountInfoAndContext: async address => ({ context: { slot: 200 }, value: { owner: TCAP, data: address.equals(root) ? rootData : assetData } }),
    getSignaturesForAddress: async (_address, options) => options.before ? [] : credits.toReversed().map(c => ({ signature: c.signature, slot: c.slot, err: null })),
    _rpcRequest: async (_method, args) => ({ result: receipts.get(args[0]) }),
  };
  const scan = deriveGpruBalanceScanKeyV1(ownerSeed);
  const params = { connection, masterSeed: ownerSeed, gpruElgamalPublicKey: deriveGpruElgamalPublicKey(ownerSeed),
    gpruBalanceScanPublicKeyX: Buffer.from(h(scan.publicKey.x), "hex"), gpruBalanceScanPublicKeyY: Buffer.from(h(scan.publicKey.y), "hex") };
  return { credits, connection, params, receipts, rootData, assetData };
}

test("owner recovers 1.1 USDC with an intervening other-recipient credit and paused deposits", async () => {
  const { params } = setup();
  const result = await loadTinGpruTokenBalancesV1(params);
  assert.equal(result.tokenBalances[0].balanceBaseUnits, "1100000");
  assert.equal(result.tokenBalances[0].mint, mint.toBase58());
  assert.equal(result.latestGlobalSequence, "3"); assert.equal(result.latestOwnerSequence, "2"); assert.equal(result.actionCount, 2);
});
test("owner history identifies historical proof capability and current funded proofs separately", () => {
  const { credits } = setup();
  const decoded = credits.map(credit => decodeFinalizedGpruCreditV1(decodeGpruHistoryTransactionV1(credit.wire), credit.signature, credit.slot));
  assert.deepEqual(decoded.map(credit => credit.fundingProofVersion), [1, 1, 3]);
  assert.equal(decoded[0].fundingRoot, undefined);
  assert.equal(decoded[2].fundingRoot, h(703));
  const altered = decodeGpruHistoryTransactionV1(credits[2].wire);
  altered.instructions[0].data[164 + 12 * 32] ^= 1;
  assert.throws(() => decodeFinalizedGpruCreditV1(altered, credits[2].signature, credits[2].slot), /authorization digest/);
  const badAccount = decodeGpruHistoryTransactionV1(credits[2].wire);
  badAccount.instructions[0].accounts[13] = mint.toBase58();
  assert.throws(() => decodeFinalizedGpruCreditV1(badAccount, credits[2].signature, credits[2].slot), /authorization digest|noncanonical credit account/);
});
test("historical funded amount-public thirteen-input receipts remain recoverable",()=>{
  const credit=makeCredit({sequence:4,ownerSequence:1,masterSeed:ownerSeed,oldRoot:h(13),newRoot:h(14),funded:true,privateAmount:false});
  const parsed=decodeFinalizedGpruCreditV1(decodeGpruHistoryTransactionV1(credit.wire),credit.signature,credit.slot);
  assert.equal(parsed.fundingProofVersion,2);assert.equal(parsed.action.amountBaseUnits,"100000");
  assert.equal(parsed.fundingRoot,h(704));
});
test("missing finalized history and missing receipts fail closed", async () => {
  const { connection, credits, receipts } = setup();
  receipts.delete(credits[1].signature);
  await assert.rejects(loadGpruFinalizedCreditHistoryV1({ connection }), /receipt is unavailable/);
  connection.getSignaturesForAddress = async () => [];
  await assert.rejects(loadGpruFinalizedCreditHistoryV1({ connection }), /history is incomplete/);
});
test("wire truncation, forged signatures, altered proof bindings and noncanonical accounts fail closed", () => {
  const { credits } = setup();
  const first = credits[0];
  assert.throws(() => decodeGpruHistoryTransactionV1(first.wire.subarray(0, first.wire.length - 1)), /INVALID_WIRE/);
  const forged = Buffer.from(first.wire); forged[forged.length - 1] ^= 1;
  assert.throws(() => decodeGpruHistoryTransactionV1(forged), /signature/);
  const parsed = decodeGpruHistoryTransactionV1(first.wire);
  parsed.instructions[0].data[140 + 3 * 32] ^= 1;
  assert.throws(() => decodeFinalizedGpruCreditV1(parsed, first.signature, first.slot), /Memo differs/);
  const accounts = decodeGpruHistoryTransactionV1(first.wire); accounts.instructions[0].accounts[8] = mint.toBase58();
  assert.throws(() => decodeFinalizedGpruCreditV1(accounts, first.signature, first.slot), /noncanonical credit account/);
});
test("failed receipts, mismatched registry mint and owner key mismatch never produce zero", async () => {
  const { params, receipts, credits, assetData } = setup();
  receipts.get(credits[0].signature).meta.err = { InstructionError: [0, 1] };
  await assert.rejects(loadTinGpruTokenBalancesV1(params), /invalid finalized transaction receipt/);
  receipts.get(credits[0].signature).meta.err = null;
  mint.toBuffer().copy(assetData, 48);
  await assert.rejects(loadTinGpruTokenBalancesV1(params), /governed mint or reserve/);
  await assert.rejects(loadTinGpruTokenBalancesV1({ ...params, masterSeed: otherSeed }), /owner seed differs/);
});
test("global root mutation during recovery is rejected", async () => {
  const { params, connection, rootData } = setup();
  let reads = 0;
  const original = connection.getAccountInfoAndContext;
  connection.getAccountInfoAndContext = async address => {
    if (address.equals(root) && ++reads === 2) rootData.writeBigUInt64LE(4n, 80);
    return original(address);
  };
  await assert.rejects(loadTinGpruTokenBalancesV1(params), /root changed during recovery/);
});
test("owner history preserves bigint totals and rejects a missing private predecessor", async () => {
  const { params, connection, credits, receipts } = setup(9007199254740993n);
  assert.equal((await loadTinGpruTokenBalancesV1(params)).tokenBalances[0].balanceBaseUnits, "9007199255740993");
  const replacement = makeCredit({ sequence: 3, ownerSequence: 3, masterSeed: ownerSeed,
    previousMemo: field(hash(Buffer.from(credits[0].memo))), oldRoot: h(12), newRoot: h(13), amount: 1000000n });
  receipts.set(replacement.signature, { slot: replacement.slot, meta: { err: null }, transaction: [replacement.wire.toString("base64"), "base64"] });
  connection.getSignaturesForAddress = async (_address, options) => options.before ? [] : [replacement, credits[1], credits[0]].map(c => ({ signature: c.signature, slot: c.slot, err: null }));
  await assert.rejects(loadTinGpruTokenBalancesV1(params), /sequence gap/);
});
