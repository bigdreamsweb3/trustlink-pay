import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  type BlockchainExecutionMode,
  type ClaimFeeEstimate,
  type SenderTransferFeeEstimate,
  type SupportedWalletToken,
  TOKEN_ACCOUNT_SPACE,
  TOKEN_PROGRAM_ID,
  calculateFeeAmountUi,
  createDraftPaymentId,
  decodePaymentAccount,
  estimateTransactionFeeLamports,
  findSenderTokenAccount,
  fromBaseUnits,
  getAllowedTokenByMint,
  getConnection,
  getEscrowAuthorityKeypair,
  getEscrowConfigState,
  getIdentityBindingPda,
  getPaymentAccountPda,
  getProgramId,
  getTokenAndSolUsdPrices,
  getVaultAuthorityPda,
  instructionDiscriminator,
  lamportsToSol,
  parseAllowedTokens,
  paymentIdToSeed,
  identityPublicKeyToBytes,
  requireEscrowConfigInitialized,
  roundToDecimals,
  roundUpToDecimals,
  toBaseUnits,
} from "@/app/blockchain/solana-core";
import {
  estimateTsnClaimNetworkFeeLamports,
  getTsnIntentPda,
  getTsnMotherEscrowPda,
  sha256Bytes,
} from "../../../tsn/src/blockchain/solana-tsn";
import { quoteTransferFeeUiAmount } from "../../../tsn/src";

const splToken = require("@solana/spl-token") as {
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

function encodeU64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function encodeI64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getConfirmedTransactionWithRetry(connection: Connection, signature: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (transaction) {
      return transaction;
    }

    await sleep(750);
  }

  return null;
}

async function getAccountInfoWithRetry(connection: Connection, account: PublicKey) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const accountInfo = await connection.getAccountInfo(account, "confirmed");

    if (accountInfo) {
      return accountInfo;
    }

    await sleep(750);
  }

  return null;
}

type ActiveEscrowFeePolicy = {
  sendFeeBps: number;
  sendFeeMaxUiAmount: number;
  sendFeeMaxUsd: number;
  claimFeeBps: number;
  claimFeeMaxUiAmount: number;
  claimFeeMaxUsd: number;
  feeCoverageTxCount: number;
};

async function getActiveEscrowFeePolicy(): Promise<ActiveEscrowFeePolicy> {
  const config = await getEscrowConfigState();
  if (!config?.treasuryOwner) {
    throw new Error("Escrow config is not initialized on-chain. Fee policy must come from program config.");
  }

  return {
    sendFeeBps: config.sendFeeBps,
    sendFeeMaxUiAmount: config.sendFeeMaxUiAmount,
    sendFeeMaxUsd: config.sendFeeMaxUsd,
    claimFeeBps: config.claimFeeBps,
    claimFeeMaxUiAmount: config.claimFeeMaxUiAmount,
    claimFeeMaxUsd: config.claimFeeMaxUsd,
    feeCoverageTxCount: config.feeCoverageTxCount,
  };
}

function getSenderFeeAmountUiFromPolicy(
  policy: ActiveEscrowFeePolicy,
  amount: number,
  decimals: number,
) {
  return calculateFeeAmountUi({
    amount,
    decimals,
    basisPoints: policy.sendFeeBps,
    maxUiAmount: policy.sendFeeMaxUiAmount,
  });
}

