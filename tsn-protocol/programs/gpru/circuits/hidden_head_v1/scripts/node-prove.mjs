// Node settlement adapter: private witness enters over stdin, never an argv
// value, log, or persistent witness file. Only a locally verified proof exits.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest("hex");
const scalarModulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const baseModulus = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function scalar(value, modulus = baseModulus) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("NONCANONICAL_PROVER_FIELD");
  const n = BigInt(value);
  if (n >= modulus) throw new Error("PROVER_FIELD_OUT_OF_RANGE");
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}
function g1(point, negate = false) {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== "1") throw new Error("INVALID_PROVER_G1_POINT");
  const x = scalar(point[0]);
  scalar(point[1]);
  const y = negate ? ((baseModulus - BigInt(point[1])) % baseModulus).toString() : point[1];
  return Buffer.concat([x, scalar(y)]);
}
function g2(point) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(row => Array.isArray(row) && row.length === 2)
      || point[2][0] !== "1" || point[2][1] !== "0") throw new Error("INVALID_PROVER_G2_POINT");
  // Same Fq2 limb order as export-verifier.mjs and groth16-solana.
  return Buffer.concat([scalar(point[0][1]), scalar(point[0][0]), scalar(point[1][1]), scalar(point[1][0])]);
}

try {
  const required = ["GPRU_CIRCUIT_BUILD_DIR", "GPRU_CIRCUIT_WASM_PATH", "GPRU_PROVING_KEY_PATH", "GPRU_VERIFICATION_KEY_PATH", "GPRU_PROVER_METADATA_PATH", "GPRU_PROVER_METADATA_SHA256"];
  if (required.some(name => !process.env[name])) throw new Error("GPRU_GROTH16_PROVER_NOT_CONFIGURED");
  const metadataBytes = await readFile(path.resolve(process.env.GPRU_PROVER_METADATA_PATH));
  if (!/^[0-9a-f]{64}$/.test(process.env.GPRU_PROVER_METADATA_SHA256)
      || hash(metadataBytes) !== process.env.GPRU_PROVER_METADATA_SHA256) throw new Error("PROVER_METADATA_PIN_MISMATCH");
  const metadata = JSON.parse(metadataBytes);
  if (metadata.circuit !== "hidden_head_v1" || metadata.curve !== "bn128") throw new Error("PROVER_CIRCUIT_MISMATCH");
  const source = await readFile(path.join(root, "main.circom"));
  const artifactPaths = {
    circuitSourceSha256: path.join(root, "main.circom"),
    r1csSha256: path.join(path.resolve(process.env.GPRU_CIRCUIT_BUILD_DIR), "main.r1cs"),
    witnessWasmSha256: path.resolve(process.env.GPRU_CIRCUIT_WASM_PATH),
    provingKeySha256: path.resolve(process.env.GPRU_PROVING_KEY_PATH),
    verificationKeySha256: path.resolve(process.env.GPRU_VERIFICATION_KEY_PATH),
  };
  for (const [key, artifactPath] of Object.entries(artifactPaths)) {
    if (!/^[0-9a-f]{64}$/.test(metadata[key] ?? "") || hash(await readFile(artifactPath)) !== metadata[key]) {
      throw new Error("PROVER_ARTIFACT_HASH_MISMATCH");
    }
  }
  const vk = JSON.parse(await readFile(artifactPaths.verificationKeySha256, "utf8"));
  if (vk.protocol !== "groth16" || vk.curve !== "bn128" || vk.nPublic !== 13 || vk.IC?.length !== 14) throw new Error("PROVER_VERIFIER_ABI_MISMATCH");
  const verifierBytes = Buffer.concat([g1(vk.vk_alpha_1), g2(vk.vk_beta_2), g2(vk.vk_gamma_2), g2(vk.vk_delta_2), ...vk.IC.map(point => g1(point))]);
  let inputBytes = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    inputBytes = Buffer.concat([inputBytes, chunk]);
    if (inputBytes.length > 128 * 1024) throw new Error("PROVER_WITNESS_TOO_LARGE");
  }
  const input = JSON.parse(inputBytes);
  let proof, publicSignals;
  if (process.argv[2] === "--verify") {
    function limbs(value, bytes) {
      if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) throw new Error("INVALID_PROOF_ENCODING");
      return value.match(/.{64}/g).map(limb => BigInt(`0x${limb}`).toString());
    }
    const a = limbs(input.proofA, 64), b = limbs(input.proofB, 128), c = limbs(input.proofC, 64);
    proof = {
      protocol: "groth16", curve: "bn128",
      pi_a: [a[0], ((baseModulus - BigInt(a[1])) % baseModulus).toString(), "1"],
      pi_b: [[b[1], b[0]], [b[3], b[2]], ["1", "0"]], pi_c: [...c, "1"],
    };
    if (!Array.isArray(input.publicInputs) || input.publicInputs.length !== 13) throw new Error("INVALID_PUBLIC_INPUTS");
    publicSignals = input.publicInputs.map(value => limbs(value, 32)[0]);
  } else {
    ({ proof, publicSignals } = await snarkjs.groth16.fullProve(input, artifactPaths.witnessWasmSha256, artifactPaths.provingKeySha256));
  }
  if (publicSignals.length !== 13 || !await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error("LOCAL_GROTH16_VERIFICATION_FAILED");
  const output = {
    publicInputs: publicSignals.map(value => scalar(value, scalarModulus).toString("hex")),
    // groth16-solana expects -A for its pairing equation.
    proofA: g1(proof.pi_a, true).toString("hex"), proofB: g2(proof.pi_b).toString("hex"), proofC: g1(proof.pi_c).toString("hex"),
    circuitCommitment: hash(Buffer.from("TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0"), source, Buffer.from("circomlib-poseidon-bn254-v1")),
    verifyingKeyCommitment: hash(Buffer.from("TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0"), verifierBytes),
    verifierBytes: verifierBytes.toString("hex"),
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
} catch {
  // snarkjs/WASM errors can contain private input values. Emit a fixed error.
  process.stderr.write("GPRU_LOCAL_PROVER_FAILED\n");
  process.exit(1);
}
