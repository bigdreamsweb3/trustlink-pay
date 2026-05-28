import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const DEFAULT_TINS_PROGRAM_ID = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
export const TINS_PROGRAM_SALT = "TINS_SALT_2026";

const TINS_GLOBAL_STATE_SEED = Buffer.from("global-state");
const TINS_IDENTITY_SEED = Buffer.from("identity");
const TINS_REGISTRY_SEED = Buffer.from("registry");

function getTinsProgramPublicKey(programId?: PublicKey | string | null) {
  return programId instanceof PublicKey ? programId : new PublicKey(programId ?? DEFAULT_TINS_PROGRAM_ID);
}

export function getTinsIdentitySeed(walletPubkey: PublicKey): Buffer {
  return Buffer.from(sha256(Buffer.concat([walletPubkey.toBuffer(), Buffer.from(TINS_PROGRAM_SALT, "utf8")])));
}

export function getTinsGlobalStatePda(programId?: PublicKey | string | null): PublicKey {
  return PublicKey.findProgramAddressSync([TINS_GLOBAL_STATE_SEED], getTinsProgramPublicKey(programId))[0];
}

export function getTinsIdentityPda(params: {
  walletPubkey: PublicKey;
  programId?: PublicKey | string | null;
}): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TINS_IDENTITY_SEED, getTinsIdentitySeed(params.walletPubkey)],
    getTinsProgramPublicKey(params.programId),
  )[0];
}

export function getTinsRegistryPda(params: {
  tin: bigint | number | string;
  programId?: PublicKey | string | null;
}): PublicKey {
  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(BigInt(params.tin));
  return PublicKey.findProgramAddressSync([TINS_REGISTRY_SEED, tinBuffer], getTinsProgramPublicKey(params.programId))[0];
}

export function buildCreateTinInstruction(params: {
  payer: PublicKey;
  identity: PublicKey;
  displayName: string;
  encryptedPhone: Uint8Array;
  programId?: PublicKey | string | null;
}) {
  const name = Buffer.from(params.displayName, "utf8");
  const encryptedPhone = Buffer.from(params.encryptedPhone);
  const data = Buffer.alloc(1 + 4 + name.length + 4 + encryptedPhone.length);
  let offset = 0;
  data.writeUInt8(4, offset);
  offset += 1;
  data.writeUInt32LE(name.length, offset);
  offset += 4;
  name.copy(data, offset);
  offset += name.length;
  data.writeUInt32LE(encryptedPhone.length, offset);
  offset += 4;
  encryptedPhone.copy(data, offset);

  const program = getTinsProgramPublicKey(params.programId);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: getTinsGlobalStatePda(program), isSigner: false, isWritable: true },
      { pubkey: params.identity, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function decodeTinAccount(data: Uint8Array) {
  const buffer = Buffer.from(data);
  let offset = 0;
  const tin = buffer.readBigUInt64LE(offset);
  offset += 8;
  const displayNameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const displayName = buffer.subarray(offset, offset + displayNameLength).toString("utf8");
  offset += displayNameLength;
  const identityPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  const encryptedPhoneLength = buffer.readUInt32LE(offset);
  offset += 4;
  const encryptedPhone = buffer.subarray(offset, offset + encryptedPhoneLength);
  offset += encryptedPhoneLength;
  const createdAt = buffer.readBigInt64LE(offset);

  return {
    tin,
    displayName,
    identityPubkey,
    encryptedPhone,
    createdAt,
  };
}