async function ensureAssociatedTokenAccount(params: {
  connection: Connection;
  transaction: Transaction;
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}) {
  const ata = splToken.getAssociatedTokenAddressSync(params.mint, params.owner);
  const existing = await params.connection.getAccountInfo(ata, "confirmed");
  if (!existing) {
    params.transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        params.payer,
        ata,
        params.owner,
        params.mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  return ata;
}

async function buildCreatePaymentTransaction(params: {
  connection: Connection;
  paymentId: string;
  senderWallet: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  paymentMode: "secure" | "invite";
  amount: number;
  tokenMintAddress: string;
  expiryUnixSeconds: number;
  senderFeeAmountUiOverride?: number;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  const configPda = await requireEscrowConfigInitialized();
  const feePolicy = await getActiveEscrowFeePolicy();
  const payer = getEscrowAuthorityKeypair();
  const sender = new PublicKey(params.senderWallet);
  const mint = new PublicKey(params.tokenMintAddress);
  const senderFeeAmountUi =
    params.senderFeeAmountUiOverride ?? getSenderFeeAmountUiFromPolicy(feePolicy, params.amount, tokenConfig.decimals);
  const senderFeeAmountBaseUnits = toBaseUnits(senderFeeAmountUi, tokenConfig.decimals);
  const senderTokenAccount = await findSenderTokenAccount({
    connection: params.connection,
    owner: sender,
    mint,
    amount: roundToDecimals(params.amount + senderFeeAmountUi, tokenConfig.decimals),
  });

  if (!senderTokenAccount) {
    throw new Error("No supported token account with enough balance was found for the selected mint");
  }

  const paymentAccount = getPaymentAccountPda(params.paymentId);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const escrowVault = Keypair.generate();
  const latestBlockhash = await params.connection.getLatestBlockhash("confirmed");
  const data = Buffer.concat([
    instructionDiscriminator("create_payment"),
    paymentIdToSeed(params.paymentId),
    identityPublicKeyToBytes(params.phoneIdentityPublicKey),
    identityPublicKeyToBytes(params.paymentReceiverPublicKey),
    Buffer.from([params.paymentMode === "invite" ? 1 : 0]),
    encodeU64(toBaseUnits(params.amount, tokenConfig.decimals)),
    encodeU64(senderFeeAmountBaseUnits),
    encodeI64(BigInt(params.expiryUnixSeconds)),
  ]);

  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  const treasuryOwnerRaw = (await getEscrowConfigState())?.treasuryOwner;
  if (!treasuryOwnerRaw) {
    throw new Error("Escrow treasury owner missing in on-chain config");
  }
  const treasuryOwner = new PublicKey(treasuryOwnerRaw);
  const treasuryTokenAccount = await ensureAssociatedTokenAccount({
    connection: params.connection,
    transaction,
    payer: payer.publicKey,
    owner: treasuryOwner,
    mint,
  });

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
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

  transaction.partialSign(payer, escrowVault);

  return {
    tokenConfig,
    senderFeeAmountUi,
    senderFeeAmountBaseUnits,
    paymentAccount,
    escrowVault,
    treasuryTokenAccount: treasuryTokenAccount.toBase58(),
    transaction,
  };
}

export async function estimateSenderTransferCost(params: {
  paymentId: string;
  senderWallet: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  paymentMode: "secure" | "invite";
  amount: number;
  tokenMintAddress: string;
  expiryUnixSeconds: number;
  receiverWallet?: string | null;
  bindingPhoneIdentityPublicKey?: string | null;
}): Promise<SenderTransferFeeEstimate> {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }
  const feePolicy = await getActiveEscrowFeePolicy();

  if (env.SOLANA_MOCK_MODE) {
    const senderFeeAmountUi = getSenderFeeAmountUiFromPolicy(feePolicy, params.amount, tokenConfig.decimals);
    const totalTokenRequiredUi = roundToDecimals(params.amount + senderFeeAmountUi, tokenConfig.decimals);
    return {
      tokenSymbol: tokenConfig.symbol,
      tokenMintAddress: tokenConfig.mintAddress,
      senderFeeAmountUi,
      senderFeeAmountUsd: 0,
      totalTokenRequiredUi,
      estimatedNetworkFeeLamports: 0,
      networkFeeSol: 0,
      networkFeeUsd: 0,
    };
  }

  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({ connection, ...params, senderFeeAmountUiOverride: 0 });
  const [createNetworkFeeLamports, prices] = await Promise.all([
    estimateTransactionFeeLamports(connection, built.transaction),
    getTokenAndSolUsdPrices(built.tokenConfig.symbol),
  ]);

  const networkFeeLamports = createNetworkFeeLamports;
  const networkFeeSol = lamportsToSol(networkFeeLamports);
  const networkFeeUsd = prices.solUsd != null ? roundToDecimals(networkFeeSol * prices.solUsd, 6) : null;
  const senderFeeAmountUi = quoteTransferFeeUiAmount({
    estimatedNetworkFeeLamports: networkFeeLamports,
    solUsd: prices.solUsd,
    tokenUsd: prices.tokenUsd,
    tokenDecimals: built.tokenConfig.decimals,
    coverageTxCount: feePolicy.feeCoverageTxCount,
    feeBps: feePolicy.sendFeeBps,
    maxMarginUsd: feePolicy.sendFeeMaxUsd,
    maxUiAmount: feePolicy.sendFeeMaxUiAmount,
  });
  const senderFeeAmountUsd =
    prices.tokenUsd != null ? roundToDecimals(senderFeeAmountUi * prices.tokenUsd, 6) : null;
  const totalTokenRequiredUi = roundToDecimals(params.amount + senderFeeAmountUi, tokenConfig.decimals);

  return {
    tokenSymbol: built.tokenConfig.symbol,
    tokenMintAddress: built.tokenConfig.mintAddress,
    senderFeeAmountUi,
    senderFeeAmountUsd,
    totalTokenRequiredUi,
    estimatedNetworkFeeLamports: networkFeeLamports,
    networkFeeSol,
    networkFeeUsd,
  };
}

async function buildClaimTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  receiverWallet: string;
  paymentPhoneIdentityPublicKey: string;
  bindingPhoneIdentityPublicKey: string;
  paymentReceiverPublicKey?: string | null;
  paymentMode: "secure" | "invite";
  tokenMintAddress: string;
  recoveryWallet?: string | null;
  claimFeeAmountUi?: number;
}) {
  const configPda = await requireEscrowConfigInitialized();
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const feePolicy = await getActiveEscrowFeePolicy();
  const mint = new PublicKey(params.tokenMintAddress);
  const receiverOwner = new PublicKey(params.receiverWallet);
  const receiverTokenAccount = splToken.getAssociatedTokenAddressSync(mint, receiverOwner);
  const claimFeeAmountBaseUnits = toBaseUnits(params.claimFeeAmountUi ?? 0, getAllowedTokenByMint(params.tokenMintAddress)!.decimals);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const identityBinding = getIdentityBindingPda(params.bindingPhoneIdentityPublicKey);
  const receiverAuthority = params.paymentReceiverPublicKey ? new PublicKey(params.paymentReceiverPublicKey) : null;
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const receiverAtaInfo = await connection.getAccountInfo(receiverTokenAccount, "confirmed");
  const bindingInfo = await connection.getAccountInfo(identityBinding, "confirmed");
  const treasuryOwnerRaw = (await getEscrowConfigState())?.treasuryOwner;
  if (!treasuryOwnerRaw) {
    throw new Error("Escrow treasury owner missing in on-chain config");
  }
  const treasuryOwner = new PublicKey(treasuryOwnerRaw);
  const expectedTreasuryTokenAccount = splToken.getAssociatedTokenAddressSync(mint, treasuryOwner);
  const treasuryAtaInfo = await connection.getAccountInfo(expectedTreasuryTokenAccount, "confirmed");

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
  const treasuryTokenAccount = await ensureAssociatedTokenAccount({
    connection,
    transaction,
    payer: payer.publicKey,
    owner: treasuryOwner,
    mint,
  });

  const secureBindingKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: receiverAuthority!, isSigner: true, isWritable: false },
    { pubkey: receiverOwner, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: paymentAccount, isSigner: false, isWritable: true },
    { pubkey: identityBinding, isSigner: false, isWritable: false },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: escrowVault, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
    { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const secureFirstBindKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: receiverAuthority!, isSigner: true, isWritable: false },
    { pubkey: receiverOwner, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: paymentAccount, isSigner: false, isWritable: true },
    { pubkey: identityBinding, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: escrowVault, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
    { pubkey: receiverOwner, isSigner: false, isWritable: false },
    { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const inviteBindingKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: receiverOwner, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: paymentAccount, isSigner: false, isWritable: true },
    { pubkey: identityBinding, isSigner: false, isWritable: false },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: escrowVault, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
    { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const inviteFirstBindKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: receiverOwner, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: paymentAccount, isSigner: false, isWritable: true },
    { pubkey: identityBinding, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: escrowVault, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
    { pubkey: receiverOwner, isSigner: false, isWritable: false },
    { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const secureInstruction = bindingInfo ? "claim_payment" : "claim_and_bind_first_wallet";
  const inviteInstruction = bindingInfo ? "claim_invite_payment" : "claim_invite_and_bind_first_wallet";
  const secureData = bindingInfo
    ? Buffer.concat([
        instructionDiscriminator(secureInstruction),
        paymentIdToSeed(params.paymentId),
        identityPublicKeyToBytes(params.paymentPhoneIdentityPublicKey),
        identityPublicKeyToBytes(params.paymentReceiverPublicKey!),
        encodeU64(claimFeeAmountBaseUnits),
      ])
    : Buffer.concat([
        instructionDiscriminator(secureInstruction),
        paymentIdToSeed(params.paymentId),
        identityPublicKeyToBytes(params.paymentPhoneIdentityPublicKey),
        identityPublicKeyToBytes(params.bindingPhoneIdentityPublicKey),
        identityPublicKeyToBytes(params.paymentReceiverPublicKey!),
        encodeU64(claimFeeAmountBaseUnits),
      ]);
  const inviteData = bindingInfo
    ? Buffer.concat([
        instructionDiscriminator(inviteInstruction),
        paymentIdToSeed(params.paymentId),
        identityPublicKeyToBytes(params.paymentPhoneIdentityPublicKey),
        encodeU64(claimFeeAmountBaseUnits),
      ])
    : Buffer.concat([
        instructionDiscriminator(inviteInstruction),
        paymentIdToSeed(params.paymentId),
        identityPublicKeyToBytes(params.paymentPhoneIdentityPublicKey),
        identityPublicKeyToBytes(params.bindingPhoneIdentityPublicKey),
        encodeU64(claimFeeAmountBaseUnits),
      ]);

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys:
        params.paymentMode === "invite"
          ? bindingInfo
            ? inviteBindingKeys
            : inviteFirstBindKeys
          : bindingInfo
            ? secureBindingKeys
            : secureFirstBindKeys,
      data: params.paymentMode === "invite" ? inviteData : secureData,
    }),
  );

  return {
    connection,
    payer,
    transaction,
    receiverNeedsAta: !receiverAtaInfo,
    treasuryNeedsAta: !treasuryAtaInfo,
    hasBinding: Boolean(bindingInfo),
    receiverTokenAccount: receiverTokenAccount.toBase58(),
  };
}

