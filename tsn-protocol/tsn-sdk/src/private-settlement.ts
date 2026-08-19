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
import { resolveSolanaRpcUrl } from "./rpc.js";

import {
  getTsnCrankerPda,
  getTsnCrankerVaultAuthorityPda,
  getTsnCrankerVaultPda,
  getTsnCrankerVaultTokenPda,
  getTsnMotherEscrowPda,
  getTsnTreasuryPda,
  getTsnVerifierPda,
} from "./blockchain/solana-tsn.js";
import { VERIFIED_TSN_PROGRAM_ID } from "./program.js";

const PROGRAM_ID = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
const PRIVATE_CONFIG_SEED = utf8ToBytes("tsn_private_config");
const PRIVATE_REPLAY_REGISTRY_SEED = utf8ToBytes("tsn_private_replay");
const SHARED_ESCROW_AUTHORITY_SEED = utf8ToBytes("tsn_shared_escrow");
const PRIVATE_ESCROW_RECORD_SEED = utf8ToBytes("tsn_private_escrow_record");
const PRIVATE_SETTLEMENT_DNA_SEED = utf8ToBytes("tsn_private_settlement_dna");
const PRIVATE_PAYOUT_DOMAIN = utf8ToBytes("TSN_PRIVATE_PAYOUT_DNA_V1");
const PRIVATE_COMMITMENT_DIGEST_DOMAIN = utf8ToBytes("TSN_PRIVATE_COMMITMENT_DIGEST_V1");
const PRIVATE_RECOVERY_DOMAIN = utf8ToBytes("TSN_PRIVATE_RECOVERY_V2");
const MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1";
const PRU_SPEND_GUARD_SEED = utf8ToBytes("pru_spend_guard");

async function sendAndConfirmHttp(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
) {
  // Do not let web3.js derive/use a provider WebSocket from the HTTP URL.
  // Cranker settlement is intentionally HTTP-only through the TSN RPC gateway.
  const signature = await connection.sendTransaction(transaction, signers, {
    preflightCommitment: "confirmed",
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const status = (await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })).value[0];
    if (status?.err) {
      const transactionInfo = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = transactionInfo?.meta?.logMessages?.join(" | ") ?? "";
      throw new Error(
        `TSN settlement transaction failed: ${JSON.stringify(status.err)}${logs ? `; logs=${logs}` : ""}`,
      );
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`TSN settlement confirmation timed out; signature=${signature}`);
}

export type PrivatePayoutPermit = {
  permitSigner: string;
  permitSignatureBase64: string;
  payoutNullifier: string;
  payoutSequence: string;
  tokenMintAddress: string;
  recipientWallet: string;
  payoutAmountBaseUnits: string;
  claimFeeAmountBaseUnits: string;
  settlementDna: string;
  settlementCommitment: string;
  paymentIdHash: string;
  commitmentDigest: string;
  randomNonce: string;
  leaseId: string;
  leaseVersion: number;
  leaseExpiresAt: string;
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
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function getTsnPrivateEscrowRecordPda(escrowTokenAccount: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [PRIVATE_ESCROW_RECORD_SEED, escrowTokenAccount.toBytes()],
    PROGRAM_ID,
  )[0];
}

export function getTsnPrivateSettlementDnaPda(paymentIdHash: Uint8Array, commitmentDigest: Uint8Array) {
  assertBytes32(paymentIdHash, "payment id hash");
  assertBytes32(commitmentDigest, "commitment digest");
  return PublicKey.findProgramAddressSync(
    [PRIVATE_SETTLEMENT_DNA_SEED, paymentIdHash, commitmentDigest],
    PROGRAM_ID,
  )[0];
}

export function createPrivateCommitmentDigest(commitmentHash: Uint8Array) {
  assertBytes32(commitmentHash, "commitment hash");
  return sha256(concatBytes([PRIVATE_COMMITMENT_DIGEST_DOMAIN, commitmentHash]));
}

