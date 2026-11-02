import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Use the installed TSN SDK dependency tree; the root checkout may contain
// incomplete package placeholders and setup does not require a built SDK.
const sdkRequire = createRequire(new URL("../tsn-protocol/sdks/tsn-sdk/package.json", import.meta.url));
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = sdkRequire("@solana/web3.js");
export { PublicKey, Transaction };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GPRU = new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
export const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
export const TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const pda = (program, seed) => PublicKey.findProgramAddressSync([Buffer.from(seed)], program)[0];
export const ADDRESSES = {
  mother: pda(TSNP, "tsn_mother_escrow"), config: pda(TCAP, "tcap:global-config:v1"),
  root: pda(TCAP, "tcap:commitment-root:v1"), verifier: pda(GPRU, "gpru:hidden-head-verifier:v1"),
};
const digest = (...parts) => { const hash = createHash("sha256"); for (const part of parts) hash.update(part); return hash.digest(); };
const discriminator = (name) => digest(Buffer.from(`global:${name}`)).subarray(0, 8);
const accountDiscriminator = (name) => digest(Buffer.from(`account:${name}`)).subarray(0, 8);
const asBytes = (value, size, label) => {
  if (!Array.isArray(value) || value.length !== size || value.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error(`Invalid ${label}: expected ${size} bytes`);
  return Buffer.from(value);
};

export function validateKeyArgs(args, circuitSource) {
  if (args.public_input_count !== 12 || !Array.isArray(args.ic) || args.ic.length !== 13) throw new Error("Expected the current twelve-input/thirteen-IC-point key");
  const header = [asBytes(args.alpha_g1, 64, "alpha"), ...["beta_g2", "gamma_g2", "delta_g2"].map(k => asBytes(args[k], 128, k))];
  const points = args.ic.map((p, index) => asBytes(p, 64, `IC ${index}`));
  if (points.some(point => point.every(byte => byte === 0))) throw new Error("IC points must be nonzero");
  const circuit = digest(Buffer.from("TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0"), circuitSource, Buffer.from("circomlib-poseidon-bn254-v1"));
  const key = digest(Buffer.from("TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0"), ...header, ...points);
  if (!circuit.equals(asBytes(args.circuit_commitment, 32, "circuit commitment")) || !key.equals(asBytes(args.verifying_key_commitment, 32, "key commitment"))) throw new Error("Exported key/circuit commitment does not match current source and key bytes");
  return { circuit, key, header, points };
}

export function buildVerifierInstructions(authority, material) {
  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: ADDRESSES.mother, isSigner: false, isWritable: false },
    { pubkey: ADDRESSES.verifier, isSigner: false, isWritable: true },
  ];
  const instructions = [new TransactionInstruction({ programId: GPRU, keys: [...keys, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data: Buffer.concat([discriminator("initialize_hidden_head_verifier_v1"), material.circuit, material.key, ...material.header]) })];
  for (let start = 0; start < 13; start += 4) {
    const points = material.points.slice(start, start + 4);
    const count = Buffer.alloc(4); count.writeUInt32LE(points.length);
    instructions.push(new TransactionInstruction({ programId: GPRU, keys, data: Buffer.concat([discriminator("write_hidden_head_verifier_ic_v1"), Buffer.from([start]), count, ...points]) }));
  }
  instructions.push(new TransactionInstruction({ programId: GPRU, keys, data: discriminator("enable_hidden_head_verifier_v1") }));
  return instructions;
}

export function buildRootActivation(authority) {
  return new TransactionInstruction({ programId: TCAP, keys: [
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: ADDRESSES.config, isSigner: false, isWritable: false },
    { pubkey: ADDRESSES.root, isSigner: false, isWritable: true },
  ], data: discriminator("activate_commitment_root_v1") });
}

export function decodeAccount(info, owner, name, size) {
  if (!info || !info.owner.equals(owner) || info.data.length !== size || !info.data.subarray(0, 8).equals(accountDiscriminator(name))) throw new Error(`Missing or invalid ${name} account`);
  return info.data;
}

export function decodeRoot(info) {
  const data = decodeAccount(info, TCAP, "TcapCommitmentRootStateV1", 124);
  if (data.readUInt16LE(8) !== 1) throw new Error("Unsupported TCAP root version");
  return { currentRoot: data.subarray(12, 44).toString("hex"), previousRoot: data.subarray(44, 76).toString("hex"), sequence: data.readBigUInt64LE(80).toString(), paused: data[122] !== 0 };
}

function assertVerifierMatches(info, material, authority) {
  const data = decodeAccount(info, GPRU, "GpruHiddenHeadVerifierV1", 1388);
  if (data.readUInt16LE(8) !== 1 || !data.subarray(10, 42).equals(authority.toBuffer()) || !data.subarray(42, 74).equals(material.circuit) || !data.subarray(74, 106).equals(material.key) || !data.subarray(108, 556).equals(Buffer.concat(material.header))) throw new Error("Existing verifier authority/header/commitments differ; refusing to overwrite it");
  if (data[106] !== 0 && !data.subarray(556).equals(Buffer.concat(material.points))) throw new Error("Enabled verifier key differs from exported key");
  return data[106] !== 0;
}