export async function estimateClaimFee(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  receiverWallet: string;
  paymentPhoneIdentityPublicKey: string;
  bindingPhoneIdentityPublicKey: string;
  paymentReceiverPublicKey?: string | null;
  paymentMode: "secure" | "invite";
  tokenMintAddress: string;
  amount: number;
  recoveryWallet?: string | null;
}): Promise<ClaimFeeEstimate> {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }
  const feeAmountUi = 0;
  const feeAmountBaseUnits = toBaseUnits(feeAmountUi, tokenConfig.decimals);
  const receiverFullAmountUi = roundToDecimals(params.amount, tokenConfig.decimals);
  const totalAmountUi = roundToDecimals(params.amount, tokenConfig.decimals);

  if (env.SOLANA_MOCK_MODE) {
    return {
      tokenSymbol: tokenConfig.symbol,
      tokenMintAddress: tokenConfig.mintAddress,
      feeAmountUi,
      feeAmountBaseUnits,
      feeAmountUsd: 0,
      estimatedNetworkFeeLamports: 0,
      estimatedNetworkFeeSol: 0,
      estimatedNetworkFeeUsd: 0,
      markupAmountUi: feeAmountUi,
      receiverAmountUi: receiverFullAmountUi,
      totalAmountUi,
    };
  }

  if (env.TSN_ENABLED) {
    const feePolicy = await getActiveEscrowFeePolicy();
    const motherEscrow = getTsnMotherEscrowPda();
    const intent = getTsnIntentPda({
      motherEscrow,
      intentSeed32: sha256Bytes(params.paymentId),
    });
    const [estimatedNetworkFeeLamports, prices] = await Promise.all([
      estimateTsnClaimNetworkFeeLamports({
        intent,
        tokenMint: new PublicKey(params.tokenMintAddress),
        recipientWallet: new PublicKey(params.receiverWallet),
      }),
      getTokenAndSolUsdPrices(tokenConfig.symbol),
    ]);
    const feeAmountUi = quoteTransferFeeUiAmount({
      estimatedNetworkFeeLamports,
      solUsd: prices.solUsd,
      tokenUsd: prices.tokenUsd,
      tokenDecimals: tokenConfig.decimals,
      coverageTxCount: feePolicy.feeCoverageTxCount,
      feeBps: feePolicy.claimFeeBps,
      maxMarginUsd: feePolicy.claimFeeMaxUsd,
      maxUiAmount: feePolicy.claimFeeMaxUiAmount,
    });
    const feeAmountBaseUnits = toBaseUnits(feeAmountUi, tokenConfig.decimals);
    const receiverAmountUi = roundToDecimals(Math.max(params.amount - feeAmountUi, 0), tokenConfig.decimals);
    const estimatedNetworkFeeSol = lamportsToSol(estimatedNetworkFeeLamports);
    const estimatedNetworkFeeUsd =
      prices.solUsd != null ? roundToDecimals(estimatedNetworkFeeSol * prices.solUsd, 6) : null;
    const feeAmountUsd = prices.tokenUsd != null ? roundToDecimals(feeAmountUi * prices.tokenUsd, 6) : null;

    return {
      tokenSymbol: tokenConfig.symbol,
      tokenMintAddress: tokenConfig.mintAddress,
      feeAmountUi,
      feeAmountBaseUnits,
      feeAmountUsd,
      estimatedNetworkFeeLamports,
      estimatedNetworkFeeSol,
      estimatedNetworkFeeUsd,
      markupAmountUi: feeAmountUi,
      receiverAmountUi,
      totalAmountUi,
    };
  }

  const built = await buildClaimTransaction(params);
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
  const feePolicy = await getActiveEscrowFeePolicy();
  const dynamicFeeAmountUi = quoteTransferFeeUiAmount({
    estimatedNetworkFeeLamports: totalLamports,
    solUsd: prices.solUsd,
    tokenUsd: prices.tokenUsd,
    tokenDecimals: tokenConfig.decimals,
    coverageTxCount: feePolicy.feeCoverageTxCount,
    feeBps: feePolicy.claimFeeBps,
    maxMarginUsd: feePolicy.claimFeeMaxUsd,
    maxUiAmount: feePolicy.claimFeeMaxUiAmount,
  });
  const dynamicFeeAmountBaseUnits = toBaseUnits(dynamicFeeAmountUi, tokenConfig.decimals);
  const receiverAmountUi = roundToDecimals(Math.max(params.amount - dynamicFeeAmountUi, 0), tokenConfig.decimals);
  const feeAmountUsd = prices.tokenUsd != null ? roundToDecimals(dynamicFeeAmountUi * prices.tokenUsd, 6) : null;

  return {
    tokenSymbol: tokenConfig.symbol,
    tokenMintAddress: tokenConfig.mintAddress,
    feeAmountUi: dynamicFeeAmountUi,
    feeAmountBaseUnits: dynamicFeeAmountBaseUnits,
    feeAmountUsd,
    estimatedNetworkFeeLamports: totalLamports,
    estimatedNetworkFeeSol,
    estimatedNetworkFeeUsd,
    markupAmountUi: dynamicFeeAmountUi,
    receiverAmountUi,
    totalAmountUi,
  };
}

