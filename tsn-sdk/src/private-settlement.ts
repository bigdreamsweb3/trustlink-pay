import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";

import {
  getTsnCrankerPda,
  getTsnCrankerVaultAuthorityPda,
  getTsnCrankerVaultPda,
  getTsnCrankerVaultTokenPda,
  getTsnMotherEscrowPda,
  getTsnVerifierPda,
} from "./blockchain/solana-tsn.js";
import { VERIFIED_TSN_PROGRAM_ID } from "./program.js";

const PROGRAM_ID = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
const PRIVATE_CONFIG_SEED = utf8ToBytes("tsn_private_config");
const PRIVATE_REPLAY_REGISTRY_SEED = utf8ToBytes("tsn_private_replay");
const SHARED_ESCROW_AUTHORITY_SEED = utf8ToBytes("tsn_shared_escrow");
const PRIVATE_PAYOUT_DOMAIN = utf8ToBytes("TSN_PRIVATE_PAYOUT_V2");
const PRIVATE_RECOVERY_DOMAIN = utf8ToBytes("TSN_PRIVATE_RECOVERY_V2");
const MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1";

export type PrivatePayoutPermit = {
  permitSigner: string;
  permitSignatureBase64: string;
  payoutNullifier: string;
  payoutSequence: string;
  tokenMintAddress: string;
  recipientWallet: string;
  payoutAmountBaseUnits: string;
  claimFeeAmountBaseUnits: string;
  expiresAtTs: number;
};

export type PrivateRecoveryPermit = {
  permitSigner: string;
  permitSignatureBase64: string;
  recoveryNullifier: string;
  recoverySequence: string;
  escrowTokenAccount: string;
  settlementCrankerPubkey: string;
  tokenMintAddress: string;
  recoveryAmountBaseUnits: string;
  expiresAtTs: number;
};

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeU64(value: bigint) {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("u64 value is out of range");
  }
  const output = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function encodeI64(value: bigint) {
  if (value < -(1n << 63n) || value > (1n << 63n) - 1n) {
    throw new Error("i64 value is out of range");
  }
  const normalized = value < 0 ? (1n << 64n) + value : value;
  return encodeU64(normalized);
}

function instructionDiscriminator(name: string) {
  return sha256(utf8ToBytes(`global:${name}`)).subarray(0, 8);
}

function assertBytes32(value: Uint8Array, label: string) {
  if (value.length !== 32) throw new Error(`${label} must contain exactly 32 bytes`);
}

function assertSignature(value: Uint8Array) {
  if (value.length !== 64) throw new Error("permit signature must contain exactly 64 bytes");
}

