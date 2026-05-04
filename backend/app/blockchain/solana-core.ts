import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash, randomUUID } from "node:crypto";

import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { getUsdPricesForSymbols } from "@/app/services/pricing";

const splToken = require("@solana/spl-token") as {
  TOKEN_PROGRAM_ID: PublicKey;
  ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
  getAssociatedTokenAddressSync: (mint: PublicKey, owner: PublicKey) => PublicKey;
  createAssociatedTokenAccountInstruction: (
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId?: PublicKey,
    associatedTokenProgramId?: PublicKey,
  ) => TransactionInstruction;
};

const CONFIG_SEED = Buffer.from("config");
const PAYMENT_SEED = Buffer.from("payment");
const VAULT_AUTHORITY_SEED = Buffer.from("vault_authority");
const IDENTITY_BINDING_SEED = Buffer.from("identity_binding");
const ESCROW_CONFIG_DISCRIMINATOR = accountDiscriminator("EscrowConfig");
const PAYMENT_ACCOUNT_DISCRIMINATOR = accountDiscriminator("PaymentAccount");
const IDENTITY_BINDING_DISCRIMINATOR = accountDiscriminator("IdentityBinding");
const LAMPORTS_PER_SOL = 1_000_000_000;

type SupportedTokenConfig = {
  mintAddress: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
};

export type SupportedWalletToken = {
  symbol: string;
  name: string;
  balance: number;
  logo: string;
  mintAddress: string;
  supported: boolean;
};

export type BlockchainExecutionMode = "mock" | "devnet";

export type SenderTransferFeeEstimate = {
  tokenSymbol: string;
  tokenMintAddress: string;
  senderFeeAmountUi: number;
  senderFeeAmountUsd: number | null;
  totalTokenRequiredUi: number;
  estimatedNetworkFeeLamports: number;
  networkFeeSol: number;
  networkFeeUsd: number | null;
};

export type ClaimFeeEstimate = {
  tokenSymbol: string;
  tokenMintAddress: string;
  feeAmountUi: number;
  feeAmountBaseUnits: bigint;
  feeAmountUsd: number | null;
  estimatedNetworkFeeLamports: number;
  estimatedNetworkFeeSol: number;
  estimatedNetworkFeeUsd: number | null;
  markupAmountUi: number;
  receiverAmountUi: number;
  totalAmountUi: number;
};

type DecodedPaymentAccount = {
  paymentId: Uint8Array;
  senderPubkey: PublicKey;
  phoneIdentityPublicKey: PublicKey;
  paymentReceiverPublicKey: PublicKey;
  tokenMint: PublicKey;
  amount: bigint;
  expiryTs: bigint;
  status: number;
  paymentBump: number | null;
  vaultAuthorityBump: number | null;
  senderPhoneIdentityPublicKey: PublicKey | null;
  paymentMode: number | null;
  refundReceiverPublicKey: PublicKey | null;
  refundRequestedAtTs: bigint | null;
  refundAvailableAtTs: bigint | null;
  expiredAtTs: bigint | null;
};

type DecodedIdentityBinding = {
  receiverIdentityPublicKey: PublicKey;
  settlementWallet: PublicKey;
  recoveryWallet: PublicKey | null;
  isFrozen: boolean;
  recoveryCooldown: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  bump: number;
};

type DecodedEscrowConfig = {
  claimVerifier: PublicKey;
  defaultExpirySeconds: bigint;
  bump: number;
  layout: "current" | "legacy";
  treasuryOwner?: PublicKey | null;
};

let allowedTokenCache: SupportedTokenConfig[] | null = null;

export const TOKEN_PROGRAM_ID = splToken.TOKEN_PROGRAM_ID;
export const ASSOCIATED_TOKEN_PROGRAM_ID = splToken.ASSOCIATED_TOKEN_PROGRAM_ID;
export const TOKEN_ACCOUNT_SPACE = 165;

export function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function encodeI64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
}