export async function prepareEscrowPayment(params: {
  paymentId: string;
  senderWallet: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  paymentMode: "secure" | "invite";
  amount: number;
  tokenMintAddress: string;
  expiryUnixSeconds: number;
  receiverWallet?: string | null;
  bindingPhoneIdentityPublicKey?: string | null;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    const feeEstimate = await estimateSenderTransferCost(params);
    return {
      paymentId: params.paymentId,
      escrowAccount: Keypair.generate().publicKey.toBase58(),
      escrowVaultAddress: Keypair.generate().publicKey.toBase58(),
      serializedTransaction: Buffer.from("mock").toString("base64"),
      mode: "mock" as const,
      tokenSymbol: tokenConfig.symbol,
      senderFeeAmountUi: feeEstimate.senderFeeAmountUi,
      totalTokenRequiredUi: feeEstimate.totalTokenRequiredUi,
    };
  }

  const feeEstimate = await estimateSenderTransferCost(params);
  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({
    connection,
    ...params,
    senderFeeAmountUiOverride: feeEstimate.senderFeeAmountUi,
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
    mode: "devnet" as const,
    tokenSymbol: tokenConfig.symbol,
    senderFeeAmountUi: feeEstimate.senderFeeAmountUi,
    totalTokenRequiredUi: feeEstimate.totalTokenRequiredUi,
  };
}

export async function confirmEscrowPayment(params: {
  paymentId: string;
  senderWallet: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  amount: number;
  tokenMintAddress: string;
  depositSignature: string;
  escrowVaultAddress: string;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    const feePolicy = await getActiveEscrowFeePolicy();
    const senderFeeAmountUi = getSenderFeeAmountUiFromPolicy(feePolicy, params.amount, tokenConfig.decimals);
    return {
      escrowAccount: getPaymentAccountPda(params.paymentId).toBase58(),
      escrowVaultAddress: params.escrowVaultAddress,
      signature: params.depositSignature,
      mode: "mock" as const,
      tokenSymbol: tokenConfig.symbol,
      senderFeeAmountUi,
      claimFeeAmountUi: 0,
      expiryAt: null,
    };
  }

  const connection = getConnection();
  const paymentAccount = getPaymentAccountPda(params.paymentId);
  const transaction = await getConfirmedTransactionWithRetry(connection, params.depositSignature);

  if (!transaction || transaction.meta?.err) {
    throw new Error("The escrow creation transaction could not be confirmed on-chain");
  }

  const accountInfo = await getAccountInfoWithRetry(connection, paymentAccount);
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

  if (decoded.phoneIdentityPublicKey.toBase58() !== params.phoneIdentityPublicKey) {
    throw new Error("The on-chain receiver identity does not match the verified recipient");
  }
  if (decoded.paymentReceiverPublicKey.toBase58() !== params.paymentReceiverPublicKey) {
    throw new Error("The on-chain stealth receiver address does not match the derived recipient route");
  }

  if (decoded.amount !== expectedAmount) {
    throw new Error("The on-chain escrow amount does not match the requested amount");
  }

  const senderFeeAmountUi =
    decoded.senderFeeAmount != null
      ? fromBaseUnits(decoded.senderFeeAmount, tokenConfig.decimals)
      : (() => {
          throw new Error("Sender fee amount is missing on-chain for this payment account");
        })();

  return {
    escrowAccount: paymentAccount.toBase58(),
    escrowVaultAddress: params.escrowVaultAddress,
    signature: params.depositSignature,
    mode: "devnet" as const,
    tokenSymbol: tokenConfig.symbol,
    senderFeeAmountUi,
    claimFeeAmountUi: 0,
    expiryAt: new Date(Number(decoded.expiryTs) * 1000).toISOString(),
  };
}

export async function prepareEscrowClaim(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  receiverWallet: string;
  paymentPhoneIdentityPublicKey: string;
  bindingPhoneIdentityPublicKey: string;
  paymentReceiverPublicKey?: string | null;
  paymentMode: "secure" | "invite";
  tokenMintAddress: string;
  amount: number;
  recoveryWallet?: string | null;
}): Promise<{
  serializedTransaction: string;
  rpcUrl: string;
  programId: string;
  mode: BlockchainExecutionMode;
  feeAmountUi: number;
  preview: {
    escrowAccount: string;
    escrowVaultAddress: string;
    settlementWallet: string;
    settlementTokenAccount: string;
    paymentReceiverPublicKey: string | null;
    amount: number;
    tokenMintAddress: string;
  };
}> {
  if (env.SOLANA_MOCK_MODE) {
    logger.info("solana.mock.prepare_claim", params);
    return {
      serializedTransaction: Buffer.from(JSON.stringify(params)).toString("base64"),
      rpcUrl: env.SOLANA_RPC_URL ?? "mock",
      programId: getProgramId().toBase58(),
      mode: "mock",
      feeAmountUi: 0,
      preview: {
        escrowAccount: params.escrowAccount,
        escrowVaultAddress: params.escrowVaultAddress,
        settlementWallet: params.receiverWallet,
        settlementTokenAccount: params.receiverWallet,
        paymentReceiverPublicKey: params.paymentReceiverPublicKey ?? null,
        amount: params.amount,
        tokenMintAddress: params.tokenMintAddress,
      },
    };
  }

  const feeEstimate = await estimateClaimFee(params);
  const built = await buildClaimTransaction({
    ...params,
    claimFeeAmountUi: feeEstimate.feeAmountUi,
  });

  built.transaction.partialSign(built.payer);
  logger.info("solana.prepare_claim", {
    paymentId: params.paymentId,
    escrowAccount: params.escrowAccount,
    escrowVaultAddress: params.escrowVaultAddress,
    receiverWallet: params.receiverWallet,
    tokenMintAddress: params.tokenMintAddress,
    feeAmountUi: feeEstimate.feeAmountUi,
  });

  return {
    serializedTransaction: built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
    programId: getProgramId().toBase58(),
    mode: "devnet",
    feeAmountUi: feeEstimate.feeAmountUi,
    preview: {
      escrowAccount: params.escrowAccount,
      escrowVaultAddress: params.escrowVaultAddress,
      settlementWallet: params.receiverWallet,
      settlementTokenAccount: built.receiverTokenAccount,
      paymentReceiverPublicKey: params.paymentReceiverPublicKey ?? null,
      amount: params.amount,
      tokenMintAddress: params.tokenMintAddress,
    },
  };
}

