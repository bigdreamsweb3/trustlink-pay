import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";

import { VERIFIED_TSN_PROGRAM_ID } from "./program.js";
import { resolveSolanaRpcUrl } from "./rpc.js";

const TSN_VERIFIER_SEED = utf8ToBytes("verifier");
const TSN_MOTHER_ESCROW_SEED = utf8ToBytes("tsn_mother_escrow");
const TSN_CRANKER_SEED = utf8ToBytes("tsn_cranker");
const TSN_TREASURY_SEED = utf8ToBytes("tsn_treasury");
const TSN_SHARED_ESCROW_AUTHORITY_SEED = utf8ToBytes("tsn_shared_escrow");
const TSN_PRIVATE_ESCROW_RECORD_SEED = utf8ToBytes("tsn_private_escrow_record");
const MOTHER_ESCROW_EPOCH_ID_OFFSET =
  8 + // Anchor account discriminator
  32 + // authority
  32 + // tins_program_id
  32 + // protocol_seed
  8 + // epoch_seconds
  8 + // lease_seconds
  2 + 2 + 2 + // payment fee splits
  2 + 2 + 2 + 2; // TIN operation fee splits

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
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
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function hexToBytes(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a hex string`);
  }
  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function uiAmountToBaseUnits(amountUi: number | string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("token decimals must be a non-negative integer");
  }

  const raw = String(amountUi).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid token amount: ${raw}`);
  }

  const [whole, fraction = ""] = raw.split(".");
  const normalizedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}

export function tsnInstructionDiscriminator(name: string) {
  return sha256(utf8ToBytes(`global:${name}`)).subarray(0, 8);
}

export function paymentIdToU64(paymentId: string) {
  const hash = sha256(utf8ToBytes(paymentId));
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(hash[index]) << (8n * BigInt(index));
  }
  return value;
}

export function getSponsoredSettlementPdas(params: {
  paymentId: string;
  crankerFeePayer: string | PublicKey;
  tokenMintAddress: string | PublicKey;
  intentSeedHash?: string;
  commitmentHash?: string;
}) {
  const programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
  const crankerOperator =
    params.crankerFeePayer instanceof PublicKey
      ? params.crankerFeePayer
      : new PublicKey(params.crankerFeePayer);
  const mint =
    params.tokenMintAddress instanceof PublicKey
      ? params.tokenMintAddress
      : new PublicKey(params.tokenMintAddress);
  const intentSeed32 = params.intentSeedHash
    ? hexToBytes(params.intentSeedHash, "intentSeedHash")
    : sha256(utf8ToBytes(params.paymentId));
  if (intentSeed32.length !== 32) {
    throw new Error("intentSeedHash must decode to 32 bytes");
  }
  const commitmentHash32 = params.commitmentHash
    ? hexToBytes(params.commitmentHash, "commitmentHash")
    : intentSeed32;
  if (commitmentHash32.length !== 32) {
    throw new Error("commitmentHash must decode to 32 bytes");
  }

  const paymentIntentId = paymentIdToU64(params.paymentId);
  const verifierPda = PublicKey.findProgramAddressSync([TSN_VERIFIER_SEED], programId)[0];
  const motherEscrow = PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programId)[0];
  const cranker = PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, motherEscrow.toBuffer(), crankerOperator.toBuffer()],
    programId,
  )[0];
  const treasuryPda = PublicKey.findProgramAddressSync([TSN_TREASURY_SEED], programId)[0];
  const treasuryTokenAccount = getAssociatedTokenAddressSync(mint, treasuryPda, true);
  const sharedEscrowAuthority = PublicKey.findProgramAddressSync(
    [TSN_SHARED_ESCROW_AUTHORITY_SEED, motherEscrow.toBuffer()],
    programId,
  )[0];
  return {
    programId,
    crankerOperator,
    mint,
    intentSeed32,
    intentSeedHash: bytesToHex(intentSeed32),
    paymentIntentId,
    verifierPda,
    motherEscrow,
    cranker,
    treasuryPda,
    treasuryTokenAccount,
    sharedEscrowAuthority,
  };
}