export function calculateFeeAmountUi(params: {
  amount: number;
  decimals: number;
  basisPoints: number;
  maxUiAmount: number;
}) {
  if (!Number.isFinite(params.amount) || params.amount <= 0 || params.basisPoints <= 0) {
    return 0;
  }

  const rawFee = (params.amount * params.basisPoints) / 10_000;
  const cappedFee = params.maxUiAmount > 0 ? Math.min(rawFee, params.maxUiAmount) : rawFee;
  return roundUpToDecimals(cappedFee, params.decimals);
}

function getSecretKey(): Uint8Array {
  const rawValue = (env.SOLANA_CLAIM_VERIFIER_SECRET_KEY ?? env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY)!.trim();

  try {
    const values = JSON.parse(rawValue) as number[];
    return Uint8Array.from(values);
  } catch {
    if (rawValue.includes(",")) {
      const values = rawValue
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isFinite(value));

      if (values.length > 0) {
        return Uint8Array.from(values);
      }
    }

    const normalized = rawValue.replace(/^\[|\]$/g, "").trim();
    if (normalized) {
      const hashed = createHash("sha256").update(normalized).digest();
      return Uint8Array.from(hashed);
    }

    throw new Error("SOLANA_ESCROW_AUTHORITY_SECRET_KEY is empty");
  }
}

export function getEscrowAuthorityKeypair() {
  const secretKey = getSecretKey();

  try {
    if (secretKey.length >= 64) {
      return Keypair.fromSecretKey(secretKey.slice(0, 64));
    }
  } catch {
    // Fall back to deterministic seed derivation for local/devnet compatibility.
  }

  const seed =
    secretKey.length >= 32 ? secretKey.slice(0, 32) : createHash("sha256").update(secretKey).digest().slice(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

export function getConnection() {
  return new Connection(env.SOLANA_RPC_URL!, "confirmed");
}

export function getProgramId() {
  return new PublicKey(env.SOLANA_PROGRAM_ID!);
}

export function parseAllowedTokens() {
  if (allowedTokenCache) {
    return allowedTokenCache;
  }

  const rawValue = env.SOLANA_ALLOWED_SPL_TOKENS;
  if (!rawValue) {
    allowedTokenCache = [];
    return allowedTokenCache;
  }

  const parsed = JSON.parse(rawValue) as Array<{
    mintAddress: string;
    symbol: string;
    name?: string;
    logo?: string;
    decimals?: number;
  }>;

  allowedTokenCache = parsed.map((token) => ({
    mintAddress: new PublicKey(token.mintAddress).toBase58(),
    symbol: token.symbol.trim().toUpperCase(),
    name: token.name?.trim() || token.symbol.trim().toUpperCase(),
    logo: token.logo?.trim() || "o",
    decimals: Number.isFinite(token.decimals) ? Number(token.decimals) : 6,
  }));

  return allowedTokenCache;
}

export function getAllowedTokenByMint(mintAddress: string) {
  return parseAllowedTokens().find((token) => token.mintAddress === mintAddress) ?? null;
}

export function paymentIdToSeed(paymentId: string) {
  return createHash("sha256").update(`trustlink-payment:${paymentId}`).digest().subarray(0, 32);
}

export function identityPublicKeyToBytes(identityPublicKey: string) {
  return new PublicKey(identityPublicKey).toBuffer();
}

function getConfigPda() {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], getProgramId())[0];
}

export function getPaymentAccountPda(paymentId: string) {
  return PublicKey.findProgramAddressSync([PAYMENT_SEED, paymentIdToSeed(paymentId)], getProgramId())[0];
}

export function getVaultAuthorityPda(paymentId: string) {
  return PublicKey.findProgramAddressSync([VAULT_AUTHORITY_SEED, paymentIdToSeed(paymentId)], getProgramId())[0];
}

export function getIdentityBindingPda(identityPublicKey: string) {
  return PublicKey.findProgramAddressSync(
    [IDENTITY_BINDING_SEED, identityPublicKeyToBytes(identityPublicKey)],
    getProgramId(),
  )[0];
}

