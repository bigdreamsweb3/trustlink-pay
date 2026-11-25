// Separate, operator-invoked development verifier enrollment. Preview never opens a wallet.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sendAndConfirmDebitTransaction } from "./tin-debit-http-confirmation.mjs";

const require = createRequire(new URL("../tsn-protocol/sdks/tsn-sdk/package.json", import.meta.url));
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require("@solana/web3.js");
export { PublicKey, Transaction };
export const GPRU = new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
export const TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
export const MOTHER = PublicKey.findProgramAddressSync([Buffer.from("tsn_mother_escrow")], TSNP)[0];
export const [VERIFIER, VERIFIER_BUMP] = PublicKey.findProgramAddressSync([Buffer.from("gpru:tin-debit-verifier:v1")], GPRU);
const CIRCUIT = fileURLToPath(new URL("../tsn-protocol/programs/gpru/circuits/hidden_head_tin_debit_v1/", import.meta.url));
const DEFAULT_BUILD = path.join(CIRCUIT, "build/native-tin-debit");
const GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const hash = (...values) => createHash("sha256").update(Buffer.concat(values)).digest();
const disc = name => hash(Buffer.from(name)).subarray(0, 8);
const zero = value => value.every(byte => byte === 0);

export function parseOptions(argv) {
  const options = { command: argv[0] ?? "status", rpc: "https://api.devnet.solana.com", buildDir: DEFAULT_BUILD, send: false };
  if (!["status", "init"].includes(options.command)) throw Error("Usage: tin-debit-setup.mjs status|init [--rpc URL] [--build-dir PATH] [--plan FILE] [--metadata-sha256 HEX] [--wallet KEYPAIR] [--send]");
  const fields = { "--rpc": "rpc", "--build-dir": "buildDir", "--plan": "plan", "--metadata-sha256": "metadataSha256", "--wallet": "wallet" };
  const seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw Error("Duplicate TIN-Debit setup option");
    seen.add(flag);
    if (flag === "--send") options.send = true;
    else if (fields[flag] && argv[i + 1] && !argv[i + 1].startsWith("--")) options[fields[flag]] = argv[++i];
    else throw Error("Unknown or missing TIN-Debit setup option");
  }
  options.buildDir = path.resolve(options.buildDir);
  options.plan = path.resolve(options.plan ?? path.join(options.buildDir, "verifier-instructions.json"));
  options.metadataSha256 ??= process.env.GPRU_TIN_DEBIT_PROVER_METADATA_SHA256;
  if (options.send && (options.command !== "init" || !options.wallet)) throw Error("--send requires init and an explicit --wallet");
  if (options.command === "init" && !/^[0-9a-f]{64}$/.test(options.metadataSha256 ?? "")) throw Error("init requires an independently pinned --metadata-sha256 or GPRU_TIN_DEBIT_PROVER_METADATA_SHA256");
  return options;
}

function checkedMaterial(material) {
  if (!material || !Buffer.isBuffer(material.circuit) || material.circuit.length !== 32 || zero(material.circuit)
      || !Buffer.isBuffer(material.key) || material.key.length !== 32
      || !Buffer.isBuffer(material.verifierBytes) || material.verifierBytes.length !== 2176
      || !hash(Buffer.from("GPRU_TIN_DEBIT_VERIFYING_KEY_V1\0"), material.verifierBytes).equals(material.key)) throw Error("Invalid TIN-Debit verifier material or key commitment");
  for (let i = 0; i < 27; i++) if (zero(material.verifierBytes.subarray(448 + i * 64, 512 + i * 64))) throw Error("Invalid zero TIN-Debit IC point");
  return material;
}

export function debitInstructions(authority, material) {
  checkedMaterial(material);
  const keys = [{ pubkey: authority, isSigner: true, isWritable: false }, { pubkey: MOTHER, isSigner: false, isWritable: false }, { pubkey: VERIFIER, isSigner: false, isWritable: true }];
  const instructions = [new TransactionInstruction({ programId: GPRU,
    keys: [{ ...keys[0], isWritable: true }, ...keys.slice(1), { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc("global:initialize_tin_debit_verifier_v1"), material.circuit, material.key, material.verifierBytes.subarray(0, 448)]) })];
  for (let start = 0; start < 27; start += 4) {
    const count = Math.min(4, 27 - start), vector = Buffer.alloc(5);
    vector[0] = start; vector.writeUInt32LE(count, 1);
    instructions.push(new TransactionInstruction({ programId: GPRU, keys,
      data: Buffer.concat([disc("global:write_tin_debit_verifier_ic_v1"), vector, material.verifierBytes.subarray(448 + start * 64, 448 + (start + count) * 64)]) }));
  }
  instructions.push(new TransactionInstruction({ programId: GPRU, keys, data: disc("global:enable_tin_debit_verifier_v1") }));
  return instructions;
}

