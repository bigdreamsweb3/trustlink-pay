import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { poseidon5 } from "poseidon-lite/poseidon5";
import nacl from "tweetnacl";
import { deriveGpruTransactionRecordKeyV1, GpruMemoAuthenticationErrorV1 } from "./transaction-record.js";
import { deriveGpruBalanceScanKeyV1, decryptBalanceBlindingDeltaV1, isValidBabyJubPointV1, type BabyJubPointV1 } from "./babyjub-delta-cipher.js";
import { GPRU_TIN_DEBIT_FIELD_V1 as FIELD, GPRU_TIN_DEBIT_SUBORDER_V1 as ORDER,
  deriveGpruTinDebitAmountCommitmentV1, tinDebitDecimalV1, tinDebitHexV1, type GpruTinDebitOwnerOpeningV1 } from "./tin-debit-opening.js";
import { decodeGpruTinDebitMemoBytesV1, validateGpruTinDebitPublicInputsV1, createGpruTinDebitMemoInstructionV1 } from "../tcap-gpru-tin-debit.js";
import { PublicKey } from "@solana/web3.js";

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_BALANCE = (1n << 128n) - 1n;
const BASE: BabyJubPointV1 = { x: 5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  y: 16950150798460657717958625567821834550301663161624707787222815936182638968203n };
const H: BabyJubPointV1 = { x: 9398968040714586016327675940839568983565095581299035530848626576251201023018n,
  y: 15860466305030097496204584978173195991965382154782248789896917824218270823860n };
const fieldHex = (value: bigint) => value.toString(16).padStart(64, "0");
const mod = (value: bigint) => ((value % FIELD) + FIELD) % FIELD;
function inverse(value: bigint): bigint {
  let exponent = FIELD - 2n, base = mod(value), result = 1n;
  while (exponent) { if (exponent & 1n) result = mod(result * base); base = mod(base * base); exponent >>= 1n; }
  return result;
}
function add(left: BabyJubPointV1, right: BabyJubPointV1): BabyJubPointV1 {
  const product = mod(left.x * right.x * left.y * right.y);
  return { x: mod((left.x * right.y + left.y * right.x) * inverse(1n + 168696n * product)),
    y: mod((left.y * right.y - 168700n * left.x * right.x) * inverse(1n - 168696n * product)) };
}
function multiply(point: BabyJubPointV1, scalar: bigint): BabyJubPointV1 {
  let result = { x: 0n, y: 1n }, base = point, number = scalar;
  while (number) { if (number & 1n) result = add(result, base); base = add(base, base); number >>= 1n; }
  return result;
}

/** TCAP point encoding; transfer openings allow u128 accumulated balances and the empty identity. */
export function deriveGpruTinDebitBalancePointV1(balance: string, blinding: string): BabyJubPointV1 {
  return add(multiply(BASE, tinDebitDecimalV1(balance, "Transfer balance", MAX_BALANCE)),
    multiply(H, tinDebitDecimalV1(blinding, "Transfer balance blinding", ORDER - 1n)));
}

export type GpruTinDebitMemoBindingV1 = {
  leg: 0 | 1; successorPortfolioRoot: string; successorBalancePoint: { x: string; y: string };
  actionCommitment: string; encryptedBlindingDelta: string; deltaEphemeralPublicKey: { x: string; y: string };
};
export type GpruTinDebitOwnerRecordV1 = {
  version: 1; recordType: "tsn-gpru-tin-debit-action-v1"; actionKind: 4; leg: 0 | 1;
  sequence: string; previousMemoCommitment: string; actionCommitment: string; authorizationCommitment: string;
  nullifier: string; tokenId: number; amountBaseUnits: string; amountCommitment: string; amountBlinding: string;
};
const RECORD_FIELDS = ["version", "recordType", "actionKind", "leg", "sequence", "previousMemoCommitment", "actionCommitment", "authorizationCommitment", "nullifier", "tokenId", "amountBaseUnits", "amountCommitment", "amountBlinding"];

export function parseGpruTinDebitMemoBindingV1(memoPayload: string): GpruTinDebitMemoBindingV1 {
  const bytes = decodeGpruTinDebitMemoBytesV1(memoPayload);
  const at = (offset: number) => tinDebitHexV1(bytesToHex(bytes.subarray(offset, offset + 32)), "Transfer Memo field");
  const binding = { leg: bytes[1] as 0 | 1, successorPortfolioRoot: at(2), successorBalancePoint: { x: at(34), y: at(66) },
    actionCommitment: at(98), encryptedBlindingDelta: at(130), deltaEphemeralPublicKey: { x: at(162), y: at(194) } };
  if (BigInt(`0x${binding.encryptedBlindingDelta}`) >= ORDER
      || !isValidBabyJubPointV1({ x: BigInt(`0x${binding.deltaEphemeralPublicKey.x}`), y: BigInt(`0x${binding.deltaEphemeralPublicKey.y}`) })
      || !(BigInt(`0x${binding.successorBalancePoint.x}`) === 0n && BigInt(`0x${binding.successorBalancePoint.y}`) === 1n)
        && !isValidBabyJubPointV1({ x: BigInt(`0x${binding.successorBalancePoint.x}`), y: BigInt(`0x${binding.successorBalancePoint.y}`) })) throw new Error("Transfer Memo point or delta cipher is invalid");
  return binding;
}