async function buildMarkExpiredTransaction(params: {
  paymentId: string;
}) {
  const configPda = await requireEscrowConfigInitialized();
  const connection = getConnection();
  const verifier = getEscrowAuthorityKeypair();
  const paymentAccount = getPaymentAccountPda(params.paymentId);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: verifier.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: verifier.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([instructionDiscriminator("mark_expired"), paymentIdToSeed(params.paymentId)]),
    }),
  );

  return { connection, verifier, transaction };
}

export async function markPaymentExpiredOnChain(params: {
  paymentId: string;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { signature: "mock-expired", mode: "mock" as const };
  }

  const built = await buildMarkExpiredTransaction(params);
  const signature = await sendAndConfirmTransaction(built.connection, built.transaction, [built.verifier], {
    commitment: "confirmed",
  });

  return {
    signature,
    mode: "devnet" as const,
  };
}

async function buildExpiredRefundClaimTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  senderWallet: string;
  tokenMintAddress: string;
}) {
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const mint = new PublicKey(params.tokenMintAddress);
  const sender = new PublicKey(params.senderWallet);
  const senderRefundTokenAccount = splToken.getAssociatedTokenAddressSync(mint, sender);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const senderAtaInfo = await connection.getAccountInfo(senderRefundTokenAccount, "confirmed");
  if (!senderAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        senderRefundTokenAccount,
        sender,
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
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: escrowVault, isSigner: false, isWritable: true },
        { pubkey: senderRefundTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([instructionDiscriminator("refund_expired_payment"), paymentIdToSeed(params.paymentId)]),
    }),
  );

  return {
    connection,
    payer,
    transaction,
    senderRefundTokenAccount: senderRefundTokenAccount.toBase58(),
    senderNeedsAta: !senderAtaInfo,
  };
}