export function decodePaymentAccount(data: Buffer): DecodedPaymentAccount {
  if (!data.subarray(0, 8).equals(PAYMENT_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Payment account discriminator mismatch");
  }

  let offset = 8;
  const paymentId = data.subarray(offset, offset + 32);
  offset += 32;
  const senderPubkey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const phoneIdentityPublicKey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const paymentReceiverPublicKey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const tokenMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const expiryTs = data.readBigInt64LE(offset);
  offset += 8;
  const status = data.readUInt8(offset);
  offset += 1;
  const paymentBump = data.length > offset ? data.readUInt8(offset) : null;
  if (paymentBump != null) {
    offset += 1;
  }
  const vaultAuthorityBump = data.length > offset ? data.readUInt8(offset) : null;
  if (vaultAuthorityBump != null) {
    offset += 1;
  }
  const senderPhoneIdentityPublicKey =
    data.length >= offset + 32 ? new PublicKey(data.subarray(offset, offset + 32)) : null;
  if (senderPhoneIdentityPublicKey) {
    offset += 32;
  }
  const paymentMode = data.length > offset ? data.readUInt8(offset) : null;
  if (paymentMode != null) {
    offset += 1;
  }
  const refundReceiverOption = data.length > offset ? data.readUInt8(offset) : null;
  if (refundReceiverOption != null) {
    offset += 1;
  }
  const refundReceiverPublicKey =
    refundReceiverOption === 1 && data.length >= offset + 32 ? new PublicKey(data.subarray(offset, offset + 32)) : null;
  if (refundReceiverOption === 1) {
    offset += 32;
  }
  const refundRequestedAtTs = data.length >= offset + 8 ? data.readBigInt64LE(offset) : null;
  if (refundRequestedAtTs != null) {
    offset += 8;
  }
  const refundAvailableAtTs = data.length >= offset + 8 ? data.readBigInt64LE(offset) : null;
  if (refundAvailableAtTs != null) {
    offset += 8;
  }
  const expiredAtTs = data.length >= offset + 8 ? data.readBigInt64LE(offset) : null;

  return {
    paymentId,
    senderPubkey,
    phoneIdentityPublicKey,
    paymentReceiverPublicKey,
    tokenMint,
    amount,
    expiryTs,
    status,
    paymentBump,
    vaultAuthorityBump,
    senderPhoneIdentityPublicKey,
    paymentMode,
    refundReceiverPublicKey,
    refundRequestedAtTs,
    refundAvailableAtTs,
    expiredAtTs,
  };
}

export function decodeIdentityBinding(data: Buffer): DecodedIdentityBinding {
  if (!data.subarray(0, 8).equals(IDENTITY_BINDING_DISCRIMINATOR)) {
    throw new Error("Identity binding discriminator mismatch");
  }

  let offset = 8;
  const receiverIdentityPublicKey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const settlementWallet = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const recoveryWalletOption = data.readUInt8(offset);
  offset += 1;
  const recoveryWallet =
    recoveryWalletOption === 1 ? new PublicKey(data.subarray(offset, offset + 32)) : null;
  if (recoveryWalletOption === 1) {
    offset += 32;
  }
  const isFrozen = data.readUInt8(offset) === 1;
  offset += 1;
  const recoveryCooldown = data.readBigInt64LE(offset);
  offset += 8;
  const createdAt = data.readBigInt64LE(offset);
  offset += 8;
  const updatedAt = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    receiverIdentityPublicKey,
    settlementWallet,
    recoveryWallet,
    isFrozen,
    recoveryCooldown,
    createdAt,
    updatedAt,
    bump,
  };
}