export function validateGpruTinDebitOwnerRecordV1(value: unknown): GpruTinDebitOwnerRecordV1 {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join("|") !== [...RECORD_FIELDS].sort().join("|")) throw new Error("Transfer owner record has an unsupported field set");
  const record = value as GpruTinDebitOwnerRecordV1;
  if (record.version !== 1 || record.recordType !== "tsn-gpru-tin-debit-action-v1" || record.actionKind !== 4 || (record.leg !== 0 && record.leg !== 1)) throw new Error("Unsupported transfer owner record");
  if (!Number.isInteger(record.tokenId) || record.tokenId <= 0 || record.tokenId > 0xffff_ffff) throw new Error("Transfer record token ID must be a positive u32");
  const sequence = tinDebitDecimalV1(record.sequence, "Transfer owner sequence", MAX_U64, true);
  tinDebitDecimalV1(record.amountBaseUnits, "Transfer amount", MAX_U64, true);
  tinDebitDecimalV1(record.amountBlinding, "Transfer amount blinding", FIELD - 1n, true);
  tinDebitHexV1(record.previousMemoCommitment, "Transfer predecessor Memo");
  for (const key of ["actionCommitment", "authorizationCommitment", "nullifier", "amountCommitment"] as const) tinDebitHexV1(record[key], key, true, true);
  if ((sequence === 1n) !== (record.previousMemoCommitment === "0".repeat(64))) throw new Error("Transfer record sequence and predecessor Memo disagree");
  if (deriveGpruTinDebitAmountCommitmentV1(record.tokenId, record.amountBaseUnits, record.amountBlinding, record.nullifier) !== record.amountCommitment) throw new Error("Transfer private amount opening differs from its commitment");
  if (fieldHex(poseidon5([4n, BigInt(record.tokenId), BigInt(`0x${record.amountCommitment}`), BigInt(`0x${record.authorizationCommitment}`), BigInt(`0x${record.nullifier}`)])) !== record.actionCommitment) throw new Error("Transfer private action commitment differs from its statement");
  return { ...record };
}

function verifiedProjection(publicInputs: readonly string[]): string[] {
  return validateGpruTinDebitPublicInputsV1(publicInputs);
}

function decryptRecord(params: {
  memoPayload: string; masterSeed: Uint8Array; gpruElgamalPublicKey: Uint8Array;
  gpruBalanceScanPublicKeyX: Uint8Array; gpruBalanceScanPublicKeyY: Uint8Array;
}, binding: GpruTinDebitMemoBindingV1, inputs: readonly string[]): { record: GpruTinDebitOwnerRecordV1; delta: bigint } {
  const bytes = decodeGpruTinDebitMemoBytesV1(params.memoPayload);
  const key = deriveGpruTransactionRecordKeyV1({ ...params, dna: bytes.subarray(226, 258), recordEphemeralPublicKey: bytes.subarray(258, 290) });
  try {
    const authenticated = nacl.secretbox.open(bytes.subarray(314, 416), bytes.subarray(290, 314), key);
    if (authenticated === null) throw new GpruMemoAuthenticationErrorV1();
    let record: GpruTinDebitOwnerRecordV1;
    try {
      if (authenticated.length !== 86 || authenticated[0] !== 1 || authenticated[1] !== binding.leg) throw new Error("Transfer owner record binary framing is invalid");
      const view = new DataView(authenticated.buffer, authenticated.byteOffset, authenticated.byteLength);
      record = validateGpruTinDebitOwnerRecordV1({ version: 1, recordType: "tsn-gpru-tin-debit-action-v1", actionKind: 4,
        leg: authenticated[1], sequence: view.getBigUint64(2, true).toString(), previousMemoCommitment: bytesToHex(authenticated.subarray(10, 42)),
        tokenId: view.getUint32(42, true), amountBaseUnits: view.getBigUint64(46, true).toString(), amountBlinding: BigInt(`0x${bytesToHex(authenticated.subarray(54, 86))}`).toString(),
        amountCommitment: inputs[8], authorizationCommitment: inputs[9], actionCommitment: inputs[10], nullifier: inputs[11] });
    } finally { authenticated.fill(0); }
    const scan = deriveGpruBalanceScanKeyV1(params.masterSeed);
    try {
      if (fieldHex(scan.publicKey.x) !== bytesToHex(params.gpruBalanceScanPublicKeyX) || fieldHex(scan.publicKey.y) !== bytesToHex(params.gpruBalanceScanPublicKeyY)) throw new Error("Transfer owner seed differs from the registered scan key");
      const delta = decryptBalanceBlindingDeltaV1({ encryptedDelta: BigInt(`0x${binding.encryptedBlindingDelta}`),
        ephemeralPublicKey: { x: BigInt(`0x${binding.deltaEphemeralPublicKey.x}`), y: BigInt(`0x${binding.deltaEphemeralPublicKey.y}`) }, scanSecret: scan.secret });
      if (delta === 0n) throw new Error("Transfer successor blinding delta must be nonzero");
      return { record, delta };
    } finally { scan.secret = 0n; }
  } finally { key.fill(0); }
}

