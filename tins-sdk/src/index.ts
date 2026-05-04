import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type {
  Connection as Web3Connection,
  PublicKey as Web3PublicKey,
} from "@solana/web3.js";

const requireFromCwd = createRequire(`${process.cwd()}/package.json`);
const web3 = requireFromCwd("@solana/web3.js") as typeof import("@solana/web3.js");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} = web3;

export const DEFAULT_TINS_PROGRAM_ID = new PublicKey(
  "5D2zKog251d6KPCyFyLMt3KroWwXXPWSgTPyhV22K2gR",
);

const GLOBAL_STATE_SEED = Buffer.from("global-state", "utf8");
const REGISTRY_SEED = Buffer.from("registry", "utf8");
const ESCROW_SEED = Buffer.from("escrow", "utf8");
const VAULT_SEED = Buffer.from("vault", "utf8");

export const enum TinsInstructionTag {
  InitializeProgram = 0,
  InitializeIdentity = 1,
  CreateEscrow = 2,
  ClaimEscrow = 3,
}

export type TinsProgramIdInput = PublicKey | string | undefined;

export type TinsClientConfig = {
  rpcUrl?: string;
  connection?: Web3Connection;
  programId?: Web3PublicKey | string;
};

export type GlobalStateAccount = {
  version: number;
  bump: number;
  nextSequence: bigint;
};

export type IdentityRegistryAccount = {
  version: number;
  bump: number;
  status: number;
  tin: bigint;
  authority: Web3PublicKey;
  masterPrivacy: Web3PublicKey;
  lastEscrowId: bigint;
  createdAt: bigint;
  name: string;
};

export type EscrowStateAccount = {
  version: number;
  bump: number;
  status: number;
  tin: bigint;
  escrowId: bigint;
  amount: bigint;
  payer: Web3PublicKey;
  recipientAuthority: Web3PublicKey;
  vault: Web3PublicKey;
  createdAt: bigint;
  claimedAt: bigint;
  destination: Web3PublicKey;
};

export function resolveProgramId(programId?: TinsProgramIdInput) {
  if (programId == null) {
    return DEFAULT_TINS_PROGRAM_ID;
  }
  return programId instanceof PublicKey ? programId : new PublicKey(programId);
}

export function createConnection(rpcUrl?: string) {
  return new Connection(rpcUrl ?? "http://127.0.0.1:8899", "confirmed");
}

export function getGlobalStatePda(programIdInput?: TinsProgramIdInput) {
  const programId = resolveProgramId(programIdInput);
  return PublicKey.findProgramAddressSync([GLOBAL_STATE_SEED], programId);
}

export function getRegistryPda(tin: bigint, programIdInput?: TinsProgramIdInput) {
  const programId = resolveProgramId(programIdInput);
  return PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, encodeU64(tin)],
    programId,
  );
}

export function getEscrowPda(
  tin: bigint,
  escrowId: bigint,
  programIdInput?: TinsProgramIdInput,
) {
  const programId = resolveProgramId(programIdInput);
  return PublicKey.findProgramAddressSync(
    [ESCROW_SEED, encodeU64(tin), encodeU64(escrowId)],
    programId,
  );
}

export function getVaultPda(
  tin: bigint,
  escrowId: bigint,
  programIdInput?: TinsProgramIdInput,
) {
  const programId = resolveProgramId(programIdInput);
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, encodeU64(tin), encodeU64(escrowId)],
    programId,
  );
}

export function encodeU32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

export function encodeU64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value, 0);
  return buffer;
}

export function encodeString(value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeU32(bytes.length), bytes]);
}

export function decodeString(buffer: Buffer, offset: number) {
  const len = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  return {
    value: buffer.subarray(start, end).toString("utf8"),
    nextOffset: end,
  };
}

export function luhnCheckDigit(sequence: bigint) {
  const digits = sequence.toString().padStart(9, "0");
  let sum = 0;
  let doubleDigit = true;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return (10 - (sum % 10)) % 10;
}

export function generateTin(sequence: bigint) {
  if (sequence < 0n || sequence > 999_999_999n) {
    throw new Error("Sequence must fit into 9 digits");
  }
  return sequence * 10n + BigInt(luhnCheckDigit(sequence));
}

export function validateTin(tin: bigint) {
  if (tin < 0n || tin > 9_999_999_999n) return false;
  const sequence = tin / 10n;
  const checkDigit = Number(tin % 10n);
  return luhnCheckDigit(sequence) === checkDigit;
}

export function buildInitializeProgramInstruction(params: {
  payer: Web3PublicKey;
  startingSequence: bigint;
  programId?: TinsProgramIdInput;
}) {
  const programId = resolveProgramId(params.programId);
  const [globalState] = getGlobalStatePda(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: globalState, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([TinsInstructionTag.InitializeProgram]),
      encodeU64(params.startingSequence),
    ]),
  });
}

export function buildInitializeIdentityInstruction(params: {
  payer: Web3PublicKey;
  sequence: bigint;
  name: string;
  masterPrivacy: Web3PublicKey;
  programId?: TinsProgramIdInput;
}) {
  const programId = resolveProgramId(params.programId);
  const [globalState] = getGlobalStatePda(programId);
  const tin = generateTin(params.sequence);
  const [registry] = getRegistryPda(tin, programId);

  return {
    tin,
    registry,
    instruction: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: globalState, isSigner: false, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([TinsInstructionTag.InitializeIdentity]),
        encodeString(params.name),
        params.masterPrivacy.toBuffer(),
      ]),
    }),
  };
}