export async function prepareExpiredRefundClaim(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  senderWallet: string;
  tokenMintAddress: string;
  amount: number;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return {
      serializedTransaction: Buffer.from(JSON.stringify(params)).toString("base64"),
      rpcUrl: env.SOLANA_RPC_URL ?? "mock",
      programId: getProgramId().toBase58(),
      mode: "mock" as const,
      feeAmountUi: 0,
      preview: {
        escrowAccount: params.escrowAccount,
        escrowVaultAddress: params.escrowVaultAddress,
        settlementWallet: params.senderWallet,
        settlementTokenAccount: params.senderWallet,
        paymentReceiverPublicKey: null,
        amount: params.amount,
        tokenMintAddress: params.tokenMintAddress,
      },
    };
  }

  const built = await buildExpiredRefundClaimTransaction(params);
  built.transaction.partialSign(built.payer);

  return {
    serializedTransaction: built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
    programId: getProgramId().toBase58(),
    mode: "devnet" as const,
    feeAmountUi: 0,
    preview: {
      escrowAccount: params.escrowAccount,
      escrowVaultAddress: params.escrowVaultAddress,
      settlementWallet: params.senderWallet,
      settlementTokenAccount: built.senderRefundTokenAccount,
      paymentReceiverPublicKey: null,
      amount: params.amount,
      tokenMintAddress: params.tokenMintAddress,
    },
  };
}

