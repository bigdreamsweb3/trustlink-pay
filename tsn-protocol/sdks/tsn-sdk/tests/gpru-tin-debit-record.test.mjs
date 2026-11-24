import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "@noble/hashes/sha256";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { deriveGpruElgamalPublicKey } from "../dist/gpru.js";
import { deriveGpruBalanceScanKeyV1, encryptBalanceBlindingDeltaV1 } from "../dist/gpru/babyjub-delta-cipher.js";
import { deriveGpruTransactionRecordKeyV1, parseGpruMemoBindingV1 } from "../dist/gpru/transaction-record.js";
import { deriveGpruTinDebitCommitmentsV1, buildTinDebitOpeningMessageV1, signTinDebitOpeningV1,
  validateTinDebitOpeningPacketV1, GPRU_TIN_DEBIT_FIELD_V1 as FIELD, GPRU_TIN_DEBIT_SUBORDER_V1 as ORDER } from "../dist/gpru/tin-debit-opening.js";
import { recoverGpruTinDebitOwnerOpeningV1, deriveGpruTinDebitBalancePointV1 } from "../dist/gpru/tin-debit-record.js";

const hex = value => BigInt(value).toString(16).padStart(64, "0");
const bytesHex = bytes => Buffer.from(bytes).toString("hex");
const memoHash = memo => hex(BigInt(`0x${bytesHex(sha256(new TextEncoder().encode(memo)))}`) % FIELD);
const seeds = [new Uint8Array(32).fill(31), new Uint8Array(32).fill(32)];
const owners = seeds.map(masterSeed => {
  const scan = deriveGpruBalanceScanKeyV1(masterSeed);
  return { masterSeed, gpruElgamalPublicKey: deriveGpruElgamalPublicKey(masterSeed),
    gpruBalanceScanPublicKeyX: Buffer.from(hex(scan.publicKey.x), "hex"),
    gpruBalanceScanPublicKeyY: Buffer.from(hex(scan.publicKey.y), "hex"), scan };
});
const commitmentParams = { senderRouteKeyCommitment: hex(111), recipientRouteKeyCommitment: hex(222), tokenId: 1,
  amountBaseUnits: "30", nonce: "789", amountBlinding: "456", deploymentCommitment: hex(999), validAfterSlot: "10", expiresAtSlot: "200" };
const commitments = deriveGpruTinDebitCommitmentsV1(commitmentParams);
const priors = [{ tokenId: 1, balance: "100", blinding: "17", sequence: "2", previousMemoCommitment: hex(101) },
  { tokenId: 1, balance: "25", blinding: "23", sequence: "3", previousMemoCommitment: hex(102) }];

function makeMemo(leg, { recordOverride = {}, deltaOverride, ciphertextMutation = false, malformedJson = false, prior = priors[leg] } = {}) {
  const owner = owners[leg], deltaValue = [37n, 41n][leg];
  const nextBalance = BigInt(prior.balance) + (leg === 0 ? -30n : 30n);
  const nextBlinding = (BigInt(prior.blinding) + deltaValue) % ORDER;
  const point = deriveGpruTinDebitBalancePointV1(nextBalance.toString(), nextBlinding.toString());
  const delta = encryptBalanceBlindingDeltaV1({ delta: deltaOverride ?? deltaValue, scanPublicKey: owner.scan.publicKey, ephemeralScalar: 3n + BigInt(leg) });
  const dna = new Uint8Array(32).fill(41 + leg), ephemeral = ristretto255.Point.BASE.multiply(9n + BigInt(leg)).toBytes();
  const key = deriveGpruTransactionRecordKeyV1({ ...owner, dna, recordEphemeralPublicKey: ephemeral });
  const record = { version: 1, recordType: "tsn-gpru-tin-debit-action-v1", actionKind: 4, leg,
    sequence: String(BigInt(prior.sequence) + 1n), previousMemoCommitment: prior.previousMemoCommitment,
    tokenId: 1, amountBaseUnits: "30", amountBlinding: "456", ...commitments, ...recordOverride };
  const plaintext = Buffer.alloc(86);
  plaintext[0] = malformedJson ? 2 : 1; plaintext[1] = record.leg;
  plaintext.writeBigUInt64LE(BigInt(record.sequence), 2);
  Buffer.from(record.previousMemoCommitment, "hex").copy(plaintext, 10);
  plaintext.writeUInt32LE(record.tokenId, 42); plaintext.writeBigUInt64LE(BigInt(record.amountBaseUnits), 46);
  Buffer.from(hex(record.amountBlinding), "hex").copy(plaintext, 54);
  const nonce = new Uint8Array(24).fill(71);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);
  plaintext.fill(0);
  key.fill(0);
  if (ciphertextMutation) ciphertext[0] ^= 1;
  const portfolio = hex(801 + leg);
  const fields = [portfolio, hex(point.x), hex(point.y), commitments.actionCommitment, hex(delta.encryptedDelta), hex(delta.ephemeralPublicKey.x), hex(delta.ephemeralPublicKey.y)];
  const binary = Buffer.concat([Buffer.from([1, leg]), ...fields.map(field => Buffer.from(field, "hex")), Buffer.from(dna), Buffer.from(ephemeral), Buffer.from(nonce), Buffer.from(ciphertext)]);
  assert.equal(binary.length, 416);
  return { memo: `TSN_GPRU_TIN_DEBIT_MEMO_V1:${binary.toString("base64url")}`, fields };
}
function fixture(options = {}) {
  const memos = [makeMemo(0, options), makeMemo(1, { prior: options.recipientPrior ?? priors[1] })];
  const publicInputs = [hex(701), hex(702), hex(703), hex(12), commitmentParams.deploymentCommitment, hex(1), hex(10), hex(200),
    commitments.amountCommitment, commitments.authorizationCommitment, commitments.actionCommitment, commitments.nullifier,
    ...memos.map(value => memoHash(value.memo)), ...memos.map(value => value.fields[0]), ...memos.map(value => value.fields[1]), ...memos.map(value => value.fields[2]),
    ...memos.map(value => value.fields[4]), ...memos.map(value => value.fields[5]), ...memos.map(value => value.fields[6])];
  const params = leg => ({ ...owners[leg], memoPayload: memos[leg].memo, publicInputs, expectedLeg: leg,
    priorOpening: { ...(leg === 0 ? options.prior ?? priors[0] : options.recipientPrior ?? priors[1]) } });
  return { memos, publicInputs, params };
}

