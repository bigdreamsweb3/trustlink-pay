import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash, randomUUID } from "node:crypto";

import { getEscrowFeeConfig } from "@/app/config/escrow";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { getUsdPricesForSymbols } from "@/app/services/pricing";
import { sha256 } from "@/app/utils/hash";

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
const TOKEN_PROGRAM_ID = splToken.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = splToken.ASSOCIATED_TOKEN_PROGRAM_ID;
const ESCROW_CONFIG_DISCRIMINATOR = accountDiscriminator("EscrowConfig");
const PAYMENT_ACCOUNT_DISCRIMINATOR = accountDiscriminator("PaymentAccount");
const PAYMENT_ACCOUNT_SPACE = 163;
const TOKEN_ACCOUNT_SPACE = 165;
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
  networkFeeLamports: number;
  accountRentLamports: number;
  totalLamports: number;
  networkFeeSol: number;
  accountRentSol: number;
  totalSol: number;
  totalUsd: number | null;
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
  receiverPhoneHash: Uint8Array;
  tokenMint: PublicKey;
  amount: bigint;
  feeAmount: bigint;
  expiryTs: bigint;
  status: number;
};

type DecodedEscrowConfig = {
  claimVerifier: PublicKey;
  treasuryOwner: PublicKey;
  feeBps: number;
  feeCap: bigint;
  bump: number;
  layout: "current" | "legacy";
};

let allowedTokenCache: SupportedTokenConfig[] | null = null;

function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function encodeU64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function encodeU16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function encodeI64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
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

function getEscrowAuthorityKeypair() {
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

function getConnection() {
  return new Connection(env.SOLANA_RPC_URL!, "confirmed");
}

function getProgramId() {
  return new PublicKey(env.SOLANA_PROGRAM_ID!);
}

function parseAllowedTokens() {
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

function getAllowedTokenByMint(mintAddress: string) {
  return parseAllowedTokens().find((token) => token.mintAddress === mintAddress) ?? null;
}

function paymentIdToSeed(paymentId: string) {
  return createHash("sha256").update(`trustlink-payment:${paymentId}`).digest().subarray(0, 32);
}

function phoneHashHexToBytes(phoneHash: string) {
  const bytes = Buffer.from(phoneHash, "hex");
  if (bytes.length !== 32) {
    throw new Error("Phone hash must resolve to 32 bytes");
  }
  return bytes;
}

function getConfigPda() {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], getProgramId())[0];
}

function getPaymentAccountPda(paymentId: string) {
  return PublicKey.findProgramAddressSync([PAYMENT_SEED, paymentIdToSeed(paymentId)], getProgramId())[0];
}

function getVaultAuthorityPda(paymentId: string) {
  return PublicKey.findProgramAddressSync([VAULT_AUTHORITY_SEED, paymentIdToSeed(paymentId)], getProgramId())[0];
}

function decodePaymentAccount(data: Buffer): DecodedPaymentAccount {
  if (!data.subarray(0, 8).equals(PAYMENT_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Payment account discriminator mismatch");
  }

  let offset = 8;
  const paymentId = data.subarray(offset, offset + 32);
  offset += 32;
  const senderPubkey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const receiverPhoneHash = data.subarray(offset, offset + 32);
  offset += 32;
  const tokenMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const feeAmount = data.readBigUInt64LE(offset);
  offset += 8;
  const expiryTs = data.readBigInt64LE(offset);
  offset += 8;
  const status = data.readUInt8(offset);

  return {
    paymentId,
    senderPubkey,
    receiverPhoneHash,
    tokenMint,
    amount,
    feeAmount,
    expiryTs,
    status,
  };
}

function decodeEscrowConfig(data: Buffer): DecodedEscrowConfig {
  if (!data.subarray(0, 8).equals(ESCROW_CONFIG_DISCRIMINATOR)) {
    throw new Error("Escrow config discriminator mismatch");
  }

  if (data.length < 8 + 32 + 32 + 2 + 8 + 1) {
    if (data.length < 8 + 32) {
      throw new Error(`Escrow config account is too small to decode: ${data.length} bytes`);
    }

    let legacyOffset = 8;
    const claimVerifier = new PublicKey(data.subarray(legacyOffset, legacyOffset + 32));
    legacyOffset += 32;
    const bump = data.length > legacyOffset ? data.readUInt8(legacyOffset) : 0;

    return {
      claimVerifier,
      treasuryOwner: PublicKey.default,
      feeBps: 0,
      feeCap: 0n,
      bump,
      layout: "legacy",
    };
  }

  let offset = 8;
  const claimVerifier = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const treasuryOwner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const feeBps = data.readUInt16LE(offset);
  offset += 2;
  const feeCap = data.readBigUInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    claimVerifier,
    treasuryOwner,
    feeBps,
    feeCap,
    bump,
    layout: "current",
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
    treasuryOwner: decoded.layout === "current" ? decoded.treasuryOwner.toBase58() : null,
    feeBps: decoded.feeBps,
    feeCap: decoded.feeCap.toString(),
    bump: decoded.bump,
    layout: decoded.layout,
  };
}

