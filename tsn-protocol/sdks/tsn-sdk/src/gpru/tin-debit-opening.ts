import { poseidon5 } from "poseidon-lite/poseidon5";
import { poseidon3 } from "poseidon-lite/poseidon3";
import { poseidon2 } from "poseidon-lite/poseidon2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import type { TinBalanceWallet } from "../tin-owner-balance.js";

export const GPRU_TIN_DEBIT_FIELD_V1 = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const GPRU_TIN_DEBIT_SUBORDER_V1 = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_BALANCE = (1n << 128n) - 1n;
const encoder = new TextEncoder();
const domain = (value: string) => BigInt(`0x${bytesToHex(encoder.encode(value))}`);
const fieldHex = (value: bigint) => value.toString(16).padStart(64, "0");

export function tinDebitDecimalV1(value: unknown, label: string, maximum: bigint, positive = false): bigint {
  if (typeof value !== "string" || value.length > 78 || /[\r\n]/.test(value) || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical decimal string`);
  const result = BigInt(value);
  if (result < (positive ? 1n : 0n) || result > maximum) throw new Error(`${label} is outside its unsigned range`);
  return result;
}

export function tinDebitHexV1(value: unknown, label: string, field = true, positive = false): string {
  if (typeof value !== "string" || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be canonical lowercase 32-byte hex`);
  const number = BigInt(`0x${value}`);
  if ((field && number >= GPRU_TIN_DEBIT_FIELD_V1) || (positive && number === 0n)) throw new Error(`${label} is outside its field range`);
  return value;
}

function token(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > 0xffff_ffff) throw new Error("Transfer token ID must be a positive u32");
  return Number(value);
}

/** Matches the offline core's TSN_TIN_DEBIT_VALUE_V1 commitment, using base units. */
export function deriveGpruTinDebitAmountCommitmentV1(tokenId: number, amountBaseUnits: string, amountBlinding: string, nullifier: string): string {
  return fieldHex(poseidon5([domain("TSN_TIN_DEBIT_VALUE_V1"), BigInt(token(tokenId)),
    tinDebitDecimalV1(amountBaseUnits, "Transfer amount", MAX_U64, true),
    tinDebitDecimalV1(amountBlinding, "Transfer amount blinding", GPRU_TIN_DEBIT_FIELD_V1 - 1n, true),
    BigInt(`0x${tinDebitHexV1(nullifier, "Transfer nullifier", true, true)}`)]));
}

/** Build the exact private-transfer commitments before owner approval; no transaction is built. */
export function deriveGpruTinDebitCommitmentsV1(params: {
  senderRouteKeyCommitment: string; recipientRouteKeyCommitment: string; tokenId: number;
  amountBaseUnits: string; nonce: string; amountBlinding: string; deploymentCommitment: string;
  validAfterSlot: string; expiresAtSlot: string;
}): { nullifier: string; amountCommitment: string; authorizationCommitment: string; actionCommitment: string } {
  const sender = BigInt(`0x${tinDebitHexV1(params.senderRouteKeyCommitment, "Sender route key", false, true)}`) % GPRU_TIN_DEBIT_FIELD_V1;
  const recipient = BigInt(`0x${tinDebitHexV1(params.recipientRouteKeyCommitment, "Recipient route key", false, true)}`) % GPRU_TIN_DEBIT_FIELD_V1;
  if (sender === 0n || recipient === 0n || sender % (1n << 128n) === recipient % (1n << 128n)) throw new Error("Transfer requires two distinct hidden-head indices");
  const nonce = tinDebitDecimalV1(params.nonce, "Transfer nonce", GPRU_TIN_DEBIT_FIELD_V1 - 1n, true);
  const after = tinDebitDecimalV1(params.validAfterSlot, "Transfer valid-after slot", MAX_U64);
  const expires = tinDebitDecimalV1(params.expiresAtSlot, "Transfer expiry slot", MAX_U64);
  if (after > expires) throw new Error("Transfer authorization interval is reversed");
  return tinDebitCommitments(params, sender, recipient, nonce, after, expires);
}

function tinDebitCommitments(params: Parameters<typeof deriveGpruTinDebitCommitmentsV1>[0], sender: bigint, recipient: bigint, nonce: bigint, after: bigint, expires: bigint) {
  const nullifier = fieldHex(poseidon3([domain("TSN_TIN_DEBIT_NULLIFIER_V1"), sender, nonce]));
  const amountCommitment = deriveGpruTinDebitAmountCommitmentV1(params.tokenId, params.amountBaseUnits, params.amountBlinding, nullifier);
  const context = poseidon5([domain("TSN_TIN_DEBIT_CONTEXT_V1"),
    BigInt(`0x${tinDebitHexV1(params.deploymentCommitment, "Transfer deployment", true, true)}`), BigInt(token(params.tokenId)), after, expires]);
  const authorizationCommitment = fieldHex(poseidon5([domain("TSN_TIN_DEBIT_AUTH_V1"), sender, recipient,
    BigInt(`0x${amountCommitment}`), poseidon2([context, nonce])]));
  const actionCommitment = fieldHex(poseidon5([4n, BigInt(params.tokenId), BigInt(`0x${amountCommitment}`), BigInt(`0x${authorizationCommitment}`), BigInt(`0x${nullifier}`)]));
  const result = { nullifier, amountCommitment, authorizationCommitment, actionCommitment };
  if (Object.values(result).some(value => BigInt(`0x${value}`) === 0n)) throw new Error("Transfer commitment is zero");
  return result;
}

