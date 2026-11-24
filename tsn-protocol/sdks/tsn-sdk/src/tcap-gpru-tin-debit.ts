import { Buffer } from "buffer";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { GPRU_PROGRAM_ID, GPRU_TCAP_PROGRAM_ID } from "./tcap-gpru-credit.js";
import { DEFAULT_TIP_PROGRAM_ID } from "./tins.js";
import { GPRU_TIN_DEBIT_FIELD_V1 as FIELD, GPRU_TIN_DEBIT_SUBORDER_V1 as ORDER, tinDebitHexV1 } from "./gpru/tin-debit-opening.js";
import { isValidBabyJubPointV1 } from "./gpru/babyjub-delta-cipher.js";

export const GPRU_TIN_DEBIT_PUBLIC_INPUT_COUNT_V1 = 26;
export const GPRU_TIN_DEBIT_INSTRUCTION_BYTES_V1 = 1128;
export const GPRU_TIN_DEBIT_MEMO_PREFIX_V1 = "TSN_GPRU_TIN_DEBIT_MEMO_V1:";
export const GPRU_TIN_DEBIT_MEMO_BINARY_BYTES_V1 = 416;
export const GPRU_TIN_DEBIT_MEMO_TEXT_BYTES_V1 = GPRU_TIN_DEBIT_MEMO_PREFIX_V1.length + 555;
export const GPRU_TIN_DEBIT_TSNP_PROGRAM_ID_V1 = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
export const GPRU_TIN_DEBIT_MEMO_PROGRAM_ID_V1 = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const encoder = new TextEncoder();
const u64Max = 0xffff_ffff_ffff_ffffn;
const fieldHex = (value: bigint) => value.toString(16).padStart(64, "0");
const derive = (program: PublicKey, name: string, ...seeds: Uint8Array[]) => PublicKey.findProgramAddressSync([Buffer.from(name), ...seeds], program)[0];

export type GpruTinDebitProofV1 = { publicInputs: readonly string[]; proofA: string; proofB: string; proofC: string };
export type GpruTinDebitAccountsV1 = {
  authority: PublicKey; motherEscrow: PublicKey; tcapProgram: PublicKey; tsnProgram: PublicKey;
  config: PublicKey; assetEntry: PublicKey; commitmentRoot: PublicKey; reserveState: PublicKey;
  authorizationSigner: PublicKey; tipRouteRoot: PublicKey; tinDebitVerifier: PublicKey;
  instructions: PublicKey; gpruProgram: PublicKey; tipProgram: PublicKey;
};

/** The transfer circuit has its own key and exact BE32 public statement. */
export function validateGpruTinDebitPublicInputsV1(inputs: readonly string[]): string[] {
  if (!Array.isArray(inputs) || inputs.length !== GPRU_TIN_DEBIT_PUBLIC_INPUT_COUNT_V1) throw new Error("TIN_DEBIT_PROOF_REQUIRES_26_INPUTS");
  const values = inputs.map((value, index) => BigInt(`0x${tinDebitHexV1(value, `Transfer input ${index}`)}`));
  if ([0, 1, 2, 4, 8, 9, 10, 11, 12, 13, 14, 15].some(index => values[index] === 0n)
      || values[0] === values[1] || values[3]! >= u64Max || values[5] === 0n || values[5]! > 0xffff_ffffn
      || values[6]! > u64Max || values[7]! > u64Max || values[6]! > values[7]!) throw new Error("TIN_DEBIT_PUBLIC_STATEMENT_INVALID");
  for (const leg of [0, 1]) {
    if (!(values[16 + leg] === 0n && values[18 + leg] === 1n) && !isValidBabyJubPointV1({ x: values[16 + leg]!, y: values[18 + leg]! })
        || values[20 + leg]! >= ORDER
        || !isValidBabyJubPointV1({ x: values[22 + leg]!, y: values[24 + leg]! })) throw new Error("TIN_DEBIT_PUBLIC_CIPHER_INVALID");
  }
  return [...inputs];
}