export async function initializeEscrowConfig() {
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const feeConfig = getEscrowFeeConfig();
  const allowedTokens = parseAllowedTokens();
  const feeCapDecimals = allowedTokens[0]?.decimals ?? 6;
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
    new PublicKey(feeConfig.treasuryOwner).toBuffer(),
    encodeU16(feeConfig.feeBps),
    encodeU64(toBaseUnits(feeConfig.feeCapUiAmount, feeCapDecimals)),
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
    treasuryOwner: feeConfig.treasuryOwner,
    feeBps: feeConfig.feeBps,
    feeCapUiAmount: feeConfig.feeCapUiAmount,
  });

  return configPda.toBase58();
}

export async function updateEscrowConfig() {
  const connection = getConnection();
  const authority = getEscrowAuthorityKeypair();
  const feeConfig = getEscrowFeeConfig();
  const allowedTokens = parseAllowedTokens();
  const feeCapDecimals = allowedTokens[0]?.decimals ?? 6;
  const configPda = getConfigPda();
  const existing = await connection.getAccountInfo(configPda, "confirmed");

  if (!existing) {
    throw new Error("Escrow config is not initialized. Run escrow:init-config first.");
  }

  const current = decodeEscrowConfig(existing.data);
  if (current.layout === "legacy") {
    throw new Error(
      `Escrow config ${configPda.toBase58()} uses a legacy layout from the older program version. Deploy the upgraded program successfully, then use a fresh program ID or add a migration/realloc path before updating treasury and fee settings.`,
    );
  }
  const targetClaimVerifier = authority.publicKey.toBase58();
  const targetTreasuryOwner = new PublicKey(feeConfig.treasuryOwner).toBase58();
  const targetFeeBps = feeConfig.feeBps;
  const targetFeeCap = toBaseUnits(feeConfig.feeCapUiAmount, feeCapDecimals);

  if (
    current.claimVerifier.toBase58() === targetClaimVerifier &&
    current.treasuryOwner.toBase58() === targetTreasuryOwner &&
    current.feeBps === targetFeeBps &&
    current.feeCap === targetFeeCap
  ) {
    logger.info("solana.escrow_config_already_matches_target", {
      config: configPda.toBase58(),
      claimVerifier: targetClaimVerifier,
      treasuryOwner: targetTreasuryOwner,
      feeBps: targetFeeBps,
      feeCapUiAmount: feeConfig.feeCapUiAmount,
    });
    return configPda.toBase58();
  }

  const data = Buffer.concat([
    instructionDiscriminator("update_config"),
    authority.publicKey.toBuffer(),
    new PublicKey(feeConfig.treasuryOwner).toBuffer(),
    encodeU16(feeConfig.feeBps),
    encodeU64(targetFeeCap),
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
    treasuryOwner: targetTreasuryOwner,
    feeBps: targetFeeBps,
    feeCapUiAmount: feeConfig.feeCapUiAmount,
  });

  return configPda.toBase58();
}

async function requireEscrowConfigInitialized() {
  const configPda = getConfigPda();
  const initialized = await isEscrowConfigInitialized();
  if (!initialized) {
    throw new Error(
      `Escrow config is not initialized. Run the one-time config init with verifier ${getEscrowVerifierPublicKey()} before claiming.`,
    );
  }

  return configPda;
}

