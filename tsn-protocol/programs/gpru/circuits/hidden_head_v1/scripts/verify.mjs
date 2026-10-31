import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.SNARKJS_CLI
  ? path.resolve(process.env.SNARKJS_CLI)
  : path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
const dev = process.env.GPRU_DEV_SETUP_DIR
  ? path.resolve(process.env.GPRU_DEV_SETUP_DIR)
  : path.join(root, "build", "hidden_head_v1", "dev");
const vk = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dev, "verification_key.json");
const publicSignals = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dev, "public.json");
const proof = process.argv[4] ? path.resolve(process.argv[4]) : path.join(dev, "proof.json");
const metadataPath = process.env.GPRU_PROVER_METADATA_PATH
  ? path.resolve(process.env.GPRU_PROVER_METADATA_PATH)
  : path.join(dev, "dev-setup.json");
for (const file of [cli, vk, publicSignals, proof, metadataPath]) {
  if (!existsSync(file)) throw new Error(`Missing verification input: ${file}`);
}
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (metadata.profile !== "LOCAL DEVELOPMENT ONLY; NOT A PRODUCTION CEREMONY" || metadata.circuit !== "hidden_head_v1") {
  throw new Error("Verifier metadata is not for the local hidden_head_v1 development setup");
}
const vkHash = createHash("sha256").update(await readFile(vk)).digest("hex");
if (metadata.verificationKeySha256 !== vkHash) throw new Error("Selected verification key does not match the development setup metadata");
const result = spawnSync(process.execPath, [cli, "groth16", "verify", vk, publicSignals, proof], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Proof verification failed with exit code ${result.status}`);
