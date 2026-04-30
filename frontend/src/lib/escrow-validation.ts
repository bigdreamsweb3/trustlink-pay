"use client";

import { Connection, PublicKey, Transaction } from "@solana/web3.js";

const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const CLAIM_PAYMENT_DISCRIMINATOR = "4570faa7259cc81e";
const CLAIM_AND_BIND_FIRST_WALLET_DISCRIMINATOR = "e5268d270c7b1eb3";

function readU64LE(view: Uint8Array, offset: number) {
  const slice = view.slice(offset, offset + 8);
  return Number(
    slice.reduceRight((accumulator, value) => (accumulator << 8n) | BigInt(value), 0n)
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function paymentIdToSeed(paymentId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`trustlink-payment:${paymentId}`)
  );
  return new Uint8Array(digest).slice(0, 32);
}

export function deriveAssociatedTokenAddress(params: { mint: string; owner: string }) {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(params.owner).toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      new PublicKey(params.mint).toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0].toBase58();
}

export async function assertClaimTransactionIntegrity(params: {
  rpcUrl: string;
  transaction: Transaction;
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  settlementWallet: string;
  settlementTokenAccount: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  tokenMintAddress: string;
  expectedProgramId: string;
  expectedAmountUi: number;
}) {
  const connection = new Connection(params.rpcUrl, "confirmed");
  const accountInfo = await connection.getAccountInfo(new PublicKey(params.escrowAccount), "confirmed");

  if (!accountInfo) {
    throw new Error("On-chain payment account was not found");
  }

  const bytes = new Uint8Array(accountInfo.data);
  const phoneIdentityOffset = 8 + 32 + 32;
  const paymentReceiverOffset = phoneIdentityOffset + 32;
  const mintOffset = paymentReceiverOffset + 32;
  const amountOffset = mintOffset + 32;

  const onChainPaymentReceiver = new PublicKey(bytes.slice(paymentReceiverOffset, paymentReceiverOffset + 32)).toBase58();
  const onChainMint = new PublicKey(bytes.slice(mintOffset, mintOffset + 32)).toBase58();
  const onChainAmountBaseUnits = readU64LE(bytes, amountOffset);

  if (onChainPaymentReceiver !== params.paymentReceiverPublicKey) {
    throw new Error("On-chain payment receiver key does not match the verified receiver authority");
  }
  if (onChainMint !== params.tokenMintAddress) {
    throw new Error("On-chain token mint does not match the expected claim mint");
  }
  if (onChainAmountBaseUnits <= 0) {
    throw new Error("On-chain payment amount is invalid");
  }
  if (!(params.expectedAmountUi > 0)) {
    throw new Error("Expected claim amount is invalid");
  }

  const expectedSettlementAta = deriveAssociatedTokenAddress({
    mint: params.tokenMintAddress,
    owner: params.settlementWallet,
  });
  if (expectedSettlementAta !== params.settlementTokenAccount) {
    throw new Error("Settlement token account does not belong to the selected settlement wallet");
  }

  const allowedProgramIds = new Set([
    params.expectedProgramId,
    TOKEN_PROGRAM_ID.toBase58(),
    ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    SYSTEM_PROGRAM_ID.toBase58(),
  ]);

  for (const instruction of params.transaction.instructions) {
    if (!allowedProgramIds.has(instruction.programId.toBase58())) {
      throw new Error("Claim transaction contains an unexpected program instruction");
    }
  }

  const keys = params.transaction.instructions.flatMap((instruction) =>
    instruction.keys.map((key) => key.pubkey.toBase58())
  );
  if (!keys.includes(params.escrowAccount)) {
    throw new Error("Claim transaction does not reference the expected escrow account");
  }
  if (!keys.includes(params.escrowVaultAddress)) {
    throw new Error("Claim transaction does not reference the expected escrow vault");
  }
  if (!keys.includes(params.settlementTokenAccount)) {
    throw new Error("Claim transaction does not reference the expected settlement token account");
  }
  if (!params.transaction.signatures.some((entry) => entry.publicKey.toBase58() === params.paymentReceiverPublicKey)) {
    throw new Error("Claim transaction is missing the derived receiver authority signer");
  }

  const escrowInstructions = params.transaction.instructions.filter(
    (instruction) => instruction.programId.toBase58() === params.expectedProgramId
  );
  if (escrowInstructions.length !== 1) {
    throw new Error("Claim transaction must contain exactly one escrow program instruction");
  }

  const escrowInstruction = escrowInstructions[0];
  const discriminator = bytesToHex(escrowInstruction.data.slice(0, 8));
  const paymentSeed = await paymentIdToSeed(params.paymentId);
  const data = escrowInstruction.data;

  if (
    discriminator !== CLAIM_PAYMENT_DISCRIMINATOR &&
    discriminator !== CLAIM_AND_BIND_FIRST_WALLET_DISCRIMINATOR
  ) {
    throw new Error("Claim transaction uses an unexpected escrow instruction");
  }
  if (data.length !== 112) {
    throw new Error("Claim transaction instruction payload size is invalid");
  }
  if (bytesToHex(data.slice(8, 40)) !== bytesToHex(paymentSeed)) {
    throw new Error("Claim transaction payload does not match the expected payment id");
  }
  if (new PublicKey(data.slice(40, 72)).toBase58() !== params.phoneIdentityPublicKey) {
    throw new Error("Claim transaction payload does not match the expected phone identity");
  }
  if (new PublicKey(data.slice(72, 104)).toBase58() !== params.paymentReceiverPublicKey) {
    throw new Error("Claim transaction payload does not match the expected receiver authority");
  }

  const claimFeeAmountBaseUnits = readU64LE(data, 104);
  if (claimFeeAmountBaseUnits < 0 || claimFeeAmountBaseUnits >= onChainAmountBaseUnits) {
    throw new Error("Claim transaction fee configuration is invalid");
  }

  const claimKeys = escrowInstruction.keys.map((key) => ({
    pubkey: key.pubkey.toBase58(),
    isSigner: key.isSigner,
  }));
  if (claimKeys[1]?.pubkey !== params.paymentReceiverPublicKey || !claimKeys[1]?.isSigner) {
    throw new Error("Claim transaction signer does not match the derived receiver authority");
  }
  if (claimKeys[2]?.pubkey !== params.settlementWallet || !claimKeys[2]?.isSigner) {
    throw new Error("Claim transaction signer does not match the selected settlement wallet");
  }

  if (discriminator === CLAIM_PAYMENT_DISCRIMINATOR) {
    if (claimKeys[8]?.pubkey !== params.settlementTokenAccount) {
      throw new Error("Claim transaction settlement route does not match the bound settlement token account");
    }
  } else if (claimKeys[9]?.pubkey !== params.settlementTokenAccount) {
    throw new Error("First-claim transaction settlement route does not match the selected settlement token account");
  }
}