export function createSettlementCommitment(params: {
  settlementDna: PublicKey;
  paymentIdHash: Uint8Array;
  commitmentDigest: Uint8Array;
  randomNonce: Uint8Array;
  crankerVault: PublicKey;
  recipientWallet: PublicKey;
  tokenMint: PublicKey;
  payoutAmount: bigint;
  payoutNullifier: Uint8Array;
  leaseIdHash: Uint8Array;
  leaseVersion: bigint;
  leaseExpiryTs: bigint;
  expiresAtTs: bigint;
}) {
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentDigest, "commitment digest");
  assertBytes32(params.randomNonce, "random nonce");
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertBytes32(params.leaseIdHash, "lease id hash");
  return sha256(concatBytes([
    utf8ToBytes("TSN_SETTLEMENT_COMMITMENT_V1"), params.settlementDna.toBytes(),
    params.paymentIdHash, params.commitmentDigest, params.randomNonce,
    params.crankerVault.toBytes(), params.recipientWallet.toBytes(), params.tokenMint.toBytes(),
    encodeU64(params.payoutAmount), params.payoutNullifier, params.leaseIdHash,
    encodeU64(params.leaseVersion), encodeI64(params.leaseExpiryTs), encodeI64(params.expiresAtTs),
  ]));
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

function encodeU16(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("u16 value is out of range");
  }
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
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
  if (value.length !== 32)
    throw new Error(`${label} must contain exactly 32 bytes`);
}

function assertSignature(value: Uint8Array) {
  if (value.length !== 64)
    throw new Error("permit signature must contain exactly 64 bytes");
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
    params.action === "payout"
      ? PRIVATE_PAYOUT_DOMAIN
      : PRIVATE_RECOVERY_DOMAIN;
  return sha256(concatBytes([domain, params.secret]));
}

export function createPrivatePayoutPermitMessage(params: {
  operator: PublicKey;
  settlementDna: PublicKey;
  payoutNullifier: Uint8Array;
  payoutSequence: bigint;
  paymentIdHash: Uint8Array;
  commitmentDigest: Uint8Array;
  randomNonce: Uint8Array;
  settlementCommitment: Uint8Array;
  crankerVault: PublicKey;
  recipientWallet: PublicKey;
  tokenMint: PublicKey;
  payoutAmount: bigint;
  claimFeeAmount: bigint;
  leaseIdHash: Uint8Array;
  leaseVersion: bigint;
  leaseExpiryTs: bigint;
  expiresAtTs: bigint;
}) {
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentDigest, "commitment digest");
  assertBytes32(params.randomNonce, "random nonce");
  assertBytes32(params.settlementCommitment, "settlement commitment");
  assertBytes32(params.leaseIdHash, "lease id hash");
  return concatBytes([
    PRIVATE_PAYOUT_DOMAIN,
    PROGRAM_ID.toBytes(),
    getTsnMotherEscrowPda().toBytes(),
    params.operator.toBytes(),
    params.settlementDna.toBytes(),
    params.payoutNullifier,
    encodeU64(params.payoutSequence),
    params.paymentIdHash,
    params.commitmentDigest,
    params.randomNonce,
    params.settlementCommitment,
    params.crankerVault.toBytes(),
    params.recipientWallet.toBytes(),
    params.tokenMint.toBytes(),
    encodeU64(params.payoutAmount),
    encodeU64(params.claimFeeAmount),
    params.leaseIdHash,
    encodeU64(params.leaseVersion),
    encodeI64(params.leaseExpiryTs),
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
  paymentIdHash: Uint8Array;
  commitmentHash: Uint8Array;
  payoutNullifier: Uint8Array;
  recoveryAmount: bigint;
  leaseIdHash: Uint8Array;
  leaseVersion: bigint;
  leaseExpiryTs: bigint;
  expiresAtTs: bigint;
}) {
  assertBytes32(params.recoveryNullifier, "recovery nullifier");
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentHash, "commitment hash");
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertBytes32(params.leaseIdHash, "lease id hash");
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
    params.paymentIdHash,
    params.commitmentHash,
    params.payoutNullifier,
    encodeU64(params.recoveryAmount),
    params.leaseIdHash,
    encodeU64(params.leaseVersion),
    encodeI64(params.leaseExpiryTs),
    encodeI64(params.expiresAtTs),
  ]);
}

export function signPrivateSettlementPermit(params: {
  message: Uint8Array;
  permitSigner: Keypair;
}) {
  return nacl.sign.detached(params.message, params.permitSigner.secretKey);
}

export function getTsnPruSpendGuardPda(params: {
  tin: bigint | number | string;
  pruIndex: number;
}) {
  return PublicKey.findProgramAddressSync(
    [
      PRU_SPEND_GUARD_SEED,
      encodeU64(BigInt(params.tin)),
      encodeU16(params.pruIndex),
    ],
    PROGRAM_ID,
  )[0];
}