async function findSenderTokenAccount(params: {
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

  const requiredAmount = params.amount;
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
    .filter((entry) => Number.isFinite(entry.balance) && entry.balance >= requiredAmount)
    .sort((left, right) => right.balance - left.balance);

  return matching[0]?.address ?? null;
}

function toBaseUnits(amount: number, decimals: number) {
  return BigInt(Math.round(amount * 10 ** decimals));
}

function fromBaseUnits(amount: bigint, decimals: number) {
  return Number(amount) / 10 ** decimals;
}

function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL;
}

function roundToDecimals(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function roundUpToDecimals(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.ceil(value * multiplier) / multiplier;
}

async function estimateTransactionFeeLamports(connection: Connection, transaction: Transaction) {
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
  return fee.value ?? 0;
}

async function getTokenAndSolUsdPrices(tokenSymbol: string) {
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

async function buildCreatePaymentTransaction(params: {
  connection: Connection;
  paymentId: string;
  senderWallet: string;
  phoneHash: string;
  amount: number;
  tokenMintAddress: string;
  feeAmountBaseUnits: bigint;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  const configPda = await requireEscrowConfigInitialized();
  const sender = new PublicKey(params.senderWallet);
  const mint = new PublicKey(params.tokenMintAddress);
  const senderTokenAccount = await findSenderTokenAccount({
    connection: params.connection,
    owner: sender,
    mint,
    amount: params.amount,
  });

  if (!senderTokenAccount) {
    throw new Error("No supported token account with enough balance was found for the selected mint");
  }

  const paymentAccount = getPaymentAccountPda(params.paymentId);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const escrowVault = Keypair.generate();
  const latestBlockhash = await params.connection.getLatestBlockhash("confirmed");
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7);
  const data = Buffer.concat([
    instructionDiscriminator("create_payment"),
    paymentIdToSeed(params.paymentId),
    phoneHashHexToBytes(params.phoneHash),
    encodeU64(toBaseUnits(params.amount, tokenConfig.decimals)),
    encodeU64(params.feeAmountBaseUnits),
    encodeI64(expiryTs),
  ]);

  const transaction = new Transaction({
    feePayer: sender,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: escrowVault.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    }),
  );

  transaction.partialSign(escrowVault);

  return {
    tokenConfig,
    paymentAccount,
    vaultAuthority,
    escrowVault,
    transaction,
  };
}

export async function estimateSenderTransferCost(params: {
  paymentId: string;
  senderWallet: string;
  phoneHash: string;
  amount: number;
  tokenMintAddress: string;
}): Promise<SenderTransferFeeEstimate> {
  if (env.SOLANA_MOCK_MODE) {
    return {
      networkFeeLamports: 0,
      accountRentLamports: 0,
      totalLamports: 0,
      networkFeeSol: 0,
      accountRentSol: 0,
      totalSol: 0,
      totalUsd: 0,
    };
  }

  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({
    connection,
    ...params,
    feeAmountBaseUnits: 0n,
  });
  const [networkFeeLamports, paymentAccountRentLamports, tokenAccountRentLamports, prices] = await Promise.all([
    estimateTransactionFeeLamports(connection, built.transaction),
    connection.getMinimumBalanceForRentExemption(PAYMENT_ACCOUNT_SPACE, "confirmed"),
    connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE, "confirmed"),
    getTokenAndSolUsdPrices(built.tokenConfig.symbol),
  ]);

  const accountRentLamports = paymentAccountRentLamports + tokenAccountRentLamports;
  const totalLamports = networkFeeLamports + accountRentLamports;
  const totalSol = lamportsToSol(totalLamports);

  return {
    networkFeeLamports,
    accountRentLamports,
    totalLamports,
    networkFeeSol: lamportsToSol(networkFeeLamports),
    accountRentSol: lamportsToSol(accountRentLamports),
    totalSol,
    totalUsd: prices.solUsd != null ? roundToDecimals(totalSol * prices.solUsd, 6) : null,
  };
}

