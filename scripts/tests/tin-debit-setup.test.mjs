import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PublicKey, Transaction, GPRU, TSNP, MOTHER, VERIFIER, VERIFIER_BUMP,
  debitInstructions, debitInitializationPlan, assertEnrollmentPlan, parseOptions, main,
} from "../tin-debit-setup.mjs";

const authority = new PublicKey("11111111111111111111111111111112");
const otherAuthority = new PublicKey("11111111111111111111111111111113");
const genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const metadataPin = "a".repeat(64);
const hash = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const discriminator = name => hash(Buffer.from(`global:${name}`)).subarray(0, 8);

function material() {
  const verifierBytes = Buffer.concat([
    Buffer.alloc(64, 1), Buffer.alloc(128, 2), Buffer.alloc(128, 3), Buffer.alloc(128, 4),
    ...Array.from({ length: 27 }, (_, index) => Buffer.alloc(64, index + 5)),
  ]);
  return {
    circuit: Buffer.alloc(32, 41),
    key: hash(Buffer.from("GPRU_TIN_DEBIT_VERIFYING_KEY_V1\0"), verifierBytes),
    verifierBytes,
  };
}

function enrollmentPlan(m = material()) {
  const common = [
    { pubkey: authority.toBase58(), isSigner: true, isWritable: false },
    { pubkey: MOTHER.toBase58(), isSigner: false, isWritable: false },
    { pubkey: VERIFIER.toBase58(), isSigner: false, isWritable: true },
  ];
  const instruction = (name, accounts, bytes = Buffer.alloc(0)) => ({
    name, programId: GPRU.toBase58(), accounts,
    dataBase64: Buffer.concat([discriminator(name), bytes]).toString("base64"),
  });
  const instructions = [instruction("initialize_tin_debit_verifier_v1", [
    { ...common[0], isWritable: true }, ...common.slice(1),
    { pubkey: PublicKey.default.toBase58(), isSigner: false, isWritable: false },
  ], Buffer.concat([m.circuit, m.key, m.verifierBytes.subarray(0, 448)]))];
  for (let start = 0; start < 27; start += 4) {
    const count = Math.min(4, 27 - start), vector = Buffer.alloc(5);
    vector[0] = start;
    vector.writeUInt32LE(count, 1);
    instructions.push(instruction("write_tin_debit_verifier_ic_v1", common,
      Buffer.concat([vector, m.verifierBytes.subarray(448 + start * 64, 448 + (start + count) * 64)])));
  }
  instructions.push(instruction("enable_tin_debit_verifier_v1", common));
  return {
    scope: "Unsigned development enrollment plan; operator must verify deployment and on-chain Mother authority",
    circuitCommitment: m.circuit.toString("hex"), verifyingKeyCommitment: m.key.toString("hex"), instructions,
  };
}

function verifierAccount(m, { enabled = false, points = 0 } = {}) {
  const data = Buffer.alloc(2284);
  hash(Buffer.from("account:GpruTinDebitVerifierV1")).copy(data, 0, 0, 8);
  data.writeUInt16LE(1, 8);
  authority.toBuffer().copy(data, 10);
  m.circuit.copy(data, 42);
  m.key.copy(data, 74);
  data[106] = VERIFIER_BUMP;
  data[107] = enabled ? 1 : 0;
  m.verifierBytes.subarray(0, 448).copy(data, 108);
  m.verifierBytes.subarray(448, 448 + (enabled ? 27 : points) * 64).copy(data, 556);
  return { owner: GPRU, data, executable: false };
}

function motherAccount() {
  const data = Buffer.alloc(40);
  hash(Buffer.from("account:MotherEscrow")).copy(data, 0, 0, 8);
  authority.toBuffer().copy(data, 8);
  return { owner: TSNP, data, executable: false };
}

function harness({ verifier = null, mother = motherAccount(), chain = genesis } = {}) {
  const m = material(), plan = enrollmentPlan(m);
  const calls = { signer: 0, sends: 0, material: 0 };
  const state = { mother, verifier };
  const connection = {
    getGenesisHash: async () => chain,
    getMultipleAccountsInfo: async keys => {
      assert.deepEqual(keys.map(key => key.toBase58()), [MOTHER, VERIFIER].map(key => key.toBase58()));
      return [state.mother, state.verifier];
    },
    getLatestBlockhash: async () => ({ blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100 }),
    getAccountInfo: async () => state.verifier,
  };
  const dependencies = {
    connectionFactory: () => connection,
    loadMaterial: async () => { calls.material++; return { material: m, plan }; },
    readKeypair: () => { calls.signer++; return { publicKey: authority }; },
    send: async () => { calls.sends++; throw new Error("Unexpected mocked send"); },
    log: () => {},
  };
  return { calls, connection, dependencies, m, plan, state };
}

