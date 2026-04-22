import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { sha256 } from "@/app/utils/hash";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  type BlockchainExecutionMode,
  type ClaimFeeEstimate,
  type ExpireEscrowResult,
  type SenderTransferFeeEstimate,
  type SupportedWalletToken,
  TOKEN_ACCOUNT_SPACE,
  TOKEN_PROGRAM_ID,
  createDraftPaymentId,
  decodePaymentAccount,
  estimateTransactionFeeLamports,
  findSenderTokenAccount,
  fromBaseUnits,
  getAllowedTokenByMint,
  getConnection,
  getEscrowAuthorityKeypair,
  getPaymentAccountPda,
  getProgramId,
  getTokenAndSolUsdPrices,
  getVaultAuthorityPda,
  instructionDiscriminator,
  lamportsToSol,
  parseAllowedTokens,
  paymentIdToSeed,
  phoneHashHexToBytes,
  requireEscrowConfigInitialized,
  roundToDecimals,
  roundUpToDecimals,
  selectRecoveryWallet,
  toBaseUnits,
} from "@/app/blockchain/solana-core";

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

async function buildCreatePaymentTransaction(params: {
  connection: Connection;
  paymentId: string;
  senderWallet: string;
  phoneHash: string;
  amount: number;
  tokenMintAddress: string;
  senderFeeAmountBaseUnits: bigint;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  const configPda = await requireEscrowConfigInitialized();
  const policy = getEscrowPolicyConfig();
  const payer = getEscrowAuthorityKeypair();
  const sender = new PublicKey(params.senderWallet);
  const mint = new PublicKey(params.tokenMintAddress);
  const treasuryOwner = new PublicKey(policy.treasuryOwner);
  const treasuryTokenAccount = splToken.getAssociatedTokenAddressSync(mint, treasuryOwner);
  const senderTokenAccount = await findSenderTokenAccount({
    connection: params.connection,
    owner: sender,
    mint,
    amount: params.amount + fromBaseUnits(params.senderFeeAmountBaseUnits, tokenConfig.decimals),
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
    phoneHashHexToBytes(params.phoneHash),
    encodeU64(toBaseUnits(params.amount, tokenConfig.decimals)),
    encodeU64(params.senderFeeAmountBaseUnits),
  ]);

  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const treasuryAtaInfo = await params.connection.getAccountInfo(treasuryTokenAccount, "confirmed");
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
    paymentAccount,
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
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  if (env.SOLANA_MOCK_MODE) {
    return {
      tokenSymbol: tokenConfig.symbol,
      tokenMintAddress: tokenConfig.mintAddress,
      senderFeeAmountUi: 0,
      senderFeeAmountUsd: 0,
      totalTokenRequiredUi: params.amount,
      estimatedNetworkFeeLamports: 0,
      networkFeeSol: 0,
      networkFeeUsd: 0,
    };
  }

  const policy = getEscrowPolicyConfig();
  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({
    connection,
    ...params,
    senderFeeAmountBaseUnits: 0n,
  });
  const [networkFeeLamports, prices] = await Promise.all([
    estimateTransactionFeeLamports(connection, built.transaction),
    getTokenAndSolUsdPrices(built.tokenConfig.symbol),
  ]);

  const networkFeeSol = lamportsToSol(networkFeeLamports);
  const networkFeeUsd = prices.solUsd != null ? roundToDecimals(networkFeeSol * prices.solUsd, 6) : null;
  const baseTokenFeeUi =
    networkFeeUsd != null && prices.tokenUsd != null && prices.tokenUsd > 0
      ? networkFeeUsd / prices.tokenUsd
      : 0;
  const markedUpTokenFeeUi = baseTokenFeeUi * (1 + policy.sendFeeBps / 10_000);
  const cappedTokenFeeUi =
    policy.sendFeeCapUiAmount > 0 ? Math.min(markedUpTokenFeeUi, policy.sendFeeCapUiAmount) : markedUpTokenFeeUi;
  const senderFeeAmountUi = roundUpToDecimals(cappedTokenFeeUi, built.tokenConfig.decimals);

  return {
    tokenSymbol: built.tokenConfig.symbol,
    tokenMintAddress: built.tokenConfig.mintAddress,
    senderFeeAmountUi,
    senderFeeAmountUsd: prices.tokenUsd != null ? roundToDecimals(senderFeeAmountUi * prices.tokenUsd, 6) : null,
    totalTokenRequiredUi: roundToDecimals(params.amount + senderFeeAmountUi, built.tokenConfig.decimals),
    estimatedNetworkFeeLamports: networkFeeLamports,
    networkFeeSol,
    networkFeeUsd,
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
  const policy = getEscrowPolicyConfig();
  const mint = new PublicKey(params.tokenMintAddress);
  const receiverOwner = new PublicKey(params.receiverWallet);
  const receiverTokenAccount = splToken.getAssociatedTokenAddressSync(mint, receiverOwner);
  const treasuryOwner = new PublicKey(policy.treasuryOwner);
  const treasuryTokenAccount = splToken.getAssociatedTokenAddressSync(mint, treasuryOwner);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
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

  const policy = getEscrowPolicyConfig();
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
  const markedUpTokenFeeUi = baseTokenFeeUi * (1 + policy.claimFeeBps / 10_000);
  const cappedTokenFeeUi =
    policy.claimFeeCapUiAmount > 0 ? Math.min(markedUpTokenFeeUi, policy.claimFeeCapUiAmount) : markedUpTokenFeeUi;
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
}) {
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
      mode: "mock" as const,
      tokenSymbol: tokenConfig.symbol,
      senderFeeAmountUi: 0,
      totalTokenRequiredUi: params.amount,
    };
  }

  const feeEstimate = await estimateSenderTransferCost(params);
  const connection = getConnection();
  const built = await buildCreatePaymentTransaction({
    connection,
    ...params,
    senderFeeAmountBaseUnits: toBaseUnits(feeEstimate.senderFeeAmountUi, tokenConfig.decimals),
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
  phoneHash: string;
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
    return {
      escrowAccount: getPaymentAccountPda(params.paymentId).toBase58(),
      escrowVaultAddress: params.escrowVaultAddress,
      signature: params.depositSignature,
      mode: "mock" as const,
      tokenSymbol: tokenConfig.symbol,
      senderFeeAmountUi: 0,
      claimFeeAmountUi: 0,
      expiryAt: null,
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
    mode: "devnet" as const,
    tokenSymbol: tokenConfig.symbol,
    senderFeeAmountUi: Number(decoded.senderFeeAmount) / 10 ** tokenConfig.decimals,
    claimFeeAmountUi: Number(decoded.claimFeeAmount) / 10 ** tokenConfig.decimals,
    expiryAt: new Date(Number(decoded.expiryTs) * 1000).toISOString(),
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

async function buildExpirePaymentTransaction(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  tokenMintAddress: string;
}) {
  const configPda = await requireEscrowConfigInitialized();
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const mint = new PublicKey(params.tokenMintAddress);
  const recoveryWallet = selectRecoveryWallet(params.paymentId);
  const recoveryOwner = new PublicKey(recoveryWallet.address);
  const recoveryTokenAccount = splToken.getAssociatedTokenAddressSync(mint, recoveryOwner);
  const paymentAccount = new PublicKey(params.escrowAccount);
  const escrowVault = new PublicKey(params.escrowVaultAddress);
  const vaultAuthority = getVaultAuthorityPda(params.paymentId);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const recoveryAtaInfo = await connection.getAccountInfo(recoveryTokenAccount, "confirmed");
  if (!recoveryAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        recoveryTokenAccount,
        recoveryOwner,
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
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: paymentAccount, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: escrowVault, isSigner: false, isWritable: true },
        { pubkey: recoveryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([instructionDiscriminator("expire_payment_to_pool"), paymentIdToSeed(params.paymentId)]),
    }),
  );

  return {
    connection,
    payer,
    transaction,
    recoveryWalletAddress: recoveryWallet.address,
  };
}

export async function expireEscrowPayment(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  tokenMintAddress: string;
}): Promise<ExpireEscrowResult> {
  if (env.SOLANA_MOCK_MODE) {
    const signature = sha256(JSON.stringify({ action: "expireEscrowPayment", ...params })).slice(0, 64);
    return {
      signature,
      mode: "mock",
      recoveryWalletAddress: selectRecoveryWallet(params.paymentId).address,
    };
  }

  const built = await buildExpirePaymentTransaction(params);
  const signature = await sendAndConfirmTransaction(built.connection, built.transaction, [built.payer], {
    commitment: "confirmed",
  });

  logger.info("solana.expire_payment_to_pool", {
    paymentId: params.paymentId,
    escrowAccount: params.escrowAccount,
    escrowVaultAddress: params.escrowVaultAddress,
    tokenMintAddress: params.tokenMintAddress,
    recoveryWalletAddress: built.recoveryWalletAddress,
    signature,
  });

  return {
    signature,
    mode: "devnet",
    recoveryWalletAddress: built.recoveryWalletAddress,
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
