import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.SNARKJS_CLI
  ? path.resolve(process.env.SNARKJS_CLI)
  : path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");
const build = path.join(root, "build", "hidden_head_v1");
const dev = process.env.GPRU_DEV_SETUP_DIR ? path.resolve(process.env.GPRU_DEV_SETUP_DIR) : path.join(build, "dev");
const input = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!input) throw new Error("Usage: npm run prove -- <private-witness-input.json>");
for (const file of [cli, path.join(build, "main_js", "main.wasm"), path.join(dev, "hidden_head_dev_only.zkey")]) {
  if (!existsSync(file)) throw new Error(`Missing prover artifact: ${file}`);
}
const witness = path.join(dev, "witness.wtns");
const proof = path.join(dev, "proof.json");
const publicSignals = path.join(dev, "public.json");
for (const args of [
  ["wtns", "calculate", path.join(build, "main_js", "main.wasm"), input, witness],
  ["groth16", "prove", path.join(dev, "hidden_head_dev_only.zkey"), witness, proof, publicSignals],
]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`snarkjs ${args.slice(0, 2).join(" ")} failed with exit code ${result.status}`);
}
console.log(`Proof: ${proof}`);
console.log(`Public signals: ${publicSignals}`);
console.log("Artifacts are local development output; protect the private witness input.");