function contextBytes(accounts: GpruTinDebitAccountsV1): Uint8Array {
  return Buffer.concat([accounts.tsnProgram, accounts.tcapProgram, accounts.gpruProgram, accounts.tipProgram,
    accounts.commitmentRoot, accounts.assetEntry, accounts.reserveState, accounts.tipRouteRoot, accounts.tinDebitVerifier].map(key => key.toBuffer()));
}

export function deriveGpruTinDebitDeploymentCommitmentV1(accounts: GpruTinDebitAccountsV1): string {
  return fieldHex(BigInt(`0x${bytesToHex(sha256(Buffer.concat([Buffer.from("TSN_GPRU_TCAP_TIN_DEBIT_CONTEXT_V1\0"), contextBytes(accounts)])))}`) % FIELD);
}

/** This SHA digest authorizes TSNP CPI; public input 9 remains the owner's Poseidon commitment. */
export function deriveGpruTinDebitAuthorizationDigestV1(accounts: GpruTinDebitAccountsV1, inputs: readonly string[]): string {
  return bytesToHex(sha256(Buffer.concat([Buffer.from("TSN_GPRU_TIN_DEBIT_AUTHORIZATION_V1\0"), contextBytes(accounts),
    ...validateGpruTinDebitPublicInputsV1(inputs).map(value => Buffer.from(value, "hex"))])));
}

export function deriveGpruTinDebitAccountsV1(params: {
  authority: PublicKey; assetEntry: PublicKey; authorizationDigest: string;
  tcapProgram?: PublicKey; tsnProgram?: PublicKey; gpruProgram?: PublicKey; tipProgram?: PublicKey;
}): GpruTinDebitAccountsV1 {
  const tcapProgram = params.tcapProgram ?? GPRU_TCAP_PROGRAM_ID, tsnProgram = params.tsnProgram ?? GPRU_TIN_DEBIT_TSNP_PROGRAM_ID_V1;
  const gpruProgram = params.gpruProgram ?? GPRU_PROGRAM_ID, tipProgram = params.tipProgram ?? new PublicKey(DEFAULT_TIP_PROGRAM_ID);
  return { authority: params.authority, assetEntry: params.assetEntry, tcapProgram, tsnProgram, gpruProgram, tipProgram,
    motherEscrow: derive(tsnProgram, "tsn_mother_escrow"), config: derive(tcapProgram, "tcap:global-config:v1"),
    commitmentRoot: derive(tcapProgram, "tcap:commitment-root:v1"), reserveState: derive(tcapProgram, "tcap:reserve-state:v1", params.assetEntry.toBytes()),
    authorizationSigner: derive(tsnProgram, "tsn:tcap-authorization:v1", hexToBytes(tinDebitHexV1(params.authorizationDigest, "Transfer digest", false))),
    tipRouteRoot: derive(tipProgram, "tip:route-merkle-root:v1"), tinDebitVerifier: derive(gpruProgram, "gpru:tin-debit-verifier:v1"),
    instructions: SYSVAR_INSTRUCTIONS_PUBKEY };
}

