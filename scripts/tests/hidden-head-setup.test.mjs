import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { PublicKey, Transaction, buildVerifierInstructions, validateKeyArgs, buildRootActivation, decodeRoot, decodeFundingRoot, buildFundingRootInitialization, decodeVerifierVersion, assertLegacyVerifierAuthority, assertVerifierMatches, ADDRESSES, GPRU, TCAP } from "../hidden-head-setup.mjs";

const source = fs.readFileSync(new URL("../../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom", import.meta.url));
const digest = (...parts) => { const h = createHash("sha256"); for (const part of parts) h.update(part); return [...h.digest()]; };
function fixture() {
  const args = { public_input_count: 13, alpha_g1: Array(64).fill(1), beta_g2: Array(128).fill(2), gamma_g2: Array(128).fill(3), delta_g2: Array(128).fill(4), ic: Array.from({ length: 14 }, () => Array(64).fill(5)) };
  args.circuit_commitment = digest(Buffer.from("TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0"), source, Buffer.from("circomlib-poseidon-bn254-v1"));
  args.verifying_key_commitment = digest(Buffer.from("TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0"), ...[args.alpha_g1, args.beta_g2, args.gamma_g2, args.delta_g2, ...args.ic].map(b => Buffer.from(b)));
  return args;
}
const authority = new PublicKey("11111111111111111111111111111112");

test("complete initialization is six packets within Solana's limit and the chunks reconstruct all fourteen points", () => {
  const material = validateKeyArgs(fixture(), source);
  const instructions = buildVerifierInstructions(authority, material);
  assert.equal(instructions.length, 6);
  for (const instruction of instructions) {
    const wire = new Transaction({ feePayer: authority, recentBlockhash: "11111111111111111111111111111111" }).add(instruction).serialize({ requireAllSignatures: false, verifySignatures: false });
    assert.ok(wire.length <= 1232);
  }
  assert.equal(instructions[0].data.length, 520);
  const reconstructed = [];
  for (const instruction of instructions.slice(1, -1)) {
    assert.equal(instruction.data[8], reconstructed.length / 64);
    assert.equal(instruction.data.length, 13 + instruction.data.readUInt32LE(9) * 64);
    reconstructed.push(...instruction.data.subarray(13));
  }
  assert.deepEqual(Buffer.from(reconstructed), Buffer.concat(material.points));
  assert.equal(instructions.at(-1).data.length, 8);
});

test("stale circuit, changed IC bytes and old eight-input keys are refused before any transaction", () => {
  const args = fixture();
  assert.throws(() => validateKeyArgs(args, Buffer.from("changed source")), /commitment/);
  args.ic[12][0] ^= 1;
  assert.throws(() => validateKeyArgs(args, source), /commitment/);
  args.public_input_count = 8;
  assert.throws(() => validateKeyArgs(args, source), /thirteen/);
});

test("root activation uses only the governance signer/config/root and rejects foreign or malformed root state", () => {
  const instruction = buildRootActivation(authority);
  assert.equal(instruction.keys.length, 3);
  assert.equal(instruction.keys[0].isSigner, true);
  assert.equal(instruction.keys[2].isWritable, true);
  const data = Buffer.alloc(124);
  Buffer.from(digest(Buffer.from("account:TcapCommitmentRootStateV1"))).subarray(0, 8).copy(data);
  data.writeUInt16LE(1, 8); data[122] = 1;
  assert.equal(decodeRoot({ owner: TCAP, data }).paused, true);
  assert.throws(() => decodeRoot({ owner: authority, data }), /invalid/);
  assert.throws(() => decodeRoot({ owner: TCAP, data: data.subarray(0, 123) }), /invalid/);
});

test("migration uses its explicit handler, remains six bounded packets and refuses foreign legacy authority",()=>{
  const material=validateKeyArgs(fixture(),source);
  const instructions=buildVerifierInstructions(authority,material,{migration:true});
  assert.deepEqual(instructions[0].data.subarray(0,8),Buffer.from(digest(Buffer.from("global:migrate_hidden_head_verifier_v2"))).subarray(0,8));
  assert.equal(instructions.length,6);
  for(const ix of instructions)assert.ok(new Transaction({feePayer:authority,recentBlockhash:"11111111111111111111111111111111"}).add(ix).serialize({requireAllSignatures:false,verifySignatures:false}).length<=1232);
  const data=Buffer.alloc(1388);Buffer.from(digest(Buffer.from("account:GpruHiddenHeadVerifierV1"))).subarray(0,8).copy(data);data.writeUInt16LE(1,8);authority.toBuffer().copy(data,10);
  const legacy={owner:GPRU,data};assert.equal(decodeVerifierVersion(legacy),1);assertLegacyVerifierAuthority(legacy,authority);
  assert.throws(()=>assertLegacyVerifierAuthority(legacy,TCAP),/Mother authority/);
  assert.throws(()=>assertVerifierMatches(legacy,material,authority),/invalid/);
});

test("funding initializer is governance-only and funding root decoder enforces shape, fields and capacity",()=>{
  const ix=buildFundingRootInitialization(authority);assert.equal(ix.keys.length,4);assert.ok(ix.keys[0].isSigner);assert.ok(ix.keys[0].isWritable);assert.equal(ix.keys[2].pubkey.toBase58(),ADDRESSES.fundingRoot.toBase58());
  const data=Buffer.alloc(1081);Buffer.from(digest(Buffer.from("account:TcapFundingMerkleRootV1"))).subarray(0,8).copy(data);data.writeUInt16LE(1,8);data.writeUInt16LE(1,10);data[12]=PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")],TCAP)[1];data[44]=1;data.writeUInt32LE(32,53);
  assert.equal(decodeFundingRoot({owner:TCAP,data}).leafCount,"0");
  const wrongLength=Buffer.from(data);wrongLength.writeUInt32LE(31,53);assert.throws(()=>decodeFundingRoot({owner:TCAP,data:wrongLength}),/Invalid/);
  const full=Buffer.from(data);full.writeBigUInt64LE(2n**32n,45);assert.equal(decodeFundingRoot({owner:TCAP,data:full}).leafCount,"4294967296");full.writeBigUInt64LE(2n**32n+1n,45);assert.throws(()=>decodeFundingRoot({owner:TCAP,data:full}),/Invalid/);
  assert.throws(()=>decodeFundingRoot({owner:GPRU,data}),/invalid/);
});