function options(argv) {
  const selected = { command: argv[0] ?? "status", send: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--send") selected.send = true;
    else if (["--rpc", "--wallet", "--args"].includes(argv[i]) && argv[i + 1]) selected[argv[i++].slice(2)] = argv[i];
    else throw new Error(`Unknown or missing option: ${argv[i]}`);
  }
  if (!["status", "init-verifier", "activate-root"].includes(selected.command)) throw new Error("Usage: hidden-head-setup.mjs status|init-verifier|activate-root [--rpc URL] [--wallet KEYPAIR] [--args FILE] [--send]");
  return selected;
}

export async function main(argv) {
  const selected = options(argv);
  const rpc = selected.rpc ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  try {
    if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("This setup command requires Solana Devnet");
    const read = await connection.getMultipleAccountsInfoAndContext(Object.values(ADDRESSES), "confirmed");
    const [motherInfo, configInfo, rootInfo, verifierInfo] = read.value;
    if (!motherInfo || !motherInfo.owner.equals(TSNP) || motherInfo.data.length < 40 || !motherInfo.data.subarray(0, 8).equals(accountDiscriminator("MotherEscrow"))) throw new Error("Missing or invalid Mother Escrow");
    const mother = new PublicKey(motherInfo.data.subarray(8, 40));
    const config = decodeAccount(configInfo, TCAP, "TcapGlobalConfigV1", 276);
    const governance = new PublicKey(config.subarray(14, 46));
    if (!config.subarray(208, 240).equals(ADDRESSES.root.toBuffer())) throw new Error("TCAP config does not bind the canonical root");
    const root = decodeRoot(rootInfo);
    if (verifierInfo) decodeAccount(verifierInfo, GPRU, "GpruHiddenHeadVerifierV1", 1388);
    const summary = { checkedAt: new Date().toISOString(), slot: read.context.slot, rpc: new URL(rpc).origin, motherAuthority: mother.toBase58(), governanceAuthority: governance.toBase58(), accounts: Object.fromEntries(Object.entries(ADDRESSES).map(([name, key]) => [name, key.toBase58()])), config: { version: config.readUInt16LE(8), paused: config[207] !== 0, proofVerifierProgram: new PublicKey(config.subarray(174, 206)).toBase58(), proofVerifierEnabled: config[206] !== 0 }, root, verifier: { exists: !!verifierInfo, bytes: verifierInfo?.data.length ?? 0, enabled: verifierInfo ? verifierInfo.data[106] === 1 : false } };
    console.log(JSON.stringify(summary, null, 2));
    if (selected.command === "status") return summary;
    let instructions;
    let requiredAuthority;
    let material;
    if (selected.command === "activate-root") {
      if (!root.paused) { console.log("Root is already active; no transaction needed."); return; }
      if (root.sequence !== "0") throw new Error("Refusing first-use activation of a root with existing transitions");
      requiredAuthority = governance;
      instructions = [buildRootActivation(governance)];
    } else {
      requiredAuthority = mother;
      const argsPath = path.resolve(selected.args ?? path.join(ROOT, "tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev/verifier-init-args.json"));
      material = validateKeyArgs(JSON.parse(fs.readFileSync(argsPath, "utf8")), fs.readFileSync(path.join(ROOT, "tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom")));
      if (verifierInfo && assertVerifierMatches(verifierInfo, material, mother)) { console.log("Verifier is enabled with the exact exported key; no transaction needed."); return; }
      instructions = buildVerifierInstructions(mother, material);
      if (verifierInfo) instructions.shift(); // Resume the matching disabled setup.
    }
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const sizes = instructions.map(ix => new Transaction({ feePayer: requiredAuthority, recentBlockhash: blockhash }).add(ix).serialize({ requireAllSignatures: false, verifySignatures: false }).length);
    if (sizes.some(size => size > 1232)) throw new Error("Setup transaction exceeds Solana packet limit");
    console.log(JSON.stringify({ mode: selected.send ? "SEND" : "READ-ONLY PLAN", command: selected.command, authority: requiredAuthority.toBase58(), transactions: instructions.length, packetBytes: sizes }));
    if (!selected.send) { console.log("Plan only. Add --send with the matching authority keypair to execute."); return; }
    const configured = selected.wallet ?? process.env.GPRU_AUTHORITY_KEYPAIR ?? process.env.SOLANA_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
    const walletPath = configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
    const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
    if (!signer.publicKey.equals(requiredAuthority)) throw new Error(`Wrong authority keypair: expected ${requiredAuthority.toBase58()}, supplied ${signer.publicKey.toBase58()}`);
    for (let index = 0; index < instructions.length; index++) {
      const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instructions[index]), [signer], { commitment: "confirmed" });
      console.log(JSON.stringify({ transaction: index + 1, signature }));
    }
    const finalInfo = await connection.getAccountInfo(selected.command === "activate-root" ? ADDRESSES.root : ADDRESSES.verifier, "confirmed");
    if (material) {
      if (!assertVerifierMatches(finalInfo, material, requiredAuthority)) throw new Error("Verifier still disabled after setup");
      console.log("CONFIRMED: GPRU verifier enabled with the exact circuit/key commitments and all thirteen IC points.");
    } else {
      const finalRoot = decodeRoot(finalInfo);
      if (finalRoot.paused || finalRoot.sequence !== "0" || finalRoot.currentRoot !== finalRoot.previousRoot || /^0+$/.test(finalRoot.currentRoot)) throw new Error("Root activation result failed validation");
      console.log(JSON.stringify({ result: "CONFIRMED: TCAP root active", ...finalRoot }));
    }
  } catch (error) {
    throw new Error(String(error?.message ?? error).replaceAll(rpc, new URL(rpc).origin));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