export function buildTsnRegisterTcapTinDebitAuthorizationV1Instruction(fields: {
  accounts: GpruTinDebitAccountsV1; authorizationDigest: string; proof: GpruTinDebitProofV1;
}): TransactionInstruction {
  const inputs = validateGpruTinDebitPublicInputsV1(fields.proof.publicInputs);
  const canonical = deriveGpruTinDebitAccountsV1({ ...fields.accounts, authorizationDigest: fields.authorizationDigest });
  if (Object.keys(canonical).some(name => !canonical[name as keyof GpruTinDebitAccountsV1].equals(fields.accounts[name as keyof GpruTinDebitAccountsV1]))) throw new Error("TIN_DEBIT_ACCOUNT_NOT_CANONICAL");
  if (inputs[4] !== deriveGpruTinDebitDeploymentCommitmentV1(fields.accounts)
      || deriveGpruTinDebitAuthorizationDigestV1(fields.accounts, inputs) !== fields.authorizationDigest) throw new Error("TIN_DEBIT_CONTEXT_OR_DIGEST_MISMATCH");
  const proofBytes = (["proofA", "proofB", "proofC"] as const).map((key, index) => {
    const value = fields.proof[key], size = [64, 128, 64][index]!;
    if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${size * 2}}$`).test(value)) throw new Error(`TIN_DEBIT_${key}_INVALID`);
    return Buffer.from(value, "hex");
  });
  const names = ["authority", "motherEscrow", "tcapProgram", "tsnProgram", "config", "assetEntry", "commitmentRoot", "reserveState", "authorizationSigner", "tipRouteRoot", "tinDebitVerifier", "instructions", "gpruProgram"] as const;
  const data = Buffer.concat([Buffer.from(sha256(encoder.encode("global:tsn_register_tcap_tin_debit_authorization_v1")).subarray(0, 8)),
    Buffer.from(tinDebitHexV1(fields.authorizationDigest, "Transfer digest", false), "hex"), ...inputs.map(value => Buffer.from(value, "hex")), ...proofBytes]);
  if (data.length !== GPRU_TIN_DEBIT_INSTRUCTION_BYTES_V1) throw new Error("TIN_DEBIT_INSTRUCTION_SIZE_MISMATCH");
  return new TransactionInstruction({ programId: fields.accounts.tsnProgram, data,
    keys: names.map(name => ({ pubkey: fields.accounts[name], isSigner: name === "authority", isWritable: name === "commitmentRoot" })) });
}

/** Strict compact framing is checked before record authentication. */
export function decodeGpruTinDebitMemoBytesV1(payload: string): Uint8Array {
  if (typeof payload !== "string" || payload.length !== GPRU_TIN_DEBIT_MEMO_TEXT_BYTES_V1 || !payload.startsWith(GPRU_TIN_DEBIT_MEMO_PREFIX_V1)) throw new Error("TIN_DEBIT_MEMO_LENGTH_OR_PREFIX_INVALID");
  const encoded = payload.slice(GPRU_TIN_DEBIT_MEMO_PREFIX_V1.length);
  if (!/^[A-Za-z0-9_-]{555}$/.test(encoded)) throw new Error("TIN_DEBIT_MEMO_BASE64URL_INVALID");
  const binary = Buffer.from(encoded, "base64url");
  if (binary.length !== 416 || binary.toString("base64url") !== encoded || binary[0] !== 1 || (binary[1] !== 0 && binary[1] !== 1)) throw new Error("TIN_DEBIT_MEMO_ENCODING_INVALID");
  return Uint8Array.from(binary);
}

export function createGpruTinDebitMemoInstructionV1(params: { authority: PublicKey; payload: string; publicInputs: readonly string[]; expectedLeg: 0 | 1 }): TransactionInstruction {
  const bytes = decodeGpruTinDebitMemoBytesV1(params.payload), leg = params.expectedLeg;
  const inputs = validateGpruTinDebitPublicInputsV1(params.publicInputs);
  const at = (offset: number) => bytesToHex(bytes.subarray(offset, offset + 32));
  const memoHash = fieldHex(BigInt(`0x${bytesToHex(sha256(encoder.encode(params.payload)))}`) % FIELD);
  if (bytes[1] !== leg || memoHash !== inputs[12 + leg] || at(2) !== inputs[14 + leg] || at(34) !== inputs[16 + leg]
      || at(66) !== inputs[18 + leg] || at(98) !== inputs[10] || at(130) !== inputs[20 + leg]
      || at(162) !== inputs[22 + leg] || at(194) !== inputs[24 + leg]) throw new Error("TIN_DEBIT_MEMO_STATEMENT_MISMATCH");
  return new TransactionInstruction({ programId: GPRU_TIN_DEBIT_MEMO_PROGRAM_ID_V1, data: Buffer.from(params.payload, "ascii"),
    keys: [{ pubkey: params.authority, isSigner: true, isWritable: false }] });
}
