import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

export type GpruHistoryWireInstructionV1 = {
  programId: string;
  accounts: string[];
  data: Uint8Array;
  signerAccounts: string[];
  writableAccounts: string[];
};

export type GpruHistoryWireTransactionV1 = {
  signatures: string[];
  instructions: GpruHistoryWireInstructionV1[];
};

const MAX_WIRE_BYTES = 4096;
const TSNP = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function invalid(reason: string): never {
  throw new Error(`GPRU_HISTORY_INVALID_WIRE: ${reason}`);
}

function base58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let result = "";
  while (value > 0n) {
    result = ALPHABET[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

function validateHeader(required: number, readonlySigned: number, readonlyUnsigned: number, keys: string[]) {
  // The fee payer must be a writable signer. Duplicate addresses make index
  // based signer/writability projections ambiguous and are rejected by Solana.
  if (required < 1 || required > keys.length || readonlySigned >= required
      || readonlyUnsigned > keys.length - required || new Set(keys).size !== keys.length) {
    invalid("invalid account header or duplicate keys");
  }
}

function instruction(
  programIndex: number, indexes: readonly number[], data: Uint8Array,
  keys: string[], isSigner: (index: number) => boolean, isWritable: (index: number) => boolean,
): GpruHistoryWireInstructionV1 {
  if (!Number.isInteger(programIndex) || programIndex < 0 || programIndex >= keys.length
      || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= keys.length)) {
    invalid("instruction account index out of bounds");
  }
  return {
    programId: keys[programIndex],
    accounts: indexes.map(index => keys[index]),
    data: Uint8Array.from(data),
    signerAccounts: indexes.filter(isSigner).map(index => keys[index]),
    writableAccounts: indexes.filter(isWritable).map(index => keys[index]),
  };
}

function decodeNativeCredit(raw: Uint8Array): GpruHistoryWireTransactionV1 {
  if (raw.length < 42 + 2 * 64) invalid("truncated V1 envelope");
  const required = raw[1], readonlySigned = raw[2], readonlyUnsigned = raw[3];
  const message = raw.subarray(0, raw.length - 2 * 64);
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  // Only the current native credit configuration is understood: no fee/heap
  // extensions or lookup addresses; compute and loaded-account limits follow keys.
  if (required !== 2 || view.getUint32(4, true) !== 12 || message[40] !== 2) {
    invalid("unsupported V1 native credit configuration");
  }
  const count = message[41];
  if (count < required || count > 96) invalid("invalid V1 address count");
  let cursor = 42;
  const take = (size: number): Uint8Array => {
    if (size > message.length - cursor) invalid("truncated V1 message");
    const bytes = message.subarray(cursor, cursor + size);
    cursor += size;
    return bytes;
  };
  const keys = Array.from({ length: count }, () => new PublicKey(take(32)).toBase58());
  validateHeader(required, readonlySigned, readonlyUnsigned, keys);
  take(8); // Explicit u32 compute-unit and loaded-account byte limits.
  const headers = Array.from({ length: 2 }, () => {
    const bytes = take(4);
    return { program: bytes[0], count: bytes[1], size: bytes[2] | (bytes[3] << 8) };
  });
  const isSigner = (index: number) => index < required;
  const isWritable = (index: number) => index < required
    ? index < required - readonlySigned : index < keys.length - readonlyUnsigned;
  const instructions = headers.map(header => instruction(
    header.program, Array.from(take(header.count)), take(header.size), keys, isSigner, isWritable,
  ));
  if (cursor !== message.length) invalid("trailing V1 message bytes");
  if (instructions[0].programId !== TSNP || instructions[1].programId !== MEMO
      || !((instructions[0].accounts.length === 13 && instructions[0].data.length === 825)
        || (instructions[0].accounts.length === 14 && instructions[0].data.length === 857)
        || (instructions[0].accounts.length === 16 && instructions[0].data.length === 905))
      || instructions[1].accounts.length !== 1
      || instructions[1].accounts[0] !== keys[0]) {
    invalid("unsupported V1 native credit instructions");
  }
  const signatures = Array.from({ length: required }, (_, index) => {
    const signature = raw.subarray(message.length + index * 64, message.length + (index + 1) * 64);
    if (!nacl.sign.detached.verify(message, signature, new PublicKey(keys[index]).toBytes())) {
      invalid("invalid V1 signature");
    }
    return base58(signature);
  });
  return { signatures, instructions };
}

/** Decode public transaction bytes. This does not establish finality or credit validity. */
export function decodeGpruHistoryTransactionV1(raw: Uint8Array): GpruHistoryWireTransactionV1 {
  if (!(raw instanceof Uint8Array) || raw.length === 0 || raw.length > MAX_WIRE_BYTES) {
    invalid("transaction size out of bounds");
  }
  if (raw[0] === 0x81) return decodeNativeCredit(raw);

  // Legacy and v0 are still present in the shared root's account history.
  // Roundtrip equality rejects trailing junk and noncanonical compact lengths.
  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(raw);
    const canonical = transaction.serialize();
    if (canonical.length !== raw.length || canonical.some((byte, index) => byte !== raw[index])) {
      invalid("noncanonical legacy/v0 frame");
    }
  } catch {
    invalid("unsupported or malformed legacy/v0 frame");
  }
  const message = transaction.message;
  if (message.version !== "legacy" && message.version !== 0) invalid("unsupported transaction version");
  if (message.version === 0 && message.addressTableLookups.length !== 0) {
    // Raw bytes do not contain resolved lookup-table keys. Guessing them would
    // corrupt both account bindings and writable/signer projections.
    invalid("unresolved v0 address lookup tables");
  }
  const keys = message.staticAccountKeys.map(key => key.toBase58());
  const header = message.header;
  validateHeader(header.numRequiredSignatures, header.numReadonlySignedAccounts, header.numReadonlyUnsignedAccounts, keys);
  if (transaction.signatures.length !== header.numRequiredSignatures) invalid("signature count mismatch");
  const messageBytes = message.serialize();
  transaction.signatures.forEach((signature, index) => {
    if (!nacl.sign.detached.verify(messageBytes, signature, new PublicKey(keys[index]).toBytes())) {
      invalid("invalid legacy/v0 signature");
    }
  });
  const instructions = message.compiledInstructions.map(item => instruction(
    item.programIdIndex, item.accountKeyIndexes, item.data, keys,
    index => message.isAccountSigner(index), index => message.isAccountWritable(index),
  ));
  return { signatures: transaction.signatures.map(base58), instructions };
}
