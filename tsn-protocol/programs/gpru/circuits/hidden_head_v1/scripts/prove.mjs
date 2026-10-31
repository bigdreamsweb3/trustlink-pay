import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.SNARKJS_CLI
  ? path.resolve(process.env.SNARKJS_CLI)
  : path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
const build = path.join(root, "build", "hidden_head_v1");
const dev = process.env.GPRU_DEV_SETUP_DIR ? path.resolve(process.env.GPRU_DEV_SETUP_DIR) : path.join(build, "dev");
const wasm = process.env.GPRU_CIRCUIT_WASM_PATH
  ? path.resolve(process.env.GPRU_CIRCUIT_WASM_PATH)
  : path.join(build, "main_js", "main.wasm");
const provingKey = process.env.GPRU_PROVING_KEY_PATH
  ? path.resolve(process.env.GPRU_PROVING_KEY_PATH)
  : path.join(dev, "hidden_head_dev_only.zkey");
const output = process.env.GPRU_PROVER_OUTPUT_DIR ? path.resolve(process.env.GPRU_PROVER_OUTPUT_DIR) : dev;
const input = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!input) throw new Error("Usage: npm run prove -- <private-witness-input.json>");
const metadataPath = process.env.GPRU_PROVER_METADATA_PATH
  ? path.resolve(process.env.GPRU_PROVER_METADATA_PATH)
  : path.join(dev, "dev-setup.json");
for (const file of [cli, path.join(build, "main.r1cs"), wasm, provingKey, metadataPath, input]) {
  if (!existsSync(file)) throw new Error(`Missing prover artifact: ${file}`);
}
async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (metadata.profile !== "LOCAL DEVELOPMENT ONLY; NOT A PRODUCTION CEREMONY" || metadata.circuit !== "hidden_head_v1") {
  throw new Error("Prover metadata is not for the local hidden_head_v1 development setup");
}
if (metadata.r1csSha256 !== await sha256(path.join(build, "main.r1cs"))) {
  throw new Error("Current R1CS does not match the development proving-key metadata; regenerate matching circuit artifacts");
}
if (metadata.provingKeySha256 !== await sha256(provingKey)) {
  throw new Error("Selected proving key does not match the development setup metadata");
}
if (metadata.witnessWasmSha256 && metadata.witnessWasmSha256 !== await sha256(wasm)) {
  throw new Error("Selected witness calculator WASM does not match the development setup metadata; recompile and regenerate matching artifacts");
}
if (!metadata.witnessWasmSha256) {
  throw new Error("Development setup does not bind a witness calculator WASM hash; recompile the circuit and regenerate its development artifact metadata");
}
await mkdir(output, { recursive: true });
const witness = path.join(output, "witness.wtns");
const proof = path.join(output, "proof.json");
const publicSignals = path.join(output, "public.json");
for (const args of [
  ["wtns", "calculate", wasm, input, witness],
  ["groth16", "prove", provingKey, witness, proof, publicSignals],
]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`snarkjs ${args.slice(0, 2).join(" ")} failed with exit code ${result.status}`);
}
console.log(`Proof: ${proof}`);
console.log(`Public signals: ${publicSignals}`);
console.log("Artifacts are local development output; protect the private witness input and witness file.");
