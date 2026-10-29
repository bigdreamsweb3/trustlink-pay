import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, "build", "hidden_head_v1", "dev");
const inputPath = path.resolve(process.argv[2] ?? path.join(build, "verification_key.json"));
const outputPath = path.resolve(process.argv[3] ?? path.join(build, "verifier-init-args.json"));
const vk = JSON.parse(await readFile(inputPath, "utf8"));

function scalarBytes(value, label) {
  const n = BigInt(value);
  if (n < 0n || n >= (1n << 256n)) throw new Error(`${label} is outside 256-bit range`);
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}
function g1(point, label) {
  if (!Array.isArray(point) || point.length < 2) throw new Error(`${label} must contain G1 x/y`);
  return Buffer.concat([scalarBytes(point[0], `${label}.x`), scalarBytes(point[1], `${label}.y`)]);
}
function g2(point, label) {
  if (!Array.isArray(point) || point.length < 2 || point.some((row) => !Array.isArray(row) || row.length < 2)) {
    throw new Error(`${label} must contain the snarkjs G2 x/y coordinates`);
  }
  // groth16-solana 0.0.2 follows its parse_vk_to_rust.js encoding: for each
  // Fq2 coordinate, reverse the concatenated little-endian limbs, yielding
  // big-endian c1 || c0 bytes.
  return Buffer.concat([
    scalarBytes(point[0][1], `${label}.x.c1`), scalarBytes(point[0][0], `${label}.x.c0`),
    scalarBytes(point[1][1], `${label}.y.c1`), scalarBytes(point[1][0], `${label}.y.c0`),
  ]);
}
function bytes(buffer) { return [...buffer]; }
function digest(parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

if (!Array.isArray(vk.IC) || vk.IC.length !== 9) {
  throw new Error(`Expected 9 IC points (constant + 8 public inputs), got ${vk.IC?.length ?? "none"}`);
}
const alpha = g1(vk.vk_alpha_1, "vk_alpha_1");
const beta = g2(vk.vk_beta_2, "vk_beta_2");
const gamma = g2(vk.vk_gamma_2, "vk_gamma_2");
const delta = g2(vk.vk_delta_2, "vk_delta_2");
const ic = vk.IC.map((point, index) => g1(point, `IC[${index}]`));
const circuitSource = await readFile(path.join(root, "main.circom"));
const circuitCommitment = digest([
  Buffer.from("TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0"),
  circuitSource,
  Buffer.from("circomlib-poseidon-bn254-v1"),
]);
const vkCommitment = digest([
  Buffer.from("TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0"),
  alpha, beta, gamma, delta, ...ic,
]);

const args = {
  profile: "LOCAL DEVELOPMENT ONLY; NOT A PRODUCTION CEREMONY",
  circuit_commitment: bytes(circuitCommitment),
  verifying_key_commitment: bytes(vkCommitment),
  alpha_g1: bytes(alpha),
  beta_g2: bytes(beta),
  gamma_g2: bytes(gamma),
  delta_g2: bytes(delta),
  ic: ic.map(bytes),
  public_input_count: 8,
};
for (const [name, value, length] of [["alpha_g1", alpha, 64], ["beta_g2", beta, 128], ["gamma_g2", gamma, 128], ["delta_g2", delta, 128]]) {
  if (value.length !== length) throw new Error(`${name} encoded to ${value.length} bytes, expected ${length}`);
}
await writeFile(outputPath, `${JSON.stringify(args, null, 2)}\n`, { flag: "wx" });
console.log(`Wrote ${outputPath}`);
console.log(`Circuit commitment: ${circuitCommitment.toString("hex")}`);
console.log(`Verifying-key commitment: ${vkCommitment.toString("hex")}`);
console.log("Encoded 9 IC points for the GPRU V1 verifier initializer.");