async function buildRefundRequestTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  senderWallet: string;
  senderPhoneIdentityPublicKey: string;
  refundReceiverPublicKey: string;
}) {
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const sender = new PublicKey(params.senderWallet);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: sender, isSigner: true, isWritable: false },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
      ],
        data: Buffer.concat([
          instructionDiscriminator("request_refund"),
          paymentIdToSeed(params.paymentId),
          identityPublicKeyToBytes(params.senderPhoneIdentityPublicKey),
          identityPublicKeyToBytes(params.refundReceiverPublicKey),
        ]),
    }),
  );

  transaction.partialSign(payer);

  return {
    connection,
    payer,
    transaction,
  };
}

export async function prepareRefundRequest(params: {
  paymentId: string;
  escrowAccount: string;
  senderWallet: string;
  senderPhoneIdentityPublicKey: string;
  refundReceiverPublicKey: string;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return {
      serializedTransaction: Buffer.from(JSON.stringify(params)).toString("base64"),
      rpcUrl: env.SOLANA_RPC_URL ?? "mock",
      programId: getProgramId().toBase58(),
      mode: "mock" as const,
        preview: {
          paymentId: params.paymentId,
          escrowAccount: params.escrowAccount,
          senderWallet: params.senderWallet,
          senderPhoneIdentityPublicKey: params.senderPhoneIdentityPublicKey,
          refundReceiverPublicKey: params.refundReceiverPublicKey,
        },
      };
  }

  const built = await buildRefundRequestTransaction(params);
  return {
    serializedTransaction: built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
    programId: getProgramId().toBase58(),
    mode: "devnet" as const,
      preview: {
        paymentId: params.paymentId,
        escrowAccount: params.escrowAccount,
        senderWallet: params.senderWallet,
        senderPhoneIdentityPublicKey: params.senderPhoneIdentityPublicKey,
        refundReceiverPublicKey: params.refundReceiverPublicKey,
      },
    };
}

export async function confirmRefundRequest(params: {
  paymentId: string;
  escrowAccount: string;
  senderWallet: string;
  senderPhoneIdentityPublicKey: string;
  refundReceiverPublicKey: string;
  blockchainSignature: string;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return {
      mode: "mock" as const,
      signature: params.blockchainSignature,
      refundClaimAvailableAt: null,
    };
  }

  const connection = getConnection();
  const paymentAccount = new PublicKey(params.escrowAccount);
  const transaction = await connection.getTransaction(params.blockchainSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction || transaction.meta?.err) {
    throw new Error("The refund request transaction could not be confirmed on-chain");
  }

  const accountInfo = await connection.getAccountInfo(paymentAccount, "confirmed");
  if (!accountInfo) {
    throw new Error("The payment account could not be loaded after refund request");
  }

  const decoded = decodePaymentAccount(accountInfo.data);
  if (decoded.senderPubkey.toBase58() !== params.senderWallet) {
    throw new Error("The on-chain sender does not match the refund requester");
  }
  if (decoded.senderPhoneIdentityPublicKey?.toBase58() !== params.senderPhoneIdentityPublicKey) {
    throw new Error("The on-chain sender identity does not match the refund requester");
  }
  if (decoded.status !== 3) {
    throw new Error("The payment was not moved into refund-requested state on-chain");
  }
  if (decoded.refundReceiverPublicKey?.toBase58() !== params.refundReceiverPublicKey) {
    throw new Error("The on-chain refund route does not match the prepared refund receiver");
  }

  return {
    mode: "devnet" as const,
    signature: params.blockchainSignature,
    refundClaimAvailableAt:
      decoded.refundAvailableAtTs != null ? new Date(Number(decoded.refundAvailableAtTs) * 1000).toISOString() : null,
  };
}