const SOLANA_MAX_TX_BYTES = 1232;
const PRU_SPEND_BASE_TX_OVERHEAD_BYTES = 400;
const PRU_SPEND_SIGNATURE_OVERHEAD_BYTES = 64;
const PRU_SPEND_SELECTION_OVERHEAD_BYTES = 240;

export function estimatePruSpendTxBytes(selectionCount: number): number {
  const signerCount = 2 + selectionCount;
  return (
    PRU_SPEND_BASE_TX_OVERHEAD_BYTES +
    signerCount * PRU_SPEND_SIGNATURE_OVERHEAD_BYTES +
    selectionCount * PRU_SPEND_SELECTION_OVERHEAD_BYTES
  );
}

export function maxPruSelectionsPerTx(): number {
  let count = 1;
  while (estimatePruSpendTxBytes(count + 1) <= SOLANA_MAX_TX_BYTES) {
    count++;
  }
  return count;
}

type PruSpendSelection = {
  tin: bigint | number | string;
  pruIndex: number;
  nonce: number;
  pruAuthority?: Keypair | null;
  pruAuthorityPublicKey?: PublicKey | string | null;
  spendAuthHash: Uint8Array;
  amountBaseUnits: bigint;
  authorizationMessage?: string;
  authorizationSignature?: string;
  rootAuthorizationSignature?: string;
  rootAuthorizationMessage?: Uint8Array | string;
  mainWalletPublicKey?: PublicKey | string;
};

const PRU_ROOT_AUTH_DOMAIN = new TextEncoder().encode("TSN_PRU_ROOT_AUTH_V1");
const PRU_CHILD_AUTH_DOMAIN = new TextEncoder().encode("TSN_PRU_CHILD_AUTH_V1");

function pruAuthorizationMessage(params: {
  domain: Uint8Array;
  authority: PublicKey;
  tin: bigint | number | string;
  pruIndex: number;
  nonce: number;
  commitmentHash: Uint8Array;
  amount: bigint;
  senderFeeAmount: bigint;
}) {
  return concatBytes([
    params.domain,
    PROGRAM_ID.toBytes(),
    params.authority.toBytes(),
    encodeU64(BigInt(params.tin)),
    encodeU16(params.pruIndex),
    Uint8Array.of(params.nonce),
    params.commitmentHash,
    encodeU64(params.amount),
    encodeU64(params.senderFeeAmount),
  ]);
}

