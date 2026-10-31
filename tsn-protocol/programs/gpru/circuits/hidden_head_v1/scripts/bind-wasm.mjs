import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, "build", "hidden_head_v1");
const dev = process.env.GPRU_DEV_SETUP_DIR
  ? path.resolve(process.env.GPRU_DEV_SETUP_DIR)
  : path.join(build, "dev");
const metadataPath = path.join(dev, "dev-setup.json");
const r1csPath = path.join(build, "main.r1cs");
const wasmPath = process.env.GPRU_CIRCUIT_WASM_PATH
  ? path.resolve(process.env.GPRU_CIRCUIT_WASM_PATH)
  : path.join(build, "main_js", "main.wasm");
const provingKeyPath = process.env.GPRU_PROVING_KEY_PATH
  ? path.resolve(process.env.GPRU_PROVING_KEY_PATH)
  : path.join(dev, "hidden_head_dev_only.zkey");

for (const file of [metadataPath, r1csPath, wasmPath, provingKeyPath]) {
  if (!existsSync(file)) throw new Error(`Missing artifact required to bind witness WASM: ${file}`);
}
async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (metadata.profile !== "LOCAL DEVELOPMENT ONLY; NOT A PRODUCTION CEREMONY" || metadata.circuit !== "hidden_head_v1") {
  throw new Error("Refusing to modify metadata that is not for the local hidden_head_v1 development setup");
}
const [r1csSha256, provingKeySha256, witnessWasmSha256] = await Promise.all([
  sha256(r1csPath),
  sha256(provingKeyPath),
  sha256(wasmPath),
]);
if (metadata.r1csSha256 !== r1csSha256) {
  throw new Error("Current R1CS differs from the one used for this proving key; create a new circuit-specific setup first");
}
if (metadata.provingKeySha256 !== provingKeySha256) {
  throw new Error("Selected proving key differs from this setup metadata; refusing to bind the witness WASM");
}
metadata.witnessWasmSha256 = witnessWasmSha256;
metadata.witnessWasmBoundToR1csSha256 = r1csSha256;
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Bound witness WASM to the unchanged development R1CS in ${metadataPath}`);
console.log(`R1CS SHA-256: ${r1csSha256}`);
console.log(`WASM SHA-256: ${witnessWasmSha256}`);
console.log("Development-only artifacts; this does not certify the setup for production.");