function decodeEscrowConfig(data: Buffer): DecodedEscrowConfig {
  if (!data.subarray(0, 8).equals(ESCROW_CONFIG_DISCRIMINATOR)) {
    throw new Error("Escrow config discriminator mismatch");
  }

  const currentLayoutSize = 8 + 32 + 8 + 1;
  const legacyLayoutSize = 8 + 32 + 32 + 8 + 1;

  if (data.length >= legacyLayoutSize) {
    let offset = 8;
    const claimVerifier = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const treasuryOwner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const defaultExpirySeconds = data.readBigInt64LE(offset);
    offset += 8;
    const bump = data.readUInt8(offset);

    if (data.length > currentLayoutSize) {
      return {
        claimVerifier,
        defaultExpirySeconds,
        bump,
        layout: "legacy",
        treasuryOwner,
      };
    }
  }

  if (data.length < currentLayoutSize) {
    if (data.length < 8 + 32) {
      throw new Error(`Escrow config account is too small to decode: ${data.length} bytes`);
    }

    let legacyOffset = 8;
    const claimVerifier = new PublicKey(data.subarray(legacyOffset, legacyOffset + 32));
    legacyOffset += 32;
    const bump = data.length > legacyOffset ? data.readUInt8(legacyOffset) : 0;

    return {
      claimVerifier,
      defaultExpirySeconds: 0n,
      bump,
      layout: "legacy",
      treasuryOwner: null,
    };
  }

  let offset = 8;
  const claimVerifier = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const defaultExpirySeconds = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    claimVerifier,
    defaultExpirySeconds,
    bump,
    layout: "current",
    treasuryOwner: null,
  };
}

export function getEscrowVerifierPublicKey() {
  return getEscrowAuthorityKeypair().publicKey.toBase58();
}

export async function isEscrowConfigInitialized() {
  const connection = getConnection();
  const configPda = getConfigPda();
  const existing = await connection.getAccountInfo(configPda, "confirmed");

  return Boolean(existing);
}

export async function getEscrowConfigState() {
  const connection = getConnection();
  const configPda = getConfigPda();
  const existing = await connection.getAccountInfo(configPda, "confirmed");

  if (!existing) {
    return null;
  }

  const decoded = decodeEscrowConfig(existing.data);
  return {
    address: configPda.toBase58(),
    claimVerifier: decoded.claimVerifier.toBase58(),
    treasuryOwner: decoded.treasuryOwner?.toBase58() ?? null,
    defaultExpirySeconds: decoded.defaultExpirySeconds.toString(),
    bump: decoded.bump,
    layout: decoded.layout,
  };
}

export async function initializeEscrowConfig() {
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const policy = getEscrowPolicyConfig();
  const configPda = getConfigPda();
  const existing = await connection.getAccountInfo(configPda, "confirmed");

  if (existing) {
    logger.info("solana.escrow_config_already_initialized", {
      config: configPda.toBase58(),
      claimVerifier: payer.publicKey.toBase58(),
    });
    return configPda.toBase58();
  }

  const data = Buffer.concat([
    instructionDiscriminator("initialize_config"),
    payer.publicKey.toBuffer(),
    encodeI64(BigInt(policy.defaultExpirySeconds)),
  ]);

  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  );

  await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: "confirmed",
  });

  logger.info("solana.escrow_config_initialized", {
    config: configPda.toBase58(),
    claimVerifier: payer.publicKey.toBase58(),
    defaultExpirySeconds: policy.defaultExpirySeconds,
  });

  return configPda.toBase58();
}

export async function updateEscrowConfig() {
  const connection = getConnection();
  const authority = getEscrowAuthorityKeypair();
  const policy = getEscrowPolicyConfig();
  const configPda = getConfigPda();
  const existing = await connection.getAccountInfo(configPda, "confirmed");

  if (!existing) {
    throw new Error("Escrow config is not initialized. Run escrow:init-config first.");
  }

  const current = decodeEscrowConfig(existing.data);
  if (current.layout === "legacy") {
    logger.warn("solana.escrow_config_legacy_layout_detected", {
      config: configPda.toBase58(),
      claimVerifier: current.claimVerifier.toBase58(),
      treasuryOwner: current.treasuryOwner?.toBase58() ?? null,
      defaultExpirySeconds: current.defaultExpirySeconds.toString(),
    });
  }

  const targetClaimVerifier = authority.publicKey.toBase58();
  const targetDefaultExpirySeconds = BigInt(policy.defaultExpirySeconds);

  if (
    current.claimVerifier.toBase58() === targetClaimVerifier &&
    current.defaultExpirySeconds === targetDefaultExpirySeconds
  ) {
    logger.info("solana.escrow_config_already_matches_target", {
      config: configPda.toBase58(),
      claimVerifier: targetClaimVerifier,
      defaultExpirySeconds: policy.defaultExpirySeconds,
    });
    return configPda.toBase58();
  }

  const data = Buffer.concat([
    instructionDiscriminator("update_config"),
    authority.publicKey.toBuffer(),
    encodeI64(targetDefaultExpirySeconds),
  ]);

  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: true },
      ],
      data,
    }),
  );

  await sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
  });

  logger.info("solana.escrow_config_updated", {
    config: configPda.toBase58(),
    claimVerifier: targetClaimVerifier,
    defaultExpirySeconds: policy.defaultExpirySeconds,
  });

  return configPda.toBase58();
}