export function buildCreateEscrowInstruction(params: {
  payer: Web3PublicKey;
  tin: bigint;
  escrowId: bigint;
  amountLamports: bigint;
  programId?: TinsProgramIdInput;
}) {
  const programId = resolveProgramId(params.programId);
  const [registry] = getRegistryPda(params.tin, programId);
  const [escrow] = getEscrowPda(params.tin, params.escrowId, programId);
  const [vault] = getVaultPda(params.tin, params.escrowId, programId);

  return {
    registry,
    escrow,
    vault,
    instruction: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([TinsInstructionTag.CreateEscrow]),
        encodeU64(params.amountLamports),
      ]),
    }),
  };
}

export function buildClaimEscrowInstruction(params: {
  claimant: Web3PublicKey;
  tin: bigint;
  escrowId: bigint;
  destination: Web3PublicKey;
  programId?: TinsProgramIdInput;
}) {
  const programId = resolveProgramId(params.programId);
  const [registry] = getRegistryPda(params.tin, programId);
  const [escrow] = getEscrowPda(params.tin, params.escrowId, programId);
  const [vault] = getVaultPda(params.tin, params.escrowId, programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.claimant, isSigner: true, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: params.destination, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([TinsInstructionTag.ClaimEscrow]),
  });
}

export function decodeGlobalStateAccount(data: Buffer): GlobalStateAccount {
  return {
    version: data.readUInt8(0),
    bump: data.readUInt8(1),
    nextSequence: data.readBigUInt64LE(8),
  };
}

export function decodeIdentityRegistryAccount(data: Buffer): IdentityRegistryAccount {
  let offset = 0;
  const version = data.readUInt8(offset);
  offset += 1;
  const bump = data.readUInt8(offset);
  offset += 1;
  const status = data.readUInt8(offset);
  offset += 1;
  offset += 5;
  const tin = data.readBigUInt64LE(offset);
  offset += 8;
  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const masterPrivacy = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const lastEscrowId = data.readBigUInt64LE(offset);
  offset += 8;
  const createdAt = data.readBigInt64LE(offset);
  offset += 8;
  const nameDecoded = decodeString(data, offset);

  return {
    version,
    bump,
    status,
    tin,
    authority,
    masterPrivacy,
    lastEscrowId,
    createdAt,
    name: nameDecoded.value,
  };
}

export function decodeEscrowStateAccount(data: Buffer): EscrowStateAccount {
  let offset = 0;
  const version = data.readUInt8(offset);
  offset += 1;
  const bump = data.readUInt8(offset);
  offset += 1;
  const status = data.readUInt8(offset);
  offset += 1;
  offset += 5;
  const tin = data.readBigUInt64LE(offset);
  offset += 8;
  const escrowId = data.readBigUInt64LE(offset);
  offset += 8;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const payer = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const recipientAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const vault = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const createdAt = data.readBigInt64LE(offset);
  offset += 8;
  const claimedAt = data.readBigInt64LE(offset);
  offset += 8;
  const destination = new PublicKey(data.subarray(offset, offset + 32));

  return {
    version,
    bump,
    status,
    tin,
    escrowId,
    amount,
    payer,
    recipientAuthority,
    vault,
    createdAt,
    claimedAt,
    destination,
  };
}

export async function fetchRegistryByTin(
  tin: bigint,
  connection: Web3Connection,
  programIdInput?: TinsProgramIdInput,
) {
  const programId = resolveProgramId(programIdInput);
  const [registry] = getRegistryPda(tin, programId);
  const account = await connection.getAccountInfo(registry, "confirmed");
  if (!account) return null;
  return {
    address: registry,
    data: decodeIdentityRegistryAccount(account.data),
  };
}

export function formatInstructionData(data: Buffer) {
  return {
    hex: data.toString("hex"),
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

export function randomPublicKey() {
  return Keypair.generate().publicKey;
}

export function createTinsClient(config: TinsClientConfig = {}) {
  const programId = resolveProgramId(config.programId);
  const connection = config.connection ?? createConnection(config.rpcUrl);

  return Object.freeze({
    programId,
    connection,
    getGlobalStatePda: () => getGlobalStatePda(programId),
    getRegistryPda: (tin: bigint) => getRegistryPda(tin, programId),
    getEscrowPda: (tin: bigint, escrowId: bigint) =>
      getEscrowPda(tin, escrowId, programId),
    getVaultPda: (tin: bigint, escrowId: bigint) =>
      getVaultPda(tin, escrowId, programId),
    buildInitializeProgramInstruction: (payer: Web3PublicKey, startingSequence: bigint) =>
      buildInitializeProgramInstruction({ payer, startingSequence, programId }),
    buildInitializeIdentityInstruction: (
      payer: Web3PublicKey,
      sequence: bigint,
      name: string,
      masterPrivacy: Web3PublicKey,
    ) =>
      buildInitializeIdentityInstruction({
        payer,
        sequence,
        name,
        masterPrivacy,
        programId,
      }),
    buildCreateEscrowInstruction: (
      payer: Web3PublicKey,
      tin: bigint,
      escrowId: bigint,
      amountLamports: bigint,
    ) =>
      buildCreateEscrowInstruction({
        payer,
        tin,
        escrowId,
        amountLamports,
        programId,
      }),
    buildClaimEscrowInstruction: (
      claimant: Web3PublicKey,
      tin: bigint,
      escrowId: bigint,
      destination: Web3PublicKey,
    ) =>
      buildClaimEscrowInstruction({
        claimant,
        tin,
        escrowId,
        destination,
        programId,
      }),
    fetchRegistryByTin: (tin: bigint) => fetchRegistryByTin(tin, connection, programId),
  });
}