function buildPruSpendInstructions(params: {
  operator: PublicKey;
  tokenMint: PublicKey;
  commitmentHash: Uint8Array;
  senderFeeAmountBaseUnits: bigint;
  selections: PruSpendSelection[];
  escrowTokenAccountPubkey: PublicKey;
}) {
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator });
  const sharedEscrowAuthority = getTsnSharedEscrowAuthorityPda();
  const verifierPda = getTsnVerifierPda();
  const treasuryPda = getTsnTreasuryPda();
  const treasuryTokenAccount = getAssociatedTokenAddressSync(
    params.tokenMint,
    treasuryPda,
    true,
  );
  let remainingSenderFee = params.senderFeeAmountBaseUnits;
  return params.selections.map((selection) => {
    const feeForThisSelection =
      remainingSenderFee > 0n
        ? remainingSenderFee >= selection.amountBaseUnits
          ? selection.amountBaseUnits
          : remainingSenderFee
        : 0n;
    remainingSenderFee -= feeForThisSelection;
    const escrowAmountForThisSelection =
      selection.amountBaseUnits - feeForThisSelection;
    const pruAuthorityPubkey = selection.pruAuthorityPublicKey
      ? new PublicKey(selection.pruAuthorityPublicKey)
      : (selection.pruAuthority?.publicKey ?? params.operator);
    const pruTokenAccount = getAssociatedTokenAddressSync(
      params.tokenMint,
      pruAuthorityPubkey,
    );
    const pruSpendGuard = getTsnPruSpendGuardPda({
      tin: selection.tin,
      pruIndex: selection.pruIndex,
    });
    const mainWallet = selection.mainWalletPublicKey
      ? new PublicKey(selection.mainWalletPublicKey)
      : null;
    if (!mainWallet || !selection.rootAuthorizationSignature) {
      throw new Error("PRU spend requires a main-wallet authorization signature");
    }
    const rootSignature = Uint8Array.from(Buffer.from(selection.rootAuthorizationSignature, "base64"));
    const childSignature = selection.authorizationSignature
      ? Uint8Array.from(Buffer.from(selection.authorizationSignature, "base64"))
      : null;
    if (rootSignature.length !== 64 || !childSignature || childSignature.length !== 64) {
      throw new Error("PRU spend signatures must each be 64 bytes");
    }
    const rootMessage = selection.rootAuthorizationMessage
      ? typeof selection.rootAuthorizationMessage === "string"
        ? utf8ToBytes(selection.rootAuthorizationMessage)
        : selection.rootAuthorizationMessage
      : pruAuthorizationMessage({
          domain: PRU_ROOT_AUTH_DOMAIN,
          authority: mainWallet,
          tin: selection.tin,
          pruIndex: selection.pruIndex,
          nonce: selection.nonce,
          commitmentHash: params.commitmentHash,
          amount: escrowAmountForThisSelection,
          senderFeeAmount: feeForThisSelection,
        });
    const childMessage = pruAuthorizationMessage({
      domain: PRU_CHILD_AUTH_DOMAIN,
      authority: pruAuthorityPubkey,
      tin: selection.tin,
      pruIndex: selection.pruIndex,
      nonce: selection.nonce,
      commitmentHash: params.commitmentHash,
      amount: escrowAmountForThisSelection,
      senderFeeAmount: feeForThisSelection,
    });
    const rootVerifyInstruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: mainWallet.toBytes(), message: rootMessage, signature: rootSignature,
    });
    const childVerifyInstruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: pruAuthorityPubkey.toBytes(), message: childMessage, signature: childSignature,
    });
    const baseInstructions = [
      rootVerifyInstruction,
      childVerifyInstruction,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: params.operator, isSigner: true, isWritable: true },
          {
            pubkey: pruAuthorityPubkey,
            isSigner: true,
            isWritable: false,
          },
          { pubkey: mainWallet, isSigner: false, isWritable: false },
          { pubkey: motherEscrow, isSigner: false, isWritable: false },
          { pubkey: cranker, isSigner: false, isWritable: true },
          { pubkey: pruSpendGuard, isSigner: false, isWritable: true },
          { pubkey: pruTokenAccount, isSigner: false, isWritable: true },
          { pubkey: params.tokenMint, isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: false },
          { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
          { pubkey: sharedEscrowAuthority, isSigner: false, isWritable: false },
          {
            pubkey: params.escrowTokenAccountPubkey,
            isSigner: true,
            isWritable: true,
          },
          { pubkey: verifierPda, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.from(
          concatBytes([
            instructionDiscriminator("tsn_execute_pru_spend"),
            encodeU64(BigInt(selection.tin)),
            encodeU16(selection.pruIndex),
            Uint8Array.of(selection.nonce),
            params.commitmentHash,
            selection.spendAuthHash,
            encodeU64(escrowAmountForThisSelection),
            encodeU64(feeForThisSelection),
            childSignature,
            pruAuthorityPubkey.toBytes(),
          ]),
        ),
      }),
    ];
    return baseInstructions;
  });
}

export type BatchedPruSpendResult = {
  signature: string;
  escrowTokenAccount: string;
  batchIndex: number;
  selectionCount: number;
};