export async function requireEscrowConfigInitialized() {
  const configPda = getConfigPda();
  const initialized = await isEscrowConfigInitialized();
  if (!initialized) {
    throw new Error(
      `Escrow config is not initialized. Run the one-time config init with verifier ${getEscrowVerifierPublicKey()} before creating or claiming payments.`,
    );
  }

  return configPda;
}

export async function getIdentityBindingState(identityPublicKey: string) {
  const connection = getConnection();
  const bindingPda = getIdentityBindingPda(identityPublicKey);
  const existing = await connection.getAccountInfo(bindingPda, "confirmed");

  if (!existing) {
    return null;
  }

  const decoded = decodeIdentityBinding(existing.data);
  return {
    address: bindingPda.toBase58(),
    settlementWallet: decoded.settlementWallet.toBase58(),
    recoveryWallet: decoded.recoveryWallet?.toBase58() ?? null,
    isFrozen: decoded.isFrozen,
    recoveryCooldown: decoded.recoveryCooldown.toString(),
    createdAt: decoded.createdAt.toString(),
    updatedAt: decoded.updatedAt.toString(),
    bump: decoded.bump,
  };
}

export async function prepareInitializeIdentityBindingTransaction(params: {
  identityPublicKey: string;
  settlementWallet: string;
}) {
  const connection = getConnection();
  const claimVerifier = getEscrowAuthorityKeypair();
  const configPda = await requireEscrowConfigInitialized();
  const settlementWallet = new PublicKey(params.settlementWallet);
  const identityBinding = getIdentityBindingPda(params.identityPublicKey);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: claimVerifier.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: claimVerifier.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: settlementWallet, isSigner: true, isWritable: false },
        { pubkey: identityBinding, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        instructionDiscriminator("initialize_identity_binding"),
        identityPublicKeyToBytes(params.identityPublicKey),
      ]),
    }),
  );

  transaction.partialSign(claimVerifier);

  const estimatedNetworkFeeLamports = await estimateTransactionFeeLamports(connection, transaction);
  return {
    identityBinding: identityBinding.toBase58(),
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
    programId: getProgramId().toBase58(),
    feePayer: claimVerifier.publicKey.toBase58(),
    estimatedNetworkFeeLamports,
    estimatedNetworkFeeSol: lamportsToSol(estimatedNetworkFeeLamports),
  };
}

export async function confirmIdentityBindingState(params: {
  identityPublicKey: string;
  settlementWallet: string;
  blockchainSignature: string;
}) {
  const connection = getConnection();
  const transaction = await connection.getTransaction(params.blockchainSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction || transaction.meta?.err) {
    throw new Error("The identity binding transaction could not be confirmed on-chain");
  }

  const binding = await getIdentityBindingState(params.identityPublicKey);
  if (!binding) {
    throw new Error("Identity binding was not created on-chain");
  }

  const settlementWallet = new PublicKey(params.settlementWallet).toBase58();
  if (binding.settlementWallet !== settlementWallet) {
    throw new Error("The bound settlement wallet on-chain does not match the requested wallet");
  }

  return {
    ...binding,
    signature: params.blockchainSignature,
    mode: "devnet" as const,
  };
}