test("sender and offline recipient independently recover successors and cannot open the other record", () => {
  const { params } = fixture();
  const sender = recoverGpruTinDebitOwnerOpeningV1(params(0));
  const recipient = recoverGpruTinDebitOwnerOpeningV1(params(1));
  assert.equal(sender.balance, "70"); assert.equal(sender.blinding, "54"); assert.equal(sender.sequence, "3");
  assert.equal(recipient.balance, "55"); assert.equal(recipient.blinding, "64"); assert.equal(recipient.sequence, "4");
  assert.equal(BigInt(sender.balance) + BigInt(recipient.balance), 125n);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...params(1), ...owners[0] }), /does not authenticate/);
  assert.throws(() => parseGpruMemoBindingV1(params(0).memoPayload), /portfolio-head/);
});

test("recovery rejects altered proof-bound asset, commitments, Memo, portfolio and balance point", () => {
  const { params } = fixture();
  for (const index of [5, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24]) {
    const input = params(0), publicInputs = [...input.publicInputs];
    publicInputs[index] = hex(BigInt(`0x${publicInputs[index]}`) + 1n);
    assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, publicInputs }));
  }
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...params(0), expectedLeg: 1 }), /STATEMENT_MISMATCH/);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...params(0), publicInputs: params(0).publicInputs.slice(0, 25) }), /26_INPUTS/);
});

test("recovery rejects replay, substituted prior opening, asset and private history", () => {
  const { params } = fixture(), input = params(0);
  const next = recoverGpruTinDebitOwnerOpeningV1(input);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, priorOpening: next }), /predecessor/);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, priorOpening: { ...input.priorOpening, balance: "101" } }), /successor point/);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, priorOpening: { ...input.priorOpening, blinding: "18" } }), /successor point/);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, priorOpening: { ...input.priorOpening, tokenId: 2 } }), /predecessor/);
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...input, priorOpening: { ...input.priorOpening, previousMemoCommitment: hex(103) } }), /predecessor/);
});

test("authenticated records still require correct private amount, delta and Secretbox content", () => {
  for (const options of [{ recordOverride: { amountBaseUnits: "31" } }, { deltaOverride: 38n }, { ciphertextMutation: true },
    { recordOverride: { leg: 1 } }]) {
    const { params } = fixture(options);
    assert.throws(() => recoverGpruTinDebitOwnerOpeningV1(params(0)));
  }
});

test("balance point supports empty identity and modulo-subgroup blinding carries", () => {
  assert.deepEqual(deriveGpruTinDebitBalancePointV1("0", "0"), { x: 0n, y: 1n });
  const prior = { ...priors[0], blinding: (ORDER - 2n).toString() };
  const { params } = fixture({ prior });
  const recovered = recoverGpruTinDebitOwnerOpeningV1({ ...params(0), priorOpening: prior });
  assert.equal(recovered.blinding, "35");
  assert.throws(() => deriveGpruTinDebitBalancePointV1("0", ORDER.toString()), /unsigned range/);
});