async function buildClaimTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  senderWallet: string;
  receiverWallet: string;
  receiverPhoneHash: string;
  tokenMintAddress: string;
  feeAmountBaseUnits: bigint;
}) {
  const configPda = await requireEscrowConfigInitialized();
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const feeConfig = getEscrowFeeConfig();
  const mint = new PublicKey(params.tokenMintAddress);
  const receiverOwner = new PublicKey(params.receiverWallet);
  const receiverTokenAccount = splToken.getAssociatedTokenAddressSync(mint, receiverOwner);
  const treasuryOwner = new PublicKey(feeConfig.treasuryOwner);
  const treasuryTokenAccount = splToken.getAssociatedTokenAddressSync(mint, treasuryOwner);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const senderMainAccount = new PublicKey(params.senderWallet);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const [receiverAtaInfo, treasuryAtaInfo] = await Promise.all([
    connection.getAccountInfo(receiverTokenAccount, "confirmed"),
    connection.getAccountInfo(treasuryTokenAccount, "confirmed"),
  ]);

  if (!receiverAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        receiverTokenAccount,
        receiverOwner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  if (!treasuryAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        treasuryTokenAccount,
        treasuryOwner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: escrowVault, isSigner: false, isWritable: true },
        { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: senderMainAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        instructionDiscriminator("claim_payment"),
        paymentIdToSeed(params.paymentId),
        phoneHashHexToBytes(params.receiverPhoneHash),
        encodeU64(params.feeAmountBaseUnits),
      ]),
    }),
  );

  return {
    connection,
    payer,
    transaction,
    receiverNeedsAta: !receiverAtaInfo,
    treasuryNeedsAta: !treasuryAtaInfo,
  };
}

export async function estimateClaimFee(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  senderWallet: string;
  receiverWallet: string;
  receiverPhoneHash: string;
  tokenMintAddress: string;
  amount: number;
}): Promise<ClaimFeeEstimate> {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    return {
      tokenSymbol: tokenConfig.symbol,
      tokenMintAddress: tokenConfig.mintAddress,
      feeAmountUi: 0,
      feeAmountBaseUnits: 0n,
      feeAmountUsd: 0,
      estimatedNetworkFeeLamports: 0,
      estimatedNetworkFeeSol: 0,
      estimatedNetworkFeeUsd: 0,
      markupAmountUi: 0,
      receiverAmountUi: params.amount,
      totalAmountUi: params.amount,
    };
  }

  const feeConfig = getEscrowFeeConfig();
  const built = await buildClaimTransaction({
    ...params,
    feeAmountBaseUnits: 0n,
  });
  const [transactionFeeLamports, tokenAccountRentLamports, prices] = await Promise.all([
    estimateTransactionFeeLamports(built.connection, built.transaction),
    built.connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE, "confirmed"),
    getTokenAndSolUsdPrices(tokenConfig.symbol),
  ]);

  const accountRentLamports =
    (built.receiverNeedsAta ? tokenAccountRentLamports : 0) +
    (built.treasuryNeedsAta ? tokenAccountRentLamports : 0);
  const totalLamports = transactionFeeLamports + accountRentLamports;
  const estimatedNetworkFeeSol = lamportsToSol(totalLamports);
  const estimatedNetworkFeeUsd =
    prices.solUsd != null ? roundToDecimals(estimatedNetworkFeeSol * prices.solUsd, 6) : null;

  const baseTokenFeeUi =
    estimatedNetworkFeeUsd != null && prices.tokenUsd != null && prices.tokenUsd > 0
      ? estimatedNetworkFeeUsd / prices.tokenUsd
      : 0;
  const markedUpTokenFeeUi = baseTokenFeeUi * (1 + feeConfig.feeBps / 10_000);
  const cappedTokenFeeUi =
    feeConfig.feeCapUiAmount > 0 ? Math.min(markedUpTokenFeeUi, feeConfig.feeCapUiAmount) : markedUpTokenFeeUi;
  const roundedFeeAmountUi = roundUpToDecimals(cappedTokenFeeUi, tokenConfig.decimals);
  const amountBaseUnits = toBaseUnits(params.amount, tokenConfig.decimals);
  let feeAmountBaseUnits = toBaseUnits(roundedFeeAmountUi, tokenConfig.decimals);

  if (feeAmountBaseUnits >= amountBaseUnits) {
    feeAmountBaseUnits = amountBaseUnits > 0n ? amountBaseUnits - 1n : 0n;
  }

  const feeAmountUi = fromBaseUnits(feeAmountBaseUnits, tokenConfig.decimals);
  const receiverAmountUi = Math.max(roundToDecimals(params.amount - feeAmountUi, tokenConfig.decimals), 0);

  return {
    tokenSymbol: tokenConfig.symbol,
    tokenMintAddress: tokenConfig.mintAddress,
    feeAmountUi,
    feeAmountBaseUnits,
    feeAmountUsd: prices.tokenUsd != null ? roundToDecimals(feeAmountUi * prices.tokenUsd, 6) : null,
    estimatedNetworkFeeLamports: totalLamports,
    estimatedNetworkFeeSol,
    estimatedNetworkFeeUsd,
    markupAmountUi: Math.max(roundToDecimals(feeAmountUi - baseTokenFeeUi, tokenConfig.decimals), 0),
    receiverAmountUi,
    totalAmountUi: params.amount,
  };
}