export function getTsnPrivateSettlementConfigPda() {
  const motherEscrow = getTsnMotherEscrowPda();
  return PublicKey.findProgramAddressSync(
    [PRIVATE_CONFIG_SEED, motherEscrow.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getTsnSharedEscrowAuthorityPda() {
  const motherEscrow = getTsnMotherEscrowPda();
  return PublicKey.findProgramAddressSync(
    [SHARED_ESCROW_AUTHORITY_SEED, motherEscrow.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getTsnPrivateReplayRegistryPda() {
  const motherEscrow = getTsnMotherEscrowPda();
  return PublicKey.findProgramAddressSync(
    [PRIVATE_REPLAY_REGISTRY_SEED, motherEscrow.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function createPrivateSettlementNullifier(params: {
  secret: Uint8Array;
  action: "payout" | "recovery";
}) {
  assertBytes32(params.secret, "private settlement secret");
  const domain =
    params.action === "payout" ? PRIVATE_PAYOUT_DOMAIN : PRIVATE_RECOVERY_DOMAIN;
  return sha256(concatBytes([domain, params.secret]));
}

export function createPrivatePayoutPermitMessage(params: {
  operator: PublicKey;
  payoutNullifier: Uint8Array;
  payoutSequence: bigint;
  crankerVault: PublicKey;
  recipientTokenAccount: PublicKey;
  tokenMint: PublicKey;
  payoutAmount: bigint;
  claimFeeAmount: bigint;
  expiresAtTs: bigint;
}) {
  assertBytes32(params.payoutNullifier, "payout nullifier");
  return concatBytes([
    PRIVATE_PAYOUT_DOMAIN,
    PROGRAM_ID.toBytes(),
    getTsnMotherEscrowPda().toBytes(),
    params.operator.toBytes(),
    params.payoutNullifier,
    encodeU64(params.payoutSequence),
    params.crankerVault.toBytes(),
    params.recipientTokenAccount.toBytes(),
    params.tokenMint.toBytes(),
    encodeU64(params.payoutAmount),
    encodeU64(params.claimFeeAmount),
    encodeI64(params.expiresAtTs),
  ]);
}

export function createPrivateRecoveryPermitMessage(params: {
  operator: PublicKey;
  recoveryNullifier: Uint8Array;
  recoverySequence: bigint;
  escrowTokenAccount: PublicKey;
  settlementCrankerVault: PublicKey;
  settlementVaultTokenAccount: PublicKey;
  tokenMint: PublicKey;
  recoveryAmount: bigint;
  expiresAtTs: bigint;
}) {
  assertBytes32(params.recoveryNullifier, "recovery nullifier");
  return concatBytes([
    PRIVATE_RECOVERY_DOMAIN,
    PROGRAM_ID.toBytes(),
    getTsnMotherEscrowPda().toBytes(),
    params.operator.toBytes(),
    params.recoveryNullifier,
    encodeU64(params.recoverySequence),
    params.escrowTokenAccount.toBytes(),
    params.settlementCrankerVault.toBytes(),
    params.settlementVaultTokenAccount.toBytes(),
    params.tokenMint.toBytes(),
    encodeU64(params.recoveryAmount),
    encodeI64(params.expiresAtTs),
  ]);
}

export function signPrivateSettlementPermit(params: {
  message: Uint8Array;
  permitSigner: Keypair;
}) {
  return nacl.sign.detached(params.message, params.permitSigner.secretKey);
}

export function createMempoolLeaseAuthorizationMessage(params: {
  action: "payout" | "recovery";
  workId: string;
  operator: PublicKey;
  requestedAtTs: number;
}) {
  if (!Number.isInteger(params.requestedAtTs) || params.requestedAtTs <= 0) {
    throw new Error("requestedAtTs must be a positive Unix timestamp");
  }
  return utf8ToBytes(
    [
      MEMPOOL_LEASE_DOMAIN,
      params.action,
      params.workId,
      params.operator.toBase58(),
      String(params.requestedAtTs),
    ].join("|"),
  );
}

async function requestPrivatePermit<T>(params: {
  mempoolUrl: string;
  apiKey?: string | null;
  action: "payout" | "recovery";
  workId: string;
  operator: Keypair;
  fetchImpl?: typeof fetch;
}) {
  const requestedAtTs = Math.floor(Date.now() / 1000);
  const message = createMempoolLeaseAuthorizationMessage({
    action: params.action,
    workId: params.workId,
    operator: params.operator.publicKey,
    requestedAtTs,
  });
  const requestSignature = nacl.sign.detached(message, params.operator.secretKey);
  const fetchImpl = (params.fetchImpl ?? globalThis.fetch).bind(globalThis) as typeof fetch;
  const endpoint =
    params.action === "payout"
      ? `/work/${encodeURIComponent(params.workId)}/lease-permit`
      : `/recoveries/${encodeURIComponent(params.workId)}/lease-permit`;
  const response = await fetchImpl(`${params.mempoolUrl.replace(/\/$/, "")}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(params.apiKey ? { "x-api-key": params.apiKey } : {}),
    },
    body: JSON.stringify({
      operatorPubkey: params.operator.publicKey.toBase58(),
      requestedAtTs,
      requestSignatureBase64: Buffer.from(requestSignature).toString("base64"),
    }),
  });
  if (!response.ok) {
    throw new Error(`TSN permit request failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export function requestPrivatePayoutPermit(params: {
  mempoolUrl: string;
  apiKey?: string | null;
  claimRequestId: string;
  operator: Keypair;
  fetchImpl?: typeof fetch;
}) {
  return requestPrivatePermit<PrivatePayoutPermit>({
    ...params,
    action: "payout",
    workId: params.claimRequestId,
  });
}

export function requestPrivateRecoveryPermit(params: {
  mempoolUrl: string;
  apiKey?: string | null;
  recoveryId: string;
  operator: Keypair;
  fetchImpl?: typeof fetch;
}) {
  return requestPrivatePermit<PrivateRecoveryPermit>({
    ...params,
    action: "recovery",
    workId: params.recoveryId,
  });
}

export async function tsnConfigurePrivateSettlementOnChain(params: {
  authority: Keypair;
  permitSigner: PublicKey;
  enabled?: boolean;
  rpcUrl?: string;
}) {
  const connection = new Connection(params.rpcUrl ?? "https://api.devnet.solana.com", "confirmed");
  const motherEscrow = getTsnMotherEscrowPda();
  const config = getTsnPrivateSettlementConfigPda();
  const replayRegistry = getTsnPrivateReplayRegistryPda();
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: replayRegistry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concatBytes([
        instructionDiscriminator("tsn_configure_private_settlement"),
        params.permitSigner.toBytes(),
        Uint8Array.of(params.enabled === false ? 0 : 1),
      ]),
    ),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction({ feePayer: params.authority.publicKey }).add(instruction),
    [params.authority],
    { commitment: "confirmed" },
  );
  return {
    signature,
    config: config.toBase58(),
    replayRegistry: replayRegistry.toBase58(),
  };
}

export async function tsnExecutePrivatePayoutOnChain(params: {
  operator: Keypair;
  permitSigner: PublicKey;
  permitSignature: Uint8Array;
  payoutNullifier: Uint8Array;
  payoutSequence: bigint;
  tokenMint: PublicKey;
  recipientWallet: PublicKey;
  payoutAmount: bigint;
  claimFeeAmount?: bigint;
  expiresAtTs: bigint;
  rpcUrl?: string;
}) {
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertSignature(params.permitSignature);
  const connection = new Connection(params.rpcUrl ?? "https://api.devnet.solana.com", "confirmed");
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
  const config = getTsnPrivateSettlementConfigPda();
  const replayRegistry = getTsnPrivateReplayRegistryPda();
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const recipientTokenAccount = getAssociatedTokenAddressSync(
    params.tokenMint,
    params.recipientWallet,
  );
  const verifierPda = getTsnVerifierPda();
  const message = createPrivatePayoutPermitMessage({
    operator: params.operator.publicKey,
    payoutNullifier: params.payoutNullifier,
    payoutSequence: params.payoutSequence,
    crankerVault,
    recipientTokenAccount,
    tokenMint: params.tokenMint,
    payoutAmount: params.payoutAmount,
    claimFeeAmount: params.claimFeeAmount ?? 0n,
    expiresAtTs: params.expiresAtTs,
  });
  const verifyInstruction = Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.permitSigner.toBytes(),
    message,
    signature: params.permitSignature,
  });
  const payoutInstruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: cranker, isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: replayRegistry, isSigner: false, isWritable: true },
      { pubkey: crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.recipientWallet, isSigner: false, isWritable: false },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: verifierPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concatBytes([
        instructionDiscriminator("tsn_execute_private_payout"),
        params.payoutNullifier,
        encodeU64(params.payoutSequence),
        encodeU64(params.payoutAmount),
        encodeU64(params.claimFeeAmount ?? 0n),
        encodeI64(params.expiresAtTs),
        params.permitSignature,
      ]),
    ),
  });
  const transaction = new Transaction({ feePayer: params.operator.publicKey }).add(
    verifyInstruction,
    payoutInstruction,
  );
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [params.operator],
    { commitment: "confirmed" },
  );
  return { signature, payoutNullifier: Buffer.from(params.payoutNullifier).toString("hex") };
}

export async function tsnRecoverPrivateEscrowOnChain(params: {
  operator: Keypair;
  permitSigner: PublicKey;
  permitSignature: Uint8Array;
  recoveryNullifier: Uint8Array;
  recoverySequence: bigint;
  escrowTokenAccount: PublicKey;
  settlementCrankerOperator: PublicKey;
  tokenMint: PublicKey;
  recoveryAmount: bigint;
  expiresAtTs: bigint;
  rpcUrl?: string;
}) {
  assertBytes32(params.recoveryNullifier, "recovery nullifier");
  assertSignature(params.permitSignature);
  const connection = new Connection(params.rpcUrl ?? "https://api.devnet.solana.com", "confirmed");
  const motherEscrow = getTsnMotherEscrowPda();
  const recoveryCranker = getTsnCrankerPda({
    motherEscrow,
    operator: params.operator.publicKey,
  });
  const settlementCranker = getTsnCrankerPda({
    motherEscrow,
    operator: params.settlementCrankerOperator,
  });
  const config = getTsnPrivateSettlementConfigPda();
  const replayRegistry = getTsnPrivateReplayRegistryPda();
  const sharedEscrowAuthority = getTsnSharedEscrowAuthorityPda();
  const settlementCrankerVault = getTsnCrankerVaultPda({
    cranker: settlementCranker,
    tokenMint: params.tokenMint,
  });
  const settlementVaultTokenAccount = getTsnCrankerVaultTokenPda({
    crankerVault: settlementCrankerVault,
  });
  const verifierPda = getTsnVerifierPda();
  const message = createPrivateRecoveryPermitMessage({
    operator: params.operator.publicKey,
    recoveryNullifier: params.recoveryNullifier,
    recoverySequence: params.recoverySequence,
    escrowTokenAccount: params.escrowTokenAccount,
    settlementCrankerVault,
    settlementVaultTokenAccount,
    tokenMint: params.tokenMint,
    recoveryAmount: params.recoveryAmount,
    expiresAtTs: params.expiresAtTs,
  });
  const verifyInstruction = Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.permitSigner.toBytes(),
    message,
    signature: params.permitSignature,
  });
  const recoveryInstruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: recoveryCranker, isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: replayRegistry, isSigner: false, isWritable: true },
      { pubkey: sharedEscrowAuthority, isSigner: false, isWritable: false },
      { pubkey: params.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: settlementCrankerVault, isSigner: false, isWritable: true },
      { pubkey: settlementVaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: verifierPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concatBytes([
        instructionDiscriminator("tsn_recover_private_escrow"),
        params.recoveryNullifier,
        encodeU64(params.recoverySequence),
        encodeU64(params.recoveryAmount),
        encodeI64(params.expiresAtTs),
        params.permitSignature,
      ]),
    ),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction({ feePayer: params.operator.publicKey }).add(
      verifyInstruction,
      recoveryInstruction,
    ),
    [params.operator],
    { commitment: "confirmed" },
  );
  return { signature, recoveryNullifier: Buffer.from(params.recoveryNullifier).toString("hex") };
}
