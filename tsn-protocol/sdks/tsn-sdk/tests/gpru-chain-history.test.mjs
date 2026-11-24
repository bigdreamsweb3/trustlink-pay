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
import { loadTinGpruTokenBalancesV1, loadTinGpruDebitOpeningV1, loadGpruFinalizedCreditHistoryV1, decodeFinalizedGpruCreditV1 } from "../dist/gpru/chain-history.js";
import { deriveGpruTinDebitBalancePointV1 } from "../dist/gpru/tin-debit-record.js";
import { decodeGpruHistoryTransactionV1 } from "../dist/gpru/native-credit-wire.js";
import { deriveGpruTinDebitAccountsV1, deriveGpruTinDebitDeploymentCommitmentV1, deriveGpruTinDebitAuthorizationDigestV1,
  buildTsnRegisterTcapTinDebitAuthorizationV1Instruction, createGpruTinDebitMemoInstructionV1 } from "../dist/tcap-gpru-tin-debit.js";
import { deriveGpruTinDebitCommitmentsV1 } from "../dist/gpru/tin-debit-opening.js";

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

function makeCredit({ sequence, ownerSequence, masterSeed, previousMemo = h(0), oldRoot, newRoot, amount = 100000n, funded = true, privateAmount = funded, priorBalance = 0n, priorBlinding = 0n, malformedJson = false }) {
  const nullifier = h(sequence + 100), actionCommitment = h(sequence + 200);
  const fundingRoot = h(sequence + 700);
  const amountCommitment = deriveCreditAmountCommitmentV2(1,amount,h(sequence+900),nullifier);
  const accountingEpoch = pda(TCAP,"tcap:credit-epoch:v1",assetEntry.toBuffer(),u64(0));
  const globalFundingAccount = pda(TCAP,"tcap:funding-root:v1");
  const auth = hash(Buffer.concat([Buffer.from(privateAmount ? "TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0" : funded ? "TSN_GPRU_TCAP_CREDIT_FUNDED_NOTE_V1\0" : "TSN_GPRU_TCAP_CREDIT_HIDDEN_HEAD_V1\0"), root.toBuffer(), Buffer.from(oldRoot, "hex"),
    u64(sequence), u64(1), u64(1000), privateAmount ? Buffer.from(amountCommitment,"hex") : u64(amount), u32(1), Buffer.from(nullifier, "hex"), ...(funded ? [Buffer.from(fundingRoot, "hex")] : []), ...(privateAmount ? [accountingEpoch.toBuffer(),globalFundingAccount.toBuffer()] : [])]));
  const publicKey = deriveGpruElgamalPublicKey(masterSeed);
  const scan = deriveGpruBalanceScanKeyV1(masterSeed);
  const delta = encryptBalanceBlindingDeltaV1({ delta: 12n, scanPublicKey: scan.publicKey, ephemeralScalar: 3n });
  const dna = new Uint8Array(32).fill(sequence), ephemeral = ristretto255.Point.BASE.multiply(9n).toBytes();
  const key = deriveGpruTransactionRecordKeyV1({ masterSeed, gpruElgamalPublicKey: publicKey, dna, recordEphemeralPublicKey: ephemeral });
  let body = encrypt({ version: privateAmount ? 2 : 1, recordType: privateAmount ? "tsn-gpru-balance-action-v2" : "tsn-gpru-balance-action-v1",
    ...(privateAmount ? {amountCommitment, amountBlinding:h(sequence+900)} : {}), sequence: String(ownerSequence),
    previousMemoCommitment: previousMemo, actionCommitment, authorizationCommitment: field(auth), nullifier,
    actionKind: 1, tokenId: 1, amountBaseUnits: amount.toString() }, key);
  if (malformedJson) {
    const nonce = new Uint8Array(24).fill(71), plaintext = Buffer.from('\x02{"privateBalance":987654321,malformed');
    body = { nonce: Buffer.from(nonce).toString("base64"), data: Buffer.from(nacl.secretbox(plaintext, nonce, key)).toString("base64") };
    plaintext.fill(0);
  }
  key.fill(0);
  const envelope = { version: 1, algorithm: "dbrix-core-secretbox-v1", dna: hex(dna), recordEphemeralPublicKey: hex(ephemeral), ...body };
  const point = deriveGpruTinDebitBalancePointV1((priorBalance + amount).toString(), (priorBlinding + 12n).toString());
  const prefix = [h(sequence + 300), h(point.x), h(point.y), actionCommitment, h(delta.encryptedDelta), h(delta.ephemeralPublicKey.x), h(delta.ephemeralPublicKey.y)];
  const memo = `TSN_GPRU_HEAD_V1:${prefix.join(":")}:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
  const inputs = [oldRoot, newRoot, field(hash(Buffer.from(memo))), actionCommitment, nullifier, h(1),
    prefix[0], prefix[1], prefix[2], prefix[4], prefix[5], prefix[6]];
  if (funded) inputs.push(fundingRoot);
  const fields = { authority: new PublicKey(authority.publicKey), fundingRootAccount:privateAmount ? globalFundingAccount : fundingRootAccount, accountingEpoch, amountCommitment,
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
function setup(firstAmount = 100000n, { malformedJson = false } = {}) {
  const a = makeCredit({ sequence: 1, ownerSequence: 1, masterSeed: ownerSeed, oldRoot: empty, newRoot: h(11), amount: firstAmount, funded: false, malformedJson });
  const b = makeCredit({ sequence: 2, ownerSequence: 1, masterSeed: otherSeed, oldRoot: h(11), newRoot: h(12), funded: false });
  const c = makeCredit({ sequence: 3, ownerSequence: 2, masterSeed: ownerSeed, previousMemo: field(hash(Buffer.from(a.memo))),
    oldRoot: h(12), newRoot: h(13), amount: 1000000n, priorBalance: firstAmount, priorBlinding: 12n });
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

function makeTransfer(senderPrior, recipientPrior) {
  let accounts = deriveGpruTinDebitAccountsV1({ authority: new PublicKey(authority.publicKey), assetEntry, authorizationDigest: h(0) });
  const deployment = deriveGpruTinDebitDeploymentCommitmentV1(accounts);
  const commitments = deriveGpruTinDebitCommitmentsV1({ senderRouteKeyCommitment: h(111), recipientRouteKeyCommitment: h(222), tokenId: 1,
    amountBaseUnits: "30000", amountBlinding: "567", nonce: "1234", deploymentCommitment: deployment, validAfterSlot: "1", expiresAtSlot: "1000" });
  const memos = [ownerSeed, otherSeed].map((masterSeed, leg) => {
    const prior = leg === 0 ? senderPrior : recipientPrior;
    const scan = deriveGpruBalanceScanKeyV1(masterSeed);
    const delta = encryptBalanceBlindingDeltaV1({ delta: 37n, scanPublicKey: scan.publicKey, ephemeralScalar: 11n + BigInt(leg) });
    const point = deriveGpruTinDebitBalancePointV1((100000n + (leg === 0 ? -30000n : 30000n)).toString(), "49");
    const dna = new Uint8Array(32).fill(51 + leg), ephemeral = ristretto255.Point.BASE.multiply(13n + BigInt(leg)).toBytes();
    const key = deriveGpruTransactionRecordKeyV1({ masterSeed, gpruElgamalPublicKey: deriveGpruElgamalPublicKey(masterSeed), dna, recordEphemeralPublicKey: ephemeral });
    const record = Buffer.alloc(86); record.set([1, leg]); record.writeBigUInt64LE(2n, 2);
    Buffer.from(field(hash(Buffer.from(prior.memo))), "hex").copy(record, 10); record.writeUInt32LE(1, 42); record.writeBigUInt64LE(30000n, 46);
    Buffer.from(h(567), "hex").copy(record, 54);
    const nonce = new Uint8Array(24).fill(61 + leg), cipher = nacl.secretbox(record, nonce, key);
    key.fill(0); record.fill(0);
    const fields = [h(1001 + leg), h(point.x), h(point.y), commitments.actionCommitment, h(delta.encryptedDelta), h(delta.ephemeralPublicKey.x), h(delta.ephemeralPublicKey.y)];
    const binary = Buffer.concat([Buffer.from([1, leg]), ...fields.map(v => Buffer.from(v, "hex")), dna, ephemeral, nonce, cipher]);
    return { memo: "TSN_GPRU_TIN_DEBIT_MEMO_V1:" + binary.toString("base64url"), fields };
  });
  const publicInputs = [h(12), h(13), h(703), h(2), deployment, h(1), h(1), h(1000), commitments.amountCommitment,
    commitments.authorizationCommitment, commitments.actionCommitment, commitments.nullifier, ...memos.map(v => field(hash(Buffer.from(v.memo)))),
    ...[0, 1, 2, 4, 5, 6].flatMap(index => memos.map(v => v.fields[index]))];
  const authorizationDigest = deriveGpruTinDebitAuthorizationDigestV1(accounts, publicInputs);
  accounts = deriveGpruTinDebitAccountsV1({ authority: accounts.authority, assetEntry, authorizationDigest });
  const proof = { publicInputs, proofA: "01".repeat(64), proofB: "01".repeat(128), proofC: "01".repeat(64) };
  const instructions = [buildTsnRegisterTcapTinDebitAuthorizationV1Instruction({ accounts, authorizationDigest, proof }),
    ...memos.map((v, leg) => createGpruTinDebitMemoInstructionV1({ authority: accounts.authority, payload: v.memo, publicInputs, expectedLeg: leg }))];
  const keys = [new PublicKey(payer.publicKey), new PublicKey(authority.publicKey), root];
  for (const key of instructions.flatMap(ix => [...ix.keys.map(k => k.pubkey), ix.programId])) if (!keys.some(k => k.equals(key))) keys.push(key);
  const index = key => keys.findIndex(k => k.equals(key));
  const header = Buffer.alloc(42); header.set([0x81, 2, 1, keys.length - 3]); header.writeUInt32LE(12, 4); header[40] = 3; header[41] = keys.length;
  const message = Buffer.concat([header, ...keys.map(k => k.toBytes()), u32(1400000), u32(67108864),
    ...instructions.map(ix => Buffer.from([index(ix.programId), ix.keys.length, ix.data.length & 255, ix.data.length >> 8])),
    ...instructions.flatMap(ix => [Buffer.from(ix.keys.map(k => index(k.pubkey))), ix.data])]);
  const wire = Buffer.concat([message, nacl.sign.detached(message, payer.secretKey), nacl.sign.detached(message, authority.secretKey)]);
  return { signature: decodeGpruHistoryTransactionV1(wire).signatures[0], wire, memoPayloads: memos.map(v => v.memo), sequence: 3, slot: 103 };
}

test("credit then offline-recipient transfer then credit reconstructs both owner heads", async () => {
  const state = setup();
  const transfer = makeTransfer(state.credits[0], state.credits[1]);
  // The current binary record encodes to a 582-byte Memo. Reject a truncated
  // Memo even when the synthetic transaction carries fresh valid signatures.
  const truncatedMessage = Buffer.from(transfer.wire.subarray(0, transfer.wire.length - 128 - 1));
  const instructionHeaders = 42 + truncatedMessage[41] * 32 + 8;
  const lastMemoSize = instructionHeaders + 2 * 4 + 2;
  truncatedMessage.writeUInt16LE(truncatedMessage.readUInt16LE(lastMemoSize) - 1, lastMemoSize);
  const truncatedWire = Buffer.concat([truncatedMessage, nacl.sign.detached(truncatedMessage, payer.secretKey),
    nacl.sign.detached(truncatedMessage, authority.secretKey)]);
  assert.throws(() => decodeGpruHistoryTransactionV1(truncatedWire), /unsupported V1 native credit instructions/);
  const finalCredit = makeCredit({ sequence: 4, ownerSequence: 3, masterSeed: ownerSeed, previousMemo: field(hash(Buffer.from(transfer.memoPayloads[0]))),
    oldRoot: h(13), newRoot: h(14), amount: 1000000n, priorBalance: 70000n, priorBlinding: 49n });
  state.credits.splice(2, 1, transfer, finalCredit);
  for (const value of [transfer, finalCredit]) state.receipts.set(value.signature, { slot: value.slot, meta: { err: null }, transaction: [value.wire.toString("base64"), "base64"] });
  Buffer.from(h(14), "hex").copy(state.rootData, 12); Buffer.from(h(13), "hex").copy(state.rootData, 44); state.rootData.writeBigUInt64LE(4n, 80);
  const sender = await loadTinGpruTokenBalancesV1(state.params);
  assert.equal(sender.tokenBalances[0].balanceBaseUnits, "1070000"); assert.equal(sender.latestOwnerSequence, "3"); assert.equal(sender.latestGlobalSequence, "4");
  const scan = deriveGpruBalanceScanKeyV1(otherSeed);
  const recipientParams = { ...state.params, masterSeed: otherSeed, gpruElgamalPublicKey: deriveGpruElgamalPublicKey(otherSeed),
    gpruBalanceScanPublicKeyX: Buffer.from(h(scan.publicKey.x), "hex"), gpruBalanceScanPublicKeyY: Buffer.from(h(scan.publicKey.y), "hex") };
  const recipient = await loadTinGpruDebitOpeningV1({ ...recipientParams, tokenId: 1, expectedGlobalRoot: h(14), expectedRootSequence: "4" });
  assert.equal(recipient.balance, "130000"); assert.equal(recipient.blinding, "49"); assert.equal(recipient.sequence, "2");
  assert.equal(recipient.previousMemoCommitment, field(hash(Buffer.from(transfer.memoPayloads[1]))));
  state.receipts.delete(transfer.signature);
  await assert.rejects(loadTinGpruTokenBalancesV1(state.params), /receipt is unavailable/);
});

test("owner recovers 1.1 USDC with an intervening other-recipient credit and paused deposits", async () => {
  const { params } = setup();
  const result = await loadTinGpruTokenBalancesV1(params);
  assert.equal(result.tokenBalances[0].balanceBaseUnits, "1100000");
  assert.equal(result.tokenBalances[0].mint, mint.toBase58());
  assert.equal(result.latestGlobalSequence, "3"); assert.equal(result.latestOwnerSequence, "2"); assert.equal(result.actionCount, 2);
});
test("private transfer opening includes authenticated balance/blinding/head and rejects stale root context", async () => {
  const { params, credits } = setup();
  const opening = await loadTinGpruDebitOpeningV1({ ...params, tokenId: 1, expectedGlobalRoot: h(13), expectedRootSequence: "3" });
  assert.deepEqual(opening, { tokenId: 1, balance: "1100000", blinding: "24", sequence: "2", previousMemoCommitment: field(hash(Buffer.from(credits[2].memo))) });
  await assert.rejects(loadTinGpruDebitOpeningV1({ ...params, tokenId: 1, expectedGlobalRoot: h(12), expectedRootSequence: "3" }), /selected current root/);
});
test("sender opening recovers an accumulated balance above u64 without changing credit-history arithmetic", async () => {
  const firstAmount = (1n << 64n) - 1n;
  const { params } = setup(firstAmount);
  const opening = await loadTinGpruDebitOpeningV1({ ...params, tokenId: 1, expectedGlobalRoot: h(13), expectedRootSequence: "3" });
  assert.equal(opening.balance, (firstAmount + 1000000n).toString());
  assert.equal(opening.blinding, "24");
  const display = await loadTinGpruTokenBalancesV1(params);
  assert.equal(display.tokenBalances[0].balanceBaseUnits, opening.balance);
});
test("opening recovery sanitizes malformed authenticated credit history without private previews", async () => {
  const { params } = setup(100000n, { malformedJson: true });
  await assert.rejects(loadTinGpruDebitOpeningV1({ ...params, tokenId: 1, expectedGlobalRoot: h(13), expectedRootSequence: "3" }), error => {
    assert.equal(error.message, "GPRU owner record could not be decoded");
    assert.equal(error.cause, undefined); assert.equal(error.metadata, undefined);
    assert.ok(!JSON.stringify(error).includes("987654321"));
    return true;
  });
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