export async function prepareEscrowPayment(params: {
  paymentId: string;
  senderWallet: string;
  phoneHash: string;
  amount: number;
  tokenMintAddress: string;
}): Promise<{
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  serializedTransaction: string;
  mode: BlockchainExecutionMode;
  tokenSymbol: string;
}> {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    return {
      paymentId: params.paymentId,
      escrowAccount: Keypair.generate().publicKey.toBase58(),
      escrowVaultAddress: Keypair.generate().publicKey.toBase58(),
      serializedTransaction: Buffer.from("mock").toString("base64"),
      mode: "mock",
      tokenSymbol: tokenConfig.symbol,
    };
  }

  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({
    connection,
    ...params,
    feeAmountBaseUnits: 0n,
  });

  logger.info("solana.prepare_escrow_payment", {
    paymentId: params.paymentId,
    senderWallet: params.senderWallet,
    tokenMintAddress: params.tokenMintAddress,
    escrowAccount: built.paymentAccount.toBase58(),
    escrowVaultAddress: built.escrowVault.publicKey.toBase58(),
  });

  return {
    paymentId: params.paymentId,
    escrowAccount: built.paymentAccount.toBase58(),
    escrowVaultAddress: built.escrowVault.publicKey.toBase58(),
    serializedTransaction: built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    mode: "devnet",
    tokenSymbol: tokenConfig.symbol,
  };
}

export async function confirmEscrowPayment(params: {
  paymentId: string;
  senderWallet: string;
  phoneHash: string;
  amount: number;
  tokenMintAddress: string;
  depositSignature: string;
  escrowVaultAddress: string;
}): Promise<{
  escrowAccount: string;
  escrowVaultAddress: string;
  signature: string;
  mode: BlockchainExecutionMode;
  tokenSymbol: string;
  feeAmountUi: number;
}> {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    return {
      escrowAccount: getPaymentAccountPda(params.paymentId).toBase58(),
      escrowVaultAddress: params.escrowVaultAddress,
      signature: params.depositSignature,
      mode: "mock",
      tokenSymbol: tokenConfig.symbol,
      feeAmountUi: 0,
    };
  }

  const connection = getConnection();
  const paymentAccount = getPaymentAccountPda(params.paymentId);
  const transaction = await connection.getTransaction(params.depositSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction || transaction.meta?.err) {
    throw new Error("The escrow creation transaction could not be confirmed on-chain");
  }

  const accountInfo = await connection.getAccountInfo(paymentAccount, "confirmed");
  if (!accountInfo) {
    throw new Error("The escrow payment account was not created on-chain");
  }

  const decoded = decodePaymentAccount(accountInfo.data);
  const expectedAmount = toBaseUnits(params.amount, tokenConfig.decimals);

  if (decoded.senderPubkey.toBase58() !== params.senderWallet) {
    throw new Error("The on-chain sender does not match the connected wallet");
  }

  if (decoded.tokenMint.toBase58() !== params.tokenMintAddress) {
    throw new Error("The on-chain token mint does not match the selected allowlisted mint");
  }

  if (Buffer.compare(Buffer.from(decoded.receiverPhoneHash), phoneHashHexToBytes(params.phoneHash)) !== 0) {
    throw new Error("The on-chain receiver hash does not match the verified recipient");
  }

  if (decoded.amount !== expectedAmount) {
    throw new Error("The on-chain escrow amount does not match the requested amount");
  }

  return {
    escrowAccount: paymentAccount.toBase58(),
    escrowVaultAddress: params.escrowVaultAddress,
    signature: params.depositSignature,
    mode: "devnet",
    tokenSymbol: tokenConfig.symbol,
    feeAmountUi: Number(decoded.feeAmount) / 10 ** tokenConfig.decimals,
  };
}