const instructionNames = ["initialize_tin_debit_verifier_v1", ...Array(7).fill("write_tin_debit_verifier_ic_v1"), "enable_tin_debit_verifier_v1"];
function publicInstructions(authority, material) {
  return debitInstructions(authority, material).map((ix, i) => ({ name: instructionNames[i], programId: ix.programId.toBase58(),
    accounts: ix.keys.map(key => ({ pubkey: key.pubkey.toBase58(), isSigner: key.isSigner, isWritable: key.isWritable })), dataBase64: ix.data.toString("base64") }));
}
const stable = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});
export function assertEnrollmentPlan(plan, authority, material) {
  if (!plan || plan.circuitCommitment !== material.circuit.toString("hex") || plan.verifyingKeyCommitment !== material.key.toString("hex")
      || stable(plan.instructions) !== stable(publicInstructions(authority, material))) throw Error("TIN-Debit enrollment plan differs from verified artifacts, authority or exact instructions");
}

function verifierIdentity(info, authority) {
  if (!info || !info.owner.equals(GPRU) || info.data.length !== 2284 || !info.data.subarray(0, 8).equals(disc("account:GpruTinDebitVerifierV1"))) throw Error("Invalid TIN-Debit verifier account");
  const d = info.data;
  if (d.readUInt16LE(8) !== 1 || !d.subarray(10, 42).equals(authority.toBuffer()) || d[106] !== VERIFIER_BUMP || ![0, 1].includes(d[107])) throw Error("TIN-Debit verifier version, authority, bump or enabled state differs");
  return d;
}

export function debitInitializationPlan(authority, material, verifier) {
  const instructions = debitInstructions(authority, material);
  if (!verifier) return instructions;
  const d = verifierIdentity(verifier, authority);
  if (!d.subarray(42, 74).equals(material.circuit) || !d.subarray(74, 106).equals(material.key)
      || !d.subarray(108, 556).equals(material.verifierBytes.subarray(0, 448))) throw Error("Existing TIN-Debit verifier material conflicts; no rekey or overwrite is supported");
  const missing = new Set();
  for (let i = 0; i < 27; i++) {
    const point = d.subarray(556 + i * 64, 620 + i * 64), expected = material.verifierBytes.subarray(448 + i * 64, 512 + i * 64);
    if (point.equals(expected)) continue;
    if (d[107] === 0 && zero(point)) missing.add(Math.floor(i / 4));
    else throw Error("Existing TIN-Debit IC point conflicts; refusing overwrite");
  }
  if (d[107] === 1) return [];
  return [...instructions.slice(1, 8).filter((_ix, i) => missing.has(i)), instructions[8]];
}

export async function loadMaterial(options) {
  const metadata = path.join(options.buildDir, "dev/metadata.json"), metadataBytes = fs.readFileSync(metadata);
  if (!hash(metadataBytes).equals(Buffer.from(options.metadataSha256, "hex"))) throw Error("TIN-Debit metadata pin mismatch");
  const fixture = fs.readFileSync(path.join(options.buildDir, "native-proof-fixture.bin"));
  if (fixture.length !== 3264) throw Error("Invalid existing TIN-Debit native proof fixture");
  const input = { publicInputs: Array.from({ length: 26 }, (_, i) => fixture.subarray(2176 + i * 32, 2208 + i * 32).toString("hex")),
    proofA: fixture.subarray(3008, 3072).toString("hex"), proofB: fixture.subarray(3072, 3200).toString("hex"), proofC: fixture.subarray(3200, 3264).toString("hex") };
  const env = { ...process.env, GPRU_TIN_DEBIT_CIRCUIT_BUILD_DIR: options.buildDir,
    GPRU_TIN_DEBIT_CIRCUIT_WASM_PATH: path.join(options.buildDir, "main_js/main.wasm"),
    GPRU_TIN_DEBIT_PROVING_KEY_PATH: path.join(options.buildDir, "dev/tin_debit_dev_only.zkey"),
    GPRU_TIN_DEBIT_VERIFICATION_KEY_PATH: path.join(options.buildDir, "dev/verification_key.json"),
    GPRU_TIN_DEBIT_PROVER_METADATA_PATH: metadata, GPRU_TIN_DEBIT_PROVER_METADATA_SHA256: options.metadataSha256 };
  const result = spawnSync(process.execPath, [path.join(CIRCUIT, "tools/node-prove.mjs"), "--verify"], {
    cwd: CIRCUIT, env, input: JSON.stringify(input), encoding: "utf8", maxBuffer: 32768, timeout: 120000, windowsHide: true });
  if (result.error || result.status !== 0) throw Error("Existing TIN-Debit artifact/proof verification failed");
  const verified = JSON.parse(result.stdout);
  if (!["circuitCommitment", "verifyingKeyCommitment"].every(key => /^[0-9a-f]{64}$/.test(verified[key] ?? ""))
      || !/^[0-9a-f]{4352}$/.test(verified.verifierBytes ?? "") || stable(input.publicInputs) !== stable(verified.publicInputs)
      || ["proofA", "proofB", "proofC"].some(key => input[key] !== verified[key])) throw Error("Invalid verified TIN-Debit artifact output");
  const material = checkedMaterial({ circuit: Buffer.from(verified.circuitCommitment, "hex"), key: Buffer.from(verified.verifyingKeyCommitment, "hex"), verifierBytes: Buffer.from(verified.verifierBytes, "hex") });
  if (!fixture.subarray(0, 2176).equals(material.verifierBytes)) throw Error("Existing TIN-Debit fixture key differs from verified artifacts");
  return { material, plan: JSON.parse(fs.readFileSync(options.plan, "utf8")) };
}