test("nine debit instructions reproduce the exported ABI and fit individual packets", () => {
  const m = material(), expected = enrollmentPlan(m), instructions = debitInstructions(authority, m);
  assert.equal(instructions.length, 9);
  for (const [index, ix] of instructions.entries()) {
    assert.equal(ix.programId.toBase58(), expected.instructions[index].programId);
    assert.equal(ix.data.toString("base64"), expected.instructions[index].dataBase64);
    assert.deepEqual(ix.keys.map(key => ({ ...key, pubkey: key.pubkey.toBase58() })), expected.instructions[index].accounts);
    const wire = new Transaction({ feePayer: authority, recentBlockhash: PublicKey.default.toBase58() })
      .add(ix).serialize({ requireAllSignatures: false, verifySignatures: false });
    assert.ok(wire.length <= 1232);
  }
  assert.doesNotThrow(() => assertEnrollmentPlan(expected, authority, m));
});

test("modified exported instruction data, accounts, privileges and commitments are refused", () => {
  const m = material();
  for (const mutate of [
    p => { p.circuitCommitment = "00".repeat(32); },
    p => { p.verifyingKeyCommitment = "00".repeat(32); },
    p => { p.instructions[0].programId = TSNP.toBase58(); },
    p => { p.instructions[0].name = "initialize_hidden_head_verifier"; },
    p => { p.instructions[1].accounts[0].isWritable = true; },
    p => { p.instructions[1].accounts[0].isSigner = false; },
    p => { p.instructions[1].accounts[1].pubkey = otherAuthority.toBase58(); },
    p => { p.instructions[2].dataBase64 = Buffer.alloc(269).toString("base64"); },
    p => { p.instructions.pop(); },
    p => { p.instructions.reverse(); },
  ]) {
    const plan = enrollmentPlan(m); mutate(plan);
    assert.throws(() => assertEnrollmentPlan(plan, authority, m));
  }
});

test("matching partial upload resumes only missing chunks and enabled complete key is a no-op", () => {
  const m = material();
  assert.equal(debitInitializationPlan(authority, m, null).length, 9);
  assert.equal(debitInitializationPlan(authority, m, verifierAccount(m)).length, 8);
  const partial = debitInitializationPlan(authority, m, verifierAccount(m, { points: 4 }));
  assert.equal(partial.length, 7);
  assert.equal(partial[0].data[8], 4);
  const withinChunk = debitInitializationPlan(authority, m, verifierAccount(m, { points: 3 }));
  assert.equal(withinChunk.length, 8);
  assert.equal(withinChunk[0].data[8], 0);
  const complete = debitInitializationPlan(authority, m, verifierAccount(m, { points: 27 }));
  assert.equal(complete.length, 1);
  assert.deepEqual(complete[0].data, discriminator("enable_tin_debit_verifier_v1"));
  assert.deepEqual(debitInitializationPlan(authority, m, verifierAccount(m, { enabled: true })), []);
});

test("conflicting stored verifier state is refused without replacing uploaded points", () => {
  const m = material();
  for (const offset of [0, 8, 10, 42, 74, 106, 108, 555, 556, 2283]) {
    const account = verifierAccount(m, { enabled: true }); account.data[offset] ^= 1;
    assert.throws(() => debitInitializationPlan(authority, m, account), `offset ${offset}`);
  }
  const partial = verifierAccount(m, { points: 1 }); partial.data[556] ^= 1;
  assert.throws(() => debitInitializationPlan(authority, m, partial));
  const malformedEnabled = verifierAccount(m); malformedEnabled.data[107] = 2;
  assert.throws(() => debitInitializationPlan(authority, m, malformedEnabled));
  assert.throws(() => debitInitializationPlan(authority, m, { ...verifierAccount(m), owner: TSNP }));
  assert.throws(() => debitInitializationPlan(authority, m, { ...verifierAccount(m), data: Buffer.alloc(2283) }));
  const wrongKey = material(); wrongKey.key[0] ^= 1;
  assert.throws(() => debitInitializationPlan(authority, wrongKey, verifierAccount(m)));
});

test("CLI rejects incomplete, duplicate and unsupported options", () => {
  for (const args of [["rekey"], ["init", "--wallet"], ["init", "--unknown"], ["init", "--send", "--send"]]) {
    assert.throws(() => parseOptions(args));
  }
});

test("initialization requires an independent metadata pin while status remains unpinned", () => {
  const previous = process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256;
  delete process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256;
  try {
    assert.throws(() => parseOptions(["init"]), /independently pinned/);
    assert.throws(() => parseOptions(["init", "--metadata-sha256", "a".repeat(63)]));
    assert.doesNotThrow(() => parseOptions(["status"]));
    process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256 = metadataPin;
    assert.equal(parseOptions(["init"]).metadataSha256, metadataPin);
    assert.equal(parseOptions(["init", "--metadata-sha256", "b".repeat(64)]).metadataSha256, "b".repeat(64));
  } finally {
    if (previous === undefined) delete process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256;
    else process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256 = previous;
  }
});

test("preview validates plan but never reads a supplied wallet or submits", async () => {
  const h = harness();
  await main(["init", "--metadata-sha256", metadataPin, "--wallet", "unused-private-wallet.json"], h.dependencies);
  assert.equal(h.calls.material, 1);
  assert.equal(h.calls.signer, 0);
  assert.equal(h.calls.sends, 0);
});