/** Authenticate this owner's compact action against an already accepted statement. */
export function decryptGpruTinDebitOwnerRecordV1(params: {
  memoPayload: string; masterSeed: Uint8Array; gpruElgamalPublicKey: Uint8Array;
  gpruBalanceScanPublicKeyX: Uint8Array; gpruBalanceScanPublicKeyY: Uint8Array;
  publicInputs: readonly string[]; expectedLeg: 0 | 1;
}): { record: GpruTinDebitOwnerRecordV1; balanceBlindingDelta: string } {
  const publicInputs = verifiedProjection(params.publicInputs);
  createGpruTinDebitMemoInstructionV1({ authority: PublicKey.default, payload: params.memoPayload, publicInputs, expectedLeg: params.expectedLeg });
  const { record, delta } = decryptRecord(params, parseGpruTinDebitMemoBindingV1(params.memoPayload), publicInputs);
  return { record, balanceBlindingDelta: delta.toString() };
}

/**
 * Recover one owner's successor after the caller independently verifies this exact
 * Groth16 statement and authenticates the prior opening against its selected root.
 * This helper verifies records and arithmetic; it does not verify a proof or receipt.
 */
export function recoverGpruTinDebitOwnerOpeningV1(params: {
  memoPayload: string; masterSeed: Uint8Array; gpruElgamalPublicKey: Uint8Array;
  gpruBalanceScanPublicKeyX: Uint8Array; gpruBalanceScanPublicKeyY: Uint8Array;
  publicInputs: readonly string[]; expectedLeg: 0 | 1; priorOpening: GpruTinDebitOwnerOpeningV1;
}): GpruTinDebitOwnerOpeningV1 {
  if (params.expectedLeg !== 0 && params.expectedLeg !== 1) throw new Error("Transfer recovery requires one explicit owner leg");
  const publicHex = verifiedProjection(params.publicInputs), leg = params.expectedLeg;
  createGpruTinDebitMemoInstructionV1({ authority: PublicKey.default, payload: params.memoPayload, publicInputs: publicHex, expectedLeg: leg });
  const binding = parseGpruTinDebitMemoBindingV1(params.memoPayload);
  const memoCommitment = fieldHex(BigInt(`0x${bytesToHex(sha256(new TextEncoder().encode(params.memoPayload)))}`) % FIELD);
  if (binding.leg !== leg || memoCommitment !== publicHex[12 + leg] || binding.successorPortfolioRoot !== publicHex[14 + leg]
      || binding.successorBalancePoint.x !== publicHex[16 + leg] || binding.successorBalancePoint.y !== publicHex[18 + leg]
      || binding.actionCommitment !== publicHex[10]) throw new Error("Transfer Memo differs from its verified leg statement");
  const { record, delta } = decryptRecord(params, binding, publicHex);
  const prior = params.priorOpening;
  if (!prior || Object.keys(prior).sort().join("|") !== ["tokenId", "balance", "blinding", "sequence", "previousMemoCommitment"].sort().join("|")) throw new Error("Transfer prior opening has an unsupported field set");
  const balance = tinDebitDecimalV1(prior.balance, "Prior owner balance", MAX_BALANCE);
  const blinding = tinDebitDecimalV1(prior.blinding, "Prior owner blinding", ORDER - 1n);
  const sequence = tinDebitDecimalV1(prior.sequence, "Prior owner sequence", MAX_U64);
  tinDebitHexV1(prior.previousMemoCommitment, "Prior owner Memo");
  if ((sequence === 0n) !== (prior.previousMemoCommitment === "0".repeat(64))) throw new Error("Prior owner sequence and Memo disagree");
  if (record.leg !== leg || record.tokenId !== prior.tokenId || BigInt(record.tokenId) !== BigInt(`0x${params.publicInputs[5]!}`)
      || BigInt(record.sequence) !== sequence + 1n || record.previousMemoCommitment !== prior.previousMemoCommitment
      || record.amountCommitment !== publicHex[8] || record.authorizationCommitment !== publicHex[9]
      || record.actionCommitment !== publicHex[10] || record.nullifier !== publicHex[11]) throw new Error("Transfer owner record differs from its predecessor or verified statement");
  const nextBalance = balance + (leg === 0 ? -1n : 1n) * BigInt(record.amountBaseUnits);
  if (nextBalance < 0n || nextBalance > MAX_BALANCE) throw new Error("Transfer recovered balance is outside u128");
  const nextBlinding = (blinding + delta) % ORDER;
  const point = deriveGpruTinDebitBalancePointV1(nextBalance.toString(), nextBlinding.toString());
  if (fieldHex(point.x) !== binding.successorBalancePoint.x || fieldHex(point.y) !== binding.successorBalancePoint.y) throw new Error("Transfer recovered opening differs from the proof-bound successor point");
  return { tokenId: record.tokenId, balance: nextBalance.toString(), blinding: nextBlinding.toString(),
    sequence: record.sequence, previousMemoCommitment: memoCommitment };
}
