import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
for (const file of [cli, vk, publicSignals, proof]) if (!existsSync(file)) throw new Error(`Missing verification input: ${file}`);
const result = spawnSync(process.execPath, [cli, "groth16", "verify", vk, publicSignals, proof], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Proof verification failed with exit code ${result.status}`);