function motherAuthority(mother) {
  if (!mother || !mother.owner.equals(TSNP) || mother.data.length < 40 || !mother.data.subarray(0, 8).equals(disc("account:MotherEscrow"))) throw Error("Invalid canonical Mother Escrow");
  return new PublicKey(mother.data.subarray(8, 40));
}
function packetBytes(authority, instructions) {
  return instructions.map(ix => new Transaction({ feePayer: authority, recentBlockhash: PublicKey.default.toBase58() }).add(ix).serialize({ requireAllSignatures: false, verifySignatures: false }).length);
}

export async function main(argv, dependencies = {}) {
  const options = parseOptions(argv), log = dependencies.log ?? console.log;
  const connection = (dependencies.connectionFactory ?? (rpc => new Connection(rpc, {
    commitment: "confirmed", disableRetryOnRateLimit: true,
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) }),
  })))(options.rpc);
  if (await connection.getGenesisHash() !== GENESIS) throw Error("TIN-Debit setup requires Devnet");
  let [mother, verifier] = await connection.getMultipleAccountsInfo([MOTHER, VERIFIER], "confirmed");
  const authority = motherAuthority(mother);
  if (verifier) verifierIdentity(verifier, authority);
  log(JSON.stringify({ verifier: VERIFIER.toBase58(), authority: authority.toBase58(), exists: !!verifier, enabled: verifier?.data[107] === 1,
    deploymentParity: "Not checked by enrollment; verify matching GPRU, TCAP and TSNP binaries separately" }));
  if (options.command === "status") return;
  const { material, plan } = await (dependencies.loadMaterial ?? loadMaterial)(options);
  assertEnrollmentPlan(plan, authority, material);
  const instructions = debitInitializationPlan(authority, material, verifier), sizes = packetBytes(authority, instructions);
  if (sizes.some(size => size > 1232)) throw Error("TIN-Debit setup packet exceeds Solana limit");
  log(JSON.stringify({ mode: options.send ? "SEND" : "READ-ONLY PLAN", transactions: instructions.length, packetBytes: sizes,
    circuitCommitment: material.circuit.toString("hex"), verifyingKeyCommitment: material.key.toString("hex") }));
  if (!options.send || !instructions.length) return;
  const signer = (dependencies.readKeypair ?? (wallet => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(wallet, "utf8"))))))(options.wallet);
  if (!signer.publicKey.equals(authority)) throw Error("Wallet must match current Mother authority");
  const send = dependencies.send ?? sendAndConfirmDebitTransaction;
  // Re-read after every confirmed transaction, including before enabling. A matching
  // concurrent upload can be skipped; conflicting material always stops this run.
  for (let step = 0; step <= 9; step++) {
    [mother, verifier] = await connection.getMultipleAccountsInfo([MOTHER, VERIFIER], "confirmed");
    if (!motherAuthority(mother).equals(authority)) throw Error("Mother authority changed during enrollment");
    const remaining = debitInitializationPlan(authority, material, verifier);
    if (!remaining.length) { log("CONFIRMED: TIN-Debit verifier enabled with all 27 matching IC points"); return; }
    if (step === 9) throw Error("TIN-Debit enrollment did not reach the expected confirmed state; inspect existing account before retry");
    const blockhashContext = await connection.getLatestBlockhashAndContext("confirmed");
    const transaction = new Transaction({ feePayer: authority, blockhash: blockhashContext.value.blockhash,
      lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight }).add(remaining[0]);
    log(JSON.stringify({ signature: await send(connection, transaction, [signer], {
      commitment: "confirmed", blockhashContext, onSigned: candidate => log(JSON.stringify({ phase: "SIGNED", ...candidate })),
    }) }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(String(error.message).replace(/https?:\/\/[^\s]+/g, "[RPC URL]")); process.exitCode = 1;
});