export async function tsnExecutePruSpendOnChainBatched(params: {
  operator: Keypair;
  tokenMint: PublicKey;
  commitmentHash: Uint8Array;
  escrowAmountBaseUnits: bigint;
  senderFeeAmountBaseUnits?: bigint;
  escrowTokenAccount?: Keypair;
  selections: PruSpendSelection[];
  rpcUrl?: string;
  maxBatchSize?: number;
}): Promise<BatchedPruSpendResult[]> {
  assertBytes32(params.commitmentHash, "PRU spend commitment hash");
  if (params.escrowAmountBaseUnits <= 0n) {
    throw new Error("escrowAmountBaseUnits must be positive");
  }
  if (!params.selections.length) {
    throw new Error("at least one PRU spend selection is required");
  }
  const selectionTotal = params.selections.reduce(
    (total, selection) => total + selection.amountBaseUnits,
    0n,
  );
  const senderFeeAmount = params.senderFeeAmountBaseUnits ?? 0n;
  if (selectionTotal !== params.escrowAmountBaseUnits + senderFeeAmount) {
    throw new Error("PRU selections must equal escrow amount plus sender fee");
  }

  const maxBatch = params.maxBatchSize ?? maxPruSelectionsPerTx();
  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
  const escrowTokenAccount = params.escrowTokenAccount ?? Keypair.generate();

  const feeToAllocate = senderFeeAmount;
  const amountToEscrow = params.escrowAmountBaseUnits;
  const batches: {
    selections: PruSpendSelection[];
    batchAmount: bigint;
    batchFee: bigint;
  }[] = [];
  let feeRemaining = feeToAllocate;
  let amountRemaining = amountToEscrow;

  for (let i = 0; i < params.selections.length; i += maxBatch) {
    const batchSelections = params.selections.slice(i, i + maxBatch);
    const batchSelectionTotal = batchSelections.reduce(
      (sum, s) => sum + s.amountBaseUnits,
      0n,
    );
    const feeForBatch =
      batchSelectionTotal >= feeRemaining ? feeRemaining : batchSelectionTotal;
    feeRemaining -= feeForBatch;
    const amountForBatch = batchSelectionTotal - feeForBatch;
    amountRemaining -= amountForBatch;

    batches.push({
      selections: batchSelections,
      batchAmount: amountForBatch,
      batchFee: feeForBatch,
    });
  }

  const results: BatchedPruSpendResult[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchSenderFee =
      senderFeeAmount > 0n && batchIdx === 0 ? senderFeeAmount : 0n;
    const instructions = buildPruSpendInstructions({
      operator: params.operator.publicKey,
      tokenMint: params.tokenMint,
      commitmentHash: params.commitmentHash,
      senderFeeAmountBaseUnits: batchSenderFee,
      selections: batch.selections,
      escrowTokenAccountPubkey: escrowTokenAccount.publicKey,
    });

    const signers = [
      params.operator,
      escrowTokenAccount,
      ...batch.selections.flatMap((selection) =>
        selection.pruAuthority ? [selection.pruAuthority] : [],
      ),
    ];

    const signature = await sendAndConfirmTransaction(
      connection,
      new Transaction({ feePayer: params.operator.publicKey }).add(
        ...instructions.flat(),
      ),
      signers,
      { commitment: "confirmed" },
    );

    results.push({
      signature,
      escrowTokenAccount: escrowTokenAccount.publicKey.toBase58(),
      batchIndex: batchIdx,
      selectionCount: batch.selections.length,
    });

    console.log(
      `[tsn-pru-batch] batch=${batchIdx + 1}/${batches.length} ` +
        `selections=${batch.selections.length} ` +
        `amount=${batch.batchAmount} ` +
        `tx=${signature}`,
    );
  }

  return results;
}

