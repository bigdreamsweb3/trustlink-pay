import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.GPRU_DEV_SETUP_DIR
  ? path.resolve(process.env.GPRU_DEV_SETUP_DIR)
  : path.join(root, "build", "hidden_head_v1", "dev");
const suppliedPotFinal = process.env.GPRU_PTAU_FINAL_PATH
  ? path.resolve(process.env.GPRU_PTAU_FINAL_PATH)
  : null;
const r1cs = path.join(root, "build", "hidden_head_v1", "main.r1cs");
const cli = process.env.SNARKJS_CLI
  ? path.resolve(process.env.SNARKJS_CLI)
  : path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");

if (!existsSync(r1cs)) throw new Error("Compile the circuit first: npm run circuit:compile");
if (!existsSync(cli)) throw new Error("Install pinned circuit tools first: npm ci");
if (existsSync(path.join(output, "dev-setup.json"))) {
  throw new Error(`Development setup already exists at ${output}; preserve it or move it before creating another setup.`);
}
await mkdir(output, { recursive: true });

function run(args, label) {
  console.log(`[dev setup] ${label}`);
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}
function runNode(script, args, label) {
  console.log(`[dev setup] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

const pot0 = path.join(output, "pot_0000.ptau");
const pot1 = path.join(output, "pot_0001.ptau");
const potFinal = suppliedPotFinal ?? path.join(output, "pot_final.ptau");
const zkey0 = path.join(output, "hidden_head_0000.zkey");
const zkeyFinal = path.join(output, "hidden_head_dev_only.zkey");
const verificationKey = path.join(output, "verification_key.json");

if (suppliedPotFinal) {
  if (!existsSync(suppliedPotFinal)) throw new Error(`Prepared Powers of Tau file not found: ${suppliedPotFinal}`);
  run(["powersoftau", "verify", potFinal], "Verify supplied prepared Powers of Tau file");
} else {
  run(["powersoftau", "new", "bn128", "18", pot0, "-v"], "Create local Powers of Tau ceremony");
  run(["powersoftau", "contribute", pot0, pot1, `--name=LOCAL DEVELOPMENT ONLY`, "-v", `--entropy=${randomBytes(32).toString("hex")}`], "Contribute local development entropy");
  run(["powersoftau", "prepare", "phase2", pot1, potFinal, "-v"], "Prepare phase 2");
  run(["powersoftau", "verify", potFinal], "Verify prepared Powers of Tau file");
}
run(["groth16", "setup", r1cs, potFinal, zkey0], "Create circuit-specific development key");
run(["zkey", "contribute", zkey0, zkeyFinal, `--name=LOCAL DEVELOPMENT ONLY`, "-v", `--entropy=${randomBytes(32).toString("hex")}`], "Contribute circuit-specific development entropy");
run(["zkey", "verify", r1cs, potFinal, zkeyFinal], "Verify development key against R1CS and Powers of Tau");
run(["zkey", "export", "verificationkey", zkeyFinal, verificationKey], "Export development verification key");

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}
const toolVersion = JSON.parse(await readFile(path.join(root, "node_modules", "snarkjs", "package.json"), "utf8")).version;
const circomVersion = JSON.parse(await readFile(path.join(root, "node_modules", "circom2", "package.json"), "utf8")).version;
const circomlibVersion = JSON.parse(await readFile(path.join(root, "node_modules", "circomlib", "package.json"), "utf8")).version;
const metadata = {
  profile: "LOCAL DEVELOPMENT ONLY; NOT A PRODUCTION CEREMONY",
  circuit: "hidden_head_v1",
  curve: "bn128",
  powersOfTauPower: 18,
  snarkjsVersion: toolVersion,
  circom2PackageVersion: circomVersion,
  circomlibVersion,
  powersOfTauSource: suppliedPotFinal ? path.basename(suppliedPotFinal) : "locally generated development ceremony",
  r1csSha256: await sha256(r1cs),
  powersOfTauSha256: await sha256(potFinal),
  provingKeySha256: await sha256(zkeyFinal),
  verificationKeySha256: await sha256(verificationKey),
  generatedAt: new Date().toISOString(),
  warning: "This single-machine setup is only for local/devnet integration experiments. It is not an audited multi-party ceremony and must not secure production funds.",
};
await writeFile(path.join(output, "dev-setup.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });

runNode(path.join(root, "scripts", "export-verifier.mjs"), [verificationKey, path.join(output, "verifier-init-args.json")], "Encode the verifier initializer arguments for groth16-solana");
console.log(`[dev setup] Ready: ${output}`);
console.log("[dev setup] Do not use these artifacts for production or a production Mother verifier initialization.");