export function buildTinDebitApprovalMessageV1(authorizationCommitment: string): Uint8Array {
  return new Uint8Array([...encoder.encode("TSN_TIN_DEBIT_APPROVAL_V1\0"),
    ...hexToBytes(tinDebitHexV1(authorizationCommitment, "Transfer authorization", true, true))]);
}

/** Accumulated balances are u128; individual transfer amounts and head sequences remain u64. */
export type GpruTinDebitOwnerOpeningV1 = {
  tokenId: number; balance: string; blinding: string; sequence: string; previousMemoCommitment: string;
};
export type TinDebitOpeningPacketV1 = GpruTinDebitOwnerOpeningV1 & {
  version: 1; recordType: "tsn-gpru-tin-debit-opening-v1"; leg: 0; authorizationCommitment: string;
  routeKeyCommitment: string;
};
export type SignedTinDebitOpeningPacketV1 = TinDebitOpeningPacketV1 & { ownerPublicKey: string; signature: string };

const PACKET_FIELDS = ["version", "recordType", "leg", "authorizationCommitment", "routeKeyCommitment", "tokenId", "sequence", "previousMemoCommitment", "balance", "blinding"];
export function validateTinDebitOpeningPacketV1(value: unknown): TinDebitOpeningPacketV1 {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join("|") !== [...PACKET_FIELDS].sort().join("|")) throw new Error("Transfer opening packet has an unsupported field set");
  const packet = value as TinDebitOpeningPacketV1;
  if (packet.version !== 1 || packet.recordType !== "tsn-gpru-tin-debit-opening-v1") throw new Error("Unsupported transfer opening packet");
  if (packet.leg !== 0) throw new Error("Transfer opening consent is required only from the sender");
  token(packet.tokenId);
  tinDebitHexV1(packet.authorizationCommitment, "authorizationCommitment", true, true);
  tinDebitHexV1(packet.routeKeyCommitment, "Transfer route key", false, true);
  tinDebitHexV1(packet.previousMemoCommitment, "Previous Memo commitment");
  const sequence = tinDebitDecimalV1(packet.sequence, "Owner head sequence", MAX_U64);
  if ((sequence === 0n) !== (packet.previousMemoCommitment === "0".repeat(64))) throw new Error("Transfer owner sequence and predecessor Memo disagree");
  tinDebitDecimalV1(packet.balance, "Owner balance", MAX_BALANCE);
  tinDebitDecimalV1(packet.blinding, "Owner balance blinding", GPRU_TIN_DEBIT_SUBORDER_V1 - 1n);
  return { ...packet };
}

/** Sender consent to disclose this opening for one exact transfer statement. */
export function buildTinDebitOpeningMessageV1(value: TinDebitOpeningPacketV1): Uint8Array {
  const packet = validateTinDebitOpeningPacketV1(value);
  return encoder.encode("TSN_TIN_DEBIT_OPENING_V1\0" + [packet.leg, packet.authorizationCommitment,
    packet.routeKeyCommitment, packet.tokenId,
    packet.sequence, packet.previousMemoCommitment, packet.balance, packet.blinding].join("\n"));
}

/** Recover the sender's opening before consent; the recipient supplies no opening or approval. */
export async function signTinDebitOpeningV1(packet: TinDebitOpeningPacketV1, ownerWallet: TinBalanceWallet): Promise<SignedTinDebitOpeningPacketV1> {
  const validated = validateTinDebitOpeningPacketV1(packet);
  const owner = new PublicKey(typeof ownerWallet.publicKey === "string" ? ownerWallet.publicKey : ownerWallet.publicKey.toBase58()).toBytes();
  const message = buildTinDebitOpeningMessageV1(validated);
  let signature: Uint8Array | undefined;
  try {
    const result = await ownerWallet.signMessage(message, "utf8");
    signature = new Uint8Array("signature" in result ? result.signature : result);
    const current = new PublicKey(typeof ownerWallet.publicKey === "string" ? ownerWallet.publicKey : ownerWallet.publicKey.toBase58()).toBytes();
    if (!nacl.verify(owner, current) || signature.length !== 64 || !nacl.sign.detached.verify(message, signature, owner)) throw new Error("Transfer opening consent is not from the connected owner");
    return { ...validated, ownerPublicKey: bytesToHex(owner), signature: bytesToHex(signature) };
  } finally { message.fill(0); signature?.fill(0); }
}