export async function tsnExecutePruSpendOnChain(params: {
  operator: Keypair;
  tokenMint: PublicKey;
  commitmentHash: Uint8Array;
  escrowAmountBaseUnits: bigint;
  senderFeeAmountBaseUnits?: bigint;
  escrowTokenAccount?: Keypair;
  selections: Array<{
    tin: bigint | number | string;
    pruIndex: number;
    nonce: number;
    pruAuthority: Keypair;
    spendAuthHash: Uint8Array;
    amountBaseUnits: bigint;
  }>;
  rpcUrl?: string;
}) {
  assertBytes32(params.commitmentHash, "PRU spend commitment hash");
  if (params.escrowAmountBaseUnits <= 0n) {
    throw new Error("escrowAmountBaseUnits must be positive");
  }
  if (!params.selections.length) {
    throw new Error("at least one PRU spend selection is required");
  }
  const selectionTotal = params.selections.reduce(
    (total, selection) => total + selection.amountBaseUnits,
    0n,
  );
  const senderFeeAmount = params.senderFeeAmountBaseUnits ?? 0n;
  if (selectionTotal !== params.escrowAmountBaseUnits + senderFeeAmount) {
    throw new Error("PRU selections must equal escrow amount plus sender fee");
  }

  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
  const escrowTokenAccount = params.escrowTokenAccount ?? Keypair.generate();

  const instructions = buildPruSpendInstructions({
    operator: params.operator.publicKey,
    tokenMint: params.tokenMint,
    commitmentHash: params.commitmentHash,
    senderFeeAmountBaseUnits: senderFeeAmount,
    selections: params.selections,
    escrowTokenAccountPubkey: escrowTokenAccount.publicKey,
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction({ feePayer: params.operator.publicKey }).add(
      ...instructions.flat(),
    ),
    [
      params.operator,
      escrowTokenAccount,
      ...params.selections.flatMap((selection) =>
        selection.pruAuthority ? [selection.pruAuthority] : [],
      ),
    ],
    { commitment: "confirmed" },
  );
  return {
    signature,
    escrowTokenAccount: escrowTokenAccount.publicKey.toBase58(),
  };
}

export async function tsnConfigurePrivateSettlementOnChain(params: {
  authority: Keypair;
  permitSigner: PublicKey;
  enabled?: boolean;
  rpcUrl?: string;
}) {
  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
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
  settlementDna: PublicKey;
  settlementCommitment: Uint8Array;
  randomNonce: Uint8Array;
  payoutNullifier: Uint8Array;
  payoutSequence: bigint;
  paymentIdHash: Uint8Array;
  commitmentDigest: Uint8Array;
  tokenMint: PublicKey;
  recipientWallet: PublicKey;
  payoutAmount: bigint;
  claimFeeAmount?: bigint;
  leaseIdHash: Uint8Array;
  leaseVersion: bigint;
  leaseExpiryTs: bigint;
  expiresAtTs: bigint;
  rpcUrl?: string;
}) {
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentDigest, "commitment digest");
  assertBytes32(params.randomNonce, "random nonce");
  assertBytes32(params.settlementCommitment, "settlement commitment");
  assertSignature(params.permitSignature);
  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({
    motherEscrow,
    operator: params.operator.publicKey,
  });
  const config = getTsnPrivateSettlementConfigPda();
  const crankerVault = getTsnCrankerVaultPda({
    cranker,
    tokenMint: params.tokenMint,
  });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const recipientTokenAccount = getAssociatedTokenAddressSync(
    params.tokenMint,
    params.recipientWallet,
  );
  const verifierPda = getTsnVerifierPda();
  const expectedDna = getTsnPrivateSettlementDnaPda(params.paymentIdHash, params.commitmentDigest);
  if (!expectedDna.equals(params.settlementDna)) {
    throw new Error("settlement DNA does not match payment/commitment digest");
  }
  const message = createPrivatePayoutPermitMessage({
    operator: params.operator.publicKey,
    settlementDna: params.settlementDna,
    payoutNullifier: params.payoutNullifier,
    payoutSequence: params.payoutSequence,
    paymentIdHash: params.paymentIdHash,
    commitmentDigest: params.commitmentDigest,
    randomNonce: params.randomNonce,
    settlementCommitment: params.settlementCommitment,
    crankerVault,
    recipientWallet: params.recipientWallet,
    tokenMint: params.tokenMint,
    payoutAmount: params.payoutAmount,
    claimFeeAmount: params.claimFeeAmount ?? 0n,
    leaseIdHash: params.leaseIdHash,
    leaseVersion: params.leaseVersion,
    leaseExpiryTs: params.leaseExpiryTs,
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
      { pubkey: params.settlementDna, isSigner: false, isWritable: true },
      { pubkey: crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.recipientWallet, isSigner: false, isWritable: false },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: verifierPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concatBytes([
        instructionDiscriminator("tsn_execute_private_payout"),
        params.paymentIdHash,
        params.commitmentDigest,
        params.settlementCommitment,
        params.randomNonce,
        params.payoutNullifier,
        encodeU64(params.payoutSequence),
        encodeU64(params.payoutAmount),
        encodeU64(params.claimFeeAmount ?? 0n),
        params.leaseIdHash,
        encodeU64(params.leaseVersion),
        encodeI64(params.leaseExpiryTs),
        encodeI64(params.expiresAtTs),
        params.permitSignature,
      ]),
    ),
  });
  const transaction = new Transaction({
    feePayer: params.operator.publicKey,
  }).add(verifyInstruction, payoutInstruction);
  const signature = await sendAndConfirmHttp(
    connection,
    transaction,
    [params.operator],
  );
  return {
    signature,
    payoutNullifier: Buffer.from(params.payoutNullifier).toString("hex"),
  };
}