export async function releaseEscrow(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  senderWallet: string;
  receiverWallet: string;
  receiverPhoneHash: string;
  tokenMintAddress: string;
  amount: number;
}): Promise<{ signature: TransactionSignature | null; mode: BlockchainExecutionMode; feeAmountUi: number }> {
  if (env.SOLANA_MOCK_MODE) {
    const signature = sha256(JSON.stringify({ action: "releaseEscrow", ...params })).slice(0, 64);
    logger.info("solana.mock.release_escrow", params);
    return { signature, mode: "mock", feeAmountUi: 0 };
  }

  const feeEstimate = await estimateClaimFee(params);
  const built = await buildClaimTransaction({
    ...params,
    feeAmountBaseUnits: feeEstimate.feeAmountBaseUnits,
  });

  const signature = await sendAndConfirmTransaction(built.connection, built.transaction, [built.payer], {
    commitment: "confirmed",
  });

  logger.info("solana.release_escrow", {
    paymentId: params.paymentId,
    escrowAccount: params.escrowAccount,
    escrowVaultAddress: params.escrowVaultAddress,
    receiverWallet: params.receiverWallet,
    tokenMintAddress: params.tokenMintAddress,
    feeAmountUi: feeEstimate.feeAmountUi,
    signature,
  });

  return { signature, mode: "devnet", feeAmountUi: feeEstimate.feeAmountUi };
}

export async function listSupportedWalletTokens(walletAddress: string): Promise<SupportedWalletToken[]> {
  const allowedTokens = parseAllowedTokens();
  const connection = getConnection();
  const owner = new PublicKey(walletAddress);

  if (allowedTokens.length === 0) {
    logger.warn("solana.wallet_tokens.no_allowlist", { walletAddress });
    return [];
  }

  const tokenBalances = new Map<string, SupportedWalletToken>();
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    owner,
    { programId: TOKEN_PROGRAM_ID },
    "confirmed",
  );

  for (const tokenAccount of tokenAccounts.value) {
    const parsedInfo = (tokenAccount.account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
    const mintAddress = typeof parsedInfo?.mint === "string" ? parsedInfo.mint : null;
    const tokenAmount = parsedInfo?.tokenAmount as { uiAmount?: number; uiAmountString?: string } | undefined;
    const balance = tokenAmount?.uiAmount ?? Number(tokenAmount?.uiAmountString ?? "0");
    const tokenConfig = mintAddress ? getAllowedTokenByMint(mintAddress) : null;

    if (!mintAddress || !tokenConfig || !Number.isFinite(balance) || balance <= 0) {
      continue;
    }

    const existing = tokenBalances.get(mintAddress);
    tokenBalances.set(mintAddress, {
      symbol: tokenConfig.symbol,
      name: tokenConfig.name,
      logo: tokenConfig.logo,
      mintAddress,
      supported: true,
      balance: Number(((existing?.balance ?? 0) + balance).toFixed(9)),
    });
  }

  const resolvedTokens = allowedTokens.map((token) => ({
    symbol: token.symbol,
    name: token.name,
    logo: token.logo,
    mintAddress: token.mintAddress,
    supported: true,
    balance: Number((tokenBalances.get(token.mintAddress)?.balance ?? 0).toFixed(9)),
  }));

  logger.info("solana.wallet_tokens.loaded", {
    walletAddress,
    tokenCount: resolvedTokens.length,
  });

  return resolvedTokens;
}