export async function fetchTsnSettlementEpoch(rpcUrl?: string) {
  const connection = new Connection(
    rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
  const programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
  const motherEscrow = PublicKey.findProgramAddressSync(
    [TSN_MOTHER_ESCROW_SEED],
    programId,
  )[0];
  const account = await connection.getAccountInfo(motherEscrow, "confirmed");
  if (!account) throw new Error("TSN Mother Escrow is not initialized");
  const data = Buffer.from(account.data);
  const epochOffset = MOTHER_ESCROW_EPOCH_ID_OFFSET;
  if (data.length < epochOffset + 8) {
    throw new Error("TSN Mother Escrow account is too small");
  }
  const expectedDiscriminator = sha256(
    utf8ToBytes("account:MotherEscrow"),
  ).subarray(0, 8);
  if (!Buffer.from(expectedDiscriminator).equals(data.subarray(0, 8))) {
    throw new Error("TSN Mother Escrow discriminator is invalid");
  }
  const epoch = data.readBigUInt64LE(epochOffset);
  if (epoch > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("TSN epoch exceeds JavaScript safe integer range");
  }
  return Number(epoch);
}

export async function buildTsnSponsoredSettlementTransaction(params: {
  paymentId: string;
  crankerFeePayer: string;
  senderWallet: string;
  tokenMintAddress: string;
  amountUi: number | string;
  senderFeeAmountUi?: number | string;
  tokenDecimals: number;
  recipientHash: string;
  transferId: string;
  commitmentHash: string;
  rpcUrl?: string;
  intentSeedHash?: string;
  escrowTokenSecretKeyBase64?: string;
}) {
  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
  const senderWallet = new PublicKey(params.senderWallet);
  if (hexToBytes(params.recipientHash, "recipientHash").length !== 32) {
    throw new Error("recipientHash must be a 32-byte hex string");
  }
  const transferId = hexToBytes(params.transferId, "transferId");
  const commitmentHash = hexToBytes(params.commitmentHash, "commitmentHash");
  if (transferId.length !== 32 || commitmentHash.length !== 32) {
    throw new Error("transferId and commitmentHash must be 32-byte hex strings");
  }

  const pdas = getSponsoredSettlementPdas({
    paymentId: params.paymentId,
    crankerFeePayer: params.crankerFeePayer,
    tokenMintAddress: params.tokenMintAddress,
    intentSeedHash: params.intentSeedHash,
    commitmentHash: params.commitmentHash,
  });
  const senderTokenAccount = getAssociatedTokenAddressSync(pdas.mint, senderWallet);
  const amountBaseUnits = uiAmountToBaseUnits(params.amountUi, params.tokenDecimals);
  const senderFeeAmountBaseUnits = uiAmountToBaseUnits(params.senderFeeAmountUi ?? 0, params.tokenDecimals);
  if (amountBaseUnits <= 0n && senderFeeAmountBaseUnits <= 0n) {
    throw new Error("wallet-funded settlement must move escrow amount or sender fee");
  }
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const escrowTokenAccount = params.escrowTokenSecretKeyBase64
    ? Keypair.fromSecretKey(Uint8Array.from(Buffer.from(params.escrowTokenSecretKeyBase64, "base64")))
    : Keypair.generate();
  const privateEscrowRecord = PublicKey.findProgramAddressSync(
    [TSN_PRIVATE_ESCROW_RECORD_SEED, escrowTokenAccount.publicKey.toBytes()],
    pdas.programId,
  )[0];
  const paymentIdHash = sha256(utf8ToBytes(params.paymentId));
  const registerCommitmentIx =
    amountBaseUnits > 0n
      ? new TransactionInstruction({
          programId: pdas.programId,
          keys: [
            { pubkey: pdas.crankerOperator, isSigner: true, isWritable: true },
            { pubkey: senderWallet, isSigner: true, isWritable: false },
            { pubkey: pdas.motherEscrow, isSigner: false, isWritable: false },
            { pubkey: pdas.cranker, isSigner: false, isWritable: true },
            { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
            { pubkey: pdas.mint, isSigner: false, isWritable: false },
            { pubkey: pdas.sharedEscrowAuthority, isSigner: false, isWritable: false },
            { pubkey: escrowTokenAccount.publicKey, isSigner: true, isWritable: true },
            { pubkey: privateEscrowRecord, isSigner: false, isWritable: true },
            { pubkey: pdas.verifierPda, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(concatBytes([
            tsnInstructionDiscriminator("tsn_register_private_commitment"),
            commitmentHash,
            encodeU64(amountBaseUnits),
            paymentIdHash,
          ])),
        })
      : null;

  const transferSenderFeeIx =
    senderFeeAmountBaseUnits > 0n
      ? createTransferCheckedInstruction(
          senderTokenAccount,
          pdas.mint,
          pdas.treasuryTokenAccount,
          senderWallet,
          senderFeeAmountBaseUnits,
          params.tokenDecimals,
        )
      : null;

  const transaction = new Transaction({
    feePayer: pdas.crankerOperator,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(...(registerCommitmentIx ? [registerCommitmentIx] : []), ...(transferSenderFeeIx ? [transferSenderFeeIx] : []));
  if (registerCommitmentIx) {
    transaction.partialSign(escrowTokenAccount);
  }

  return {
    transactionBase64: bytesToBase64(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    ),
    intentSeedHash: pdas.intentSeedHash,
    paymentIntentId: pdas.paymentIntentId.toString(),
    privacyVersion: 2 as const,
    commitmentRecord: null,
    sharedEscrowAuthority: pdas.sharedEscrowAuthority.toBase58(),
    escrowTokenAccount: registerCommitmentIx ? escrowTokenAccount.publicKey.toBase58() : null,
    paymentVault: registerCommitmentIx ? escrowTokenAccount.publicKey.toBase58() : null,
    paymentVaultTokenAccount: registerCommitmentIx ? escrowTokenAccount.publicKey.toBase58() : null,
    senderTokenAccount: senderTokenAccount.toBase58(),
    crankerFeePayer: pdas.crankerOperator.toBase58(),
    verifierPda: pdas.verifierPda.toBase58(),
    motherEscrow: pdas.motherEscrow.toBase58(),
    cranker: pdas.cranker.toBase58(),
    transferId: params.transferId,
    commitmentHash: params.commitmentHash,
    treasuryPda: pdas.treasuryPda.toBase58(),
    treasuryTokenAccount: pdas.treasuryTokenAccount.toBase58(),
    amountBaseUnits: amountBaseUnits.toString(),
    senderFeeAmountBaseUnits: senderFeeAmountBaseUnits.toString(),
    escrowTokenSecretKeyBase64: registerCommitmentIx
      ? Buffer.from(escrowTokenAccount.secretKey).toString("base64")
      : null,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}