/** Mother-authorized epoch reimbursement for a consumed DNA voucher. */
export async function tsnSettlePrivateDnaReimbursementOnChain(params: {
  authority: Keypair;
  tokenMint: PublicKey;
  treasuryTokenAccount: PublicKey;
  crankerVault: PublicKey;
  paymentIdHash: Uint8Array;
  commitmentDigest: Uint8Array;
  rpcUrl?: string;
}) {
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentDigest, "commitment digest");
  const connection = new Connection(params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }), "confirmed");
  const motherEscrow = getTsnMotherEscrowPda();
  const treasuryPda = getTsnTreasuryPda();
  const settlementDna = getTsnPrivateSettlementDnaPda(params.paymentIdHash, params.commitmentDigest);
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault: params.crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault: params.crankerVault });
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: treasuryPda, isSigner: false, isWritable: false },
      { pubkey: settlementDna, isSigner: false, isWritable: true },
      { pubkey: params.crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.treasuryTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concatBytes([
      instructionDiscriminator("tsn_settle_private_dna_reimbursement"),
      params.paymentIdHash, params.commitmentDigest,
    ])),
  });
  const signature = await sendAndConfirmTransaction(connection, new Transaction({ feePayer: params.authority.publicKey }).add(instruction), [params.authority]);
  return { signature, settlementDna: settlementDna.toBase58(), crankerVault: params.crankerVault.toBase58() };
}

export async function tsnRecoverPrivateEscrowOnChain(params: {
  operator: Keypair;
  permitSigner: PublicKey;
  permitSignature: Uint8Array;
  recoveryNullifier: Uint8Array;
  recoverySequence: bigint;
  paymentIdHash: Uint8Array;
  commitmentHash: Uint8Array;
  payoutNullifier: Uint8Array;
  escrowTokenAccount: PublicKey;
  settlementCrankerOperator: PublicKey;
  tokenMint: PublicKey;
  recoveryAmount: bigint;
  leaseIdHash: Uint8Array;
  leaseVersion: bigint;
  leaseExpiryTs: bigint;
  expiresAtTs: bigint;
  rpcUrl?: string;
}) {
  throw new Error("Legacy private escrow recovery is disabled; use Mother-authorized DNA epoch reimbursement");
  /* legacy ABI retained below only for source compatibility */
  /*
  assertBytes32(params.recoveryNullifier, "recovery nullifier");
  assertBytes32(params.paymentIdHash, "payment id hash");
  assertBytes32(params.commitmentHash, "commitment hash");
  assertBytes32(params.payoutNullifier, "payout nullifier");
  assertSignature(params.permitSignature);
  const connection = new Connection(
    params.rpcUrl ?? resolveSolanaRpcUrl({ frontendSafe: false }),
    "confirmed",
  );
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
  const privateEscrowRecord = getTsnPrivateEscrowRecordPda(params.escrowTokenAccount);
  const message = createPrivateRecoveryPermitMessage({
    operator: params.operator.publicKey,
    recoveryNullifier: params.recoveryNullifier,
    recoverySequence: params.recoverySequence,
    escrowTokenAccount: params.escrowTokenAccount,
    settlementCrankerVault,
    settlementVaultTokenAccount,
    tokenMint: params.tokenMint,
    paymentIdHash: params.paymentIdHash,
    commitmentHash: params.commitmentHash,
    payoutNullifier: params.payoutNullifier,
    recoveryAmount: params.recoveryAmount,
    leaseIdHash: params.leaseIdHash,
    leaseVersion: params.leaseVersion,
    leaseExpiryTs: params.leaseExpiryTs,
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
      { pubkey: privateEscrowRecord, isSigner: false, isWritable: true },
      { pubkey: settlementCrankerVault, isSigner: false, isWritable: true },
      {
        pubkey: settlementVaultTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: verifierPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concatBytes([
        instructionDiscriminator("tsn_recover_private_escrow"),
        params.recoveryNullifier,
        encodeU64(params.recoverySequence),
        params.paymentIdHash,
        params.commitmentHash,
        params.payoutNullifier,
        encodeU64(params.recoveryAmount),
        params.leaseIdHash,
        encodeU64(params.leaseVersion),
        encodeI64(params.leaseExpiryTs),
        encodeI64(params.expiresAtTs),
        params.permitSignature,
      ]),
    ),
  });
  const signature = await sendAndConfirmHttp(
    connection,
    new Transaction({ feePayer: params.operator.publicKey }).add(
      verifyInstruction,
      recoveryInstruction,
    ),
    [params.operator],
  );
  return {
    signature,
    recoveryNullifier: Buffer.from(params.recoveryNullifier).toString("hex"),
  };
  */
}