async function buildRefundClaimTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  refundSettlementWallet: string;
  senderPhoneIdentityPublicKey: string;
  refundReceiverPublicKey: string;
  tokenMintAddress: string;
}) {
  const configPda = await requireEscrowConfigInitialized();
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const mint = new PublicKey(params.tokenMintAddress);
  const settlementWallet = new PublicKey(params.refundSettlementWallet);
  const settlementTokenAccount = splToken.getAssociatedTokenAddressSync(mint, settlementWallet);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const identityBinding = getIdentityBindingPda(params.senderPhoneIdentityPublicKey);
  const refundReceiverAuthority = new PublicKey(params.refundReceiverPublicKey);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const settlementAtaInfo = await connection.getAccountInfo(settlementTokenAccount, "confirmed");
  const bindingInfo = await connection.getAccountInfo(identityBinding, "confirmed");

  if (!settlementAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        settlementTokenAccount,
        settlementWallet,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: bindingInfo
        ? [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
            { pubkey: refundReceiverAuthority, isSigner: true, isWritable: false },
            { pubkey: settlementWallet, isSigner: true, isWritable: false },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: paymentAccount, isSigner: false, isWritable: true },
            { pubkey: identityBinding, isSigner: false, isWritable: false },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: escrowVault, isSigner: false, isWritable: true },
            { pubkey: settlementTokenAccount, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ]
        : [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: refundReceiverAuthority, isSigner: true, isWritable: false },
            { pubkey: settlementWallet, isSigner: true, isWritable: false },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: paymentAccount, isSigner: false, isWritable: true },
            { pubkey: identityBinding, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: escrowVault, isSigner: false, isWritable: true },
            { pubkey: settlementWallet, isSigner: false, isWritable: false },
            { pubkey: settlementTokenAccount, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
      data: Buffer.concat([
        instructionDiscriminator(bindingInfo ? "claim_refund" : "claim_refund_and_bind_first_wallet"),
        paymentIdToSeed(params.paymentId),
      ]),
    }),
  );

  return {
    connection,
    payer,
    transaction,
    settlementTokenAccount: settlementTokenAccount.toBase58(),
    settlementNeedsAta: !settlementAtaInfo,
    hasBinding: Boolean(bindingInfo),
  };
}

export async function prepareRefundClaim(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  refundSettlementWallet: string;
  senderPhoneIdentityPublicKey: string;
  refundReceiverPublicKey: string;
  tokenMintAddress: string;
  amount: number;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return {
      serializedTransaction: Buffer.from(JSON.stringify(params)).toString("base64"),
      rpcUrl: env.SOLANA_RPC_URL ?? "mock",
      programId: getProgramId().toBase58(),
      mode: "mock" as const,
      feeAmountUi: 0,
      preview: {
        escrowAccount: params.escrowAccount,
        escrowVaultAddress: params.escrowVaultAddress,
        settlementWallet: params.refundSettlementWallet,
        settlementTokenAccount: params.refundSettlementWallet,
        paymentReceiverPublicKey: params.refundReceiverPublicKey,
        amount: params.amount,
        tokenMintAddress: params.tokenMintAddress,
      },
    };
  }

  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  const built = await buildRefundClaimTransaction(params);
  const [transactionFeeLamports, tokenAccountRentLamports, prices] = await Promise.all([
    estimateTransactionFeeLamports(built.connection, built.transaction),
    built.connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE, "confirmed"),
    getTokenAndSolUsdPrices(tokenConfig.symbol),
  ]);
  const accountRentLamports = built.settlementNeedsAta ? tokenAccountRentLamports : 0;
  const totalLamports = transactionFeeLamports + accountRentLamports;

  built.transaction.partialSign(built.payer);

  return {
    serializedTransaction: built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    rpcUrl: env.SOLANA_RPC_URL!,
    programId: getProgramId().toBase58(),
    mode: "devnet" as const,
    feeAmountUi: 0,
    preview: {
      escrowAccount: params.escrowAccount,
      escrowVaultAddress: params.escrowVaultAddress,
      settlementWallet: params.refundSettlementWallet,
      settlementTokenAccount: built.settlementTokenAccount,
      paymentReceiverPublicKey: params.refundReceiverPublicKey,
      amount: params.amount,
      tokenMintAddress: params.tokenMintAddress,
    },
  };
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