test("transfer recovery supports accumulated balances above u64 while transfer amounts remain u64", () => {
  const wide = 1n << 64n;
  const prior = { ...priors[0], balance: (wide + 10n).toString() };
  const recipientPrior = { ...priors[1], balance: (wide + 20n).toString() };
  const { params } = fixture({ prior, recipientPrior });
  const sender = recoverGpruTinDebitOwnerOpeningV1(params(0));
  const recipient = recoverGpruTinDebitOwnerOpeningV1(params(1));
  assert.equal(sender.balance, (wide - 20n).toString());
  assert.equal(recipient.balance, (wide + 50n).toString());
  assert.equal(BigInt(sender.balance) + BigInt(recipient.balance), BigInt(prior.balance) + BigInt(recipientPrior.balance));
  assert.throws(() => deriveGpruTinDebitBalancePointV1((1n << 128n).toString(), "0"), /unsigned range/);
  assert.throws(() => deriveGpruTinDebitCommitmentsV1({ ...commitmentParams, amountBaseUnits: wide.toString() }), /unsigned range/);
});

test("malformed authenticated binary record exposes no plaintext preview", () => {
  const { params } = fixture({ malformedJson: true });
  assert.throws(() => recoverGpruTinDebitOwnerOpeningV1(params(0)), error => {
    assert.equal(error.message, "Transfer owner record binary framing is invalid");
    assert.equal(error.cause, undefined); assert.equal(error.metadata, undefined);
    assert.ok(!JSON.stringify(error).includes("987654321"));
    return true;
  });
});

test("opening consent signs canonical statement context and rejects noncanonical packets or wallet changes", async () => {
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(51));
  const wallet = { publicKey: new PublicKey(keypair.publicKey), signMessage: async message => nacl.sign.detached(message, keypair.secretKey) };
  const packet = { version: 1, recordType: "tsn-gpru-tin-debit-opening-v1", leg: 0, authorizationCommitment: commitments.authorizationCommitment,
    routeKeyCommitment: hex(111), ...priors[0] };
  const message = buildTinDebitOpeningMessageV1(packet);
  const signed = await signTinDebitOpeningV1(packet, wallet);
  assert.ok(nacl.sign.detached.verify(message, Buffer.from(signed.signature, "hex"), keypair.publicKey));
  assert.equal(new TextDecoder().decode(message), "TSN_TIN_DEBIT_OPENING_V1\0" + [0, commitments.authorizationCommitment, hex(111), 1, "2", hex(101), "100", "17"].join("\n"));
  for (const field of ["oldGlobalRoot", "tipRouteRoot", "rootSequence"]) assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, [field]: hex(1) }), /field set/);
  assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, balance: "0100" }), /canonical decimal/);
  for (const suffix of ["\n", "\r\n"]) {
    assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, balance: "100" + suffix }), /canonical decimal/);
    assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, routeKeyCommitment: packet.routeKeyCommitment + suffix }), /canonical lowercase/);
    const { params } = fixture();
    assert.throws(() => recoverGpruTinDebitOwnerOpeningV1({ ...params(0), memoPayload: params(0).memoPayload + suffix }), /LENGTH_OR_PREFIX/);
  }
  assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, blinding: ORDER.toString() }), /unsigned range/);
  assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, unexpected: true }), /field set/);
  assert.throws(() => deriveGpruTinDebitCommitmentsV1({ ...commitmentParams, recipientRouteKeyCommitment: commitmentParams.senderRouteKeyCommitment }), /distinct/);
  wallet.signMessage = async bytes => { wallet.publicKey = PublicKey.default; return nacl.sign.detached(bytes, keypair.secretKey); };
  await assert.rejects(signTinDebitOpeningV1(packet, wallet), /connected owner/);
  let capturedMessage;
  wallet.publicKey = new PublicKey(keypair.publicKey);
  wallet.signMessage = async bytes => { capturedMessage = bytes; throw new Error("Owner declined"); };
  await assert.rejects(signTinDebitOpeningV1(packet, wallet), /Owner declined/);
  assert.ok(capturedMessage.every(byte => byte === 0));
});

test("only the sender supplies opening consent; a recipient packet never reaches a wallet", async () => {
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(51));
  let signatures = 0;
  const wallet = { publicKey: new PublicKey(keypair.publicKey), signMessage: async message => {
    signatures++; return nacl.sign.detached(message, keypair.secretKey);
  } };
  const packet = { version: 1, recordType: "tsn-gpru-tin-debit-opening-v1", leg: 0,
    authorizationCommitment: commitments.authorizationCommitment,
    routeKeyCommitment: hex(111), ...priors[0], balance: ((1n << 64n) + 1n).toString() };
  assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, leg: 1 }), /only from the sender/);
  await assert.rejects(signTinDebitOpeningV1({ ...packet, leg: 1 }, wallet), /only from the sender/);
  assert.equal(signatures, 0);
  const signed = await signTinDebitOpeningV1(packet, wallet);
  assert.equal(signed.leg, 0); assert.equal(signed.balance, packet.balance); assert.equal(signatures, 1);
  assert.throws(() => validateTinDebitOpeningPacketV1({ ...packet, balance: (1n << 128n).toString() }), /unsigned range/);
});