export async function prepareAddRecoveryWalletTransaction(params: {
  identityPublicKey: string;
  authorityWallet: string;
  recoveryWallet: string;
  allowUpdate: boolean;
}) {
  const connection = getConnection();
  const authority = new PublicKey(params.authorityWallet);
  const recoveryWallet = new PublicKey(params.recoveryWallet);
  const identityBinding = getIdentityBindingPda(params.identityPublicKey);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: authority,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: identityBinding, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        instructionDiscriminator("add_recovery_wallet"),
        recoveryWallet.toBuffer(),
        Buffer.from([params.allowUpdate ? 1 : 0]),
      ]),
    }),
  );

  return {
    identityBinding: identityBinding.toBase58(),
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
  };
}

export async function prepareSetIdentityFreezeTransaction(params: {
  identityPublicKey: string;
  authorityWallet: string;
  frozen: boolean;
}) {
  const connection = getConnection();
  const authority = new PublicKey(params.authorityWallet);
  const identityBinding = getIdentityBindingPda(params.identityPublicKey);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: authority,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: identityBinding, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        instructionDiscriminator("set_identity_freeze"),
        Buffer.from([params.frozen ? 1 : 0]),
      ]),
    }),
  );

  return {
    identityBinding: identityBinding.toBase58(),
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
  };
}

export async function prepareRequestRecoveryTransaction(params: {
  identityPublicKey: string;
  authorityWallet: string;
}) {
  const connection = getConnection();
  const authority = new PublicKey(params.authorityWallet);
  const identityBinding = getIdentityBindingPda(params.identityPublicKey);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: authority,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: identityBinding, isSigner: false, isWritable: true },
      ],
      data: Buffer.from(instructionDiscriminator("request_recovery")),
    }),
  );

  return {
    identityBinding: identityBinding.toBase58(),
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
  };
}

function getActiveRecoveryWallets() {
  return getEscrowPolicyConfig().recoveryWallets.filter((wallet) => wallet.active);
}

export function selectRecoveryWallet(paymentId: string) {
  const activeWallets = getActiveRecoveryWallets();
  if (activeWallets.length === 0) {
    throw new Error("No active TrustLink recovery wallets are configured");
  }

  const hash = createHash("sha256").update(`trustlink-recovery:${paymentId}`).digest();
  const index = hash.readUInt32LE(0) % activeWallets.length;
  return activeWallets[index];
}

export async function findSenderTokenAccount(params: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
  amount: number;
}) {
  const accounts = await params.connection.getParsedTokenAccountsByOwner(
    params.owner,
    { mint: params.mint },
    "confirmed",
  );

  const matching = accounts.value
    .map((entry) => {
      const parsedInfo = (entry.account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
      const tokenAmount = parsedInfo?.tokenAmount as { uiAmount?: number; uiAmountString?: string } | undefined;
      const balance = tokenAmount?.uiAmount ?? Number(tokenAmount?.uiAmountString ?? "0");

      return {
        address: entry.pubkey,
        balance,
      };
    })
    .filter((entry) => Number.isFinite(entry.balance) && entry.balance >= params.amount)
    .sort((left, right) => right.balance - left.balance);

  return matching[0]?.address ?? null;
}

export function toBaseUnits(amount: number, decimals: number) {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function fromBaseUnits(amount: bigint, decimals: number) {
  return Number(amount) / 10 ** decimals;
}

export function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL;
}

export function roundToDecimals(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

export function roundUpToDecimals(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.ceil(value * multiplier) / multiplier;
}

export async function estimateTransactionFeeLamports(connection: Connection, transaction: Transaction) {
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
  return fee.value ?? 0;
}

export async function getTokenAndSolUsdPrices(tokenSymbol: string) {
  const prices = await getUsdPricesForSymbols(["SOL", tokenSymbol]);
  return {
    solUsd: prices.SOL ?? null,
    tokenUsd: prices[tokenSymbol.toUpperCase()] ?? null,
  };
}

export function getEscrowDepositAddress() {
  return getProgramId().toBase58();
}

export function createDraftPaymentId() {
  return randomUUID();
}