test("status needs no artifact pin or signer", async () => {
  const h = harness();
  await main(["status"], h.dependencies);
  assert.equal(h.calls.material, 0);
  assert.equal(h.calls.signer, 0);
  assert.equal(h.calls.sends, 0);
});

test("wrong chain and malformed Mother account stop before material or signer access", async () => {
  for (const options of [
    { chain: "mainnet-or-localnet" },
    { mother: null },
    { mother: { ...motherAccount(), owner: GPRU } },
    { mother: { ...motherAccount(), data: Buffer.alloc(40) } },
  ]) {
    const h = harness(options);
    await assert.rejects(main(["init", "--metadata-sha256", metadataPin, "--send", "--wallet", "unused.json"], h.dependencies));
    assert.equal(h.calls.material, 0);
    assert.equal(h.calls.signer, 0);
    assert.equal(h.calls.sends, 0);
  }
});

test("send requires explicit wallet and matching Mother authority", async () => {
  const missing = harness();
  await assert.rejects(main(["init", "--metadata-sha256", metadataPin, "--send"], missing.dependencies));
  assert.equal(missing.calls.signer, 0);
  assert.equal(missing.calls.sends, 0);
  const wrong = harness();
  wrong.dependencies.readKeypair = () => { wrong.calls.signer++; return { publicKey: otherAuthority }; };
  await assert.rejects(main(["init", "--metadata-sha256", metadataPin, "--send", "--wallet", "unused.json"], wrong.dependencies));
  assert.equal(wrong.calls.signer, 1);
  assert.equal(wrong.calls.sends, 0);
});

test("matching enabled verifier does not read a wallet or send a transaction", async () => {
  const h = harness({ verifier: verifierAccount(material(), { enabled: true }) });
  await main(["init", "--metadata-sha256", metadataPin, "--wallet", "unused.json", "--send"], h.dependencies);
  assert.equal(h.calls.signer, 0);
  assert.equal(h.calls.sends, 0);
});

test("mocked enrollment confirms all nine steps and re-reads a complete key before enable", async () => {
  const h = harness(), sent = [];
  h.dependencies.send = async (connection, transaction, signers, options) => {
    assert.equal(connection, h.connection);
    assert.equal(signers.length, 1);
    assert.ok(signers[0].publicKey.equals(authority));
    assert.equal(options.commitment, "confirmed");
    const ix = transaction.instructions[0];
    sent.push(ix.data);
    h.calls.sends++;
    if (ix.data.subarray(0, 8).equals(discriminator("initialize_tin_debit_verifier_v1"))) {
      assert.equal(h.state.verifier, null);
      h.state.verifier = verifierAccount(h.m);
    } else if (ix.data.subarray(0, 8).equals(discriminator("write_tin_debit_verifier_ic_v1"))) {
      const start = ix.data[8], count = ix.data.readUInt32LE(9);
      ix.data.subarray(13, 13 + count * 64).copy(h.state.verifier.data, 556 + start * 64);
    } else {
      assert.deepEqual(ix.data, discriminator("enable_tin_debit_verifier_v1"));
      assert.deepEqual(h.state.verifier.data.subarray(556), h.m.verifierBytes.subarray(448));
      h.state.verifier.data[107] = 1;
    }
    return `mocked-signature-${sent.length}`;
  };
  await main(["init", "--metadata-sha256", metadataPin, "--wallet", "unused.json", "--send"], h.dependencies);
  assert.equal(h.calls.signer, 1);
  assert.equal(h.calls.sends, 9);
  assert.equal(h.state.verifier.data[107], 1);
});

test("a conflicting point observed before enable stops mocked enrollment without sending", async () => {
  const h = harness({ verifier: verifierAccount(material(), { points: 27 }) });
  const originalRead = h.connection.getMultipleAccountsInfo;
  let reads = 0;
  h.connection.getMultipleAccountsInfo = async keys => {
    if (++reads === 2) h.state.verifier.data[556] ^= 1;
    return originalRead(keys);
  };
  await assert.rejects(main(["init", "--metadata-sha256", metadataPin, "--wallet", "unused.json", "--send"], h.dependencies), /conflicts/);
  assert.equal(h.calls.sends, 0);
  assert.equal(h.state.verifier.data[107], 0);
});

test("Mother authority changes stop mocked enrollment before the next transaction", async () => {
  const h = harness();
  const originalRead = h.connection.getMultipleAccountsInfo;
  let reads = 0;
  h.connection.getMultipleAccountsInfo = async keys => {
    if (++reads === 2) otherAuthority.toBuffer().copy(h.state.mother.data, 8);
    return originalRead(keys);
  };
  await assert.rejects(main(["init", "--metadata-sha256", metadataPin, "--wallet", "unused.json", "--send"], h.dependencies), /authority changed/);
  assert.equal(h.calls.sends, 0);
});
