import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAllowedTokenByMint,
  getConnection,
  getEscrowAuthorityKeypair,
  getProgramId,
  instructionDiscriminator,
  requireEscrowConfigInitialized,
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

const ESCROW_V3_SEED = Buffer.from("escrow_v3");
const ESCROW_V3_VAULT_AUTHORITY_SEED = Buffer.from("escrow_v3_vault_authority");
const ESCROW_V3_NONCE_SEED = Buffer.from("escrow_v3_nonce");

function hexToBytes(hex: string, expectedLength: number) {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== expectedLength * 2) {
    throw new Error(`Expected ${expectedLength} bytes encoded as hex`);
  }
  return Buffer.from(normalized, "hex");
}

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

function encodeFixed64Hex(hex: string) {
  return hexToBytes(hex, 64);
}

export function getEscrowV3Pdas(params: {
  recipientChildHashHex: string;
  nonce: bigint;
  tokenMintAddress: string;
}) {
  const recipientChildHash = hexToBytes(params.recipientChildHashHex, 32);
  const mint = new PublicKey(params.tokenMintAddress);
  const nonceBytes = encodeU64(params.nonce);
  const [escrow] = PublicKey.findProgramAddressSync(
    [ESCROW_V3_SEED, recipientChildHash, nonceBytes, mint.toBuffer()],
    getProgramId(),
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [ESCROW_V3_VAULT_AUTHORITY_SEED, recipientChildHash, nonceBytes, mint.toBuffer()],
    getProgramId(),
  );
  return { escrow, vaultAuthority };
}

function getNoncePda(masterRegistryPubkey: string, nonce: bigint) {
  const [nonceAccount] = PublicKey.findProgramAddressSync(
    [ESCROW_V3_NONCE_SEED, new PublicKey(masterRegistryPubkey).toBuffer(), encodeU64(nonce)],
    getProgramId(),
  );
  return nonceAccount;
}

function derivationMessage(params: {
  childPubkey: string;
  escrowPubkey: string;
  nonce: bigint;
  expiryTs: bigint;
  destinationPubkey: string;
}) {
  return Buffer.concat([
    Buffer.from("TLP_DERIVE_V1"),
    new PublicKey(params.childPubkey).toBuffer(),
    new PublicKey(params.escrowPubkey).toBuffer(),
    encodeU64(params.nonce),
    encodeI64(params.expiryTs),
    new PublicKey(params.destinationPubkey).toBuffer(),
  ]);
}

function claimMessage(params: {
  escrowPubkey: string;
  nonce: bigint;
  expiryTs: bigint;
  destinationPubkey: string;
}) {
  return Buffer.concat([
    Buffer.from("TLP_CLAIM_V1"),
    new PublicKey(params.escrowPubkey).toBuffer(),
    encodeU64(params.nonce),
    encodeI64(params.expiryTs),
    new PublicKey(params.destinationPubkey).toBuffer(),
  ]);
}

export async function prepareCreateEscrowV3(params: {
  senderWallet: string;
  tokenMintAddress: string;
  amount: number;
  recipientChildHashHex: string;
  masterRegistryPubkey: string;
  nonce: bigint;
  expiryUnixSeconds: bigint;
  autoClaimDestinationHashHex: string;
  derivationProofSigHex: string;
}) {
  const tokenConfig = getAllowedTokenByMint(params.tokenMintAddress);
  if (!tokenConfig) {
    throw new Error("This token mint is not allowlisted by TrustLink");
  }

  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const sender = new PublicKey(params.senderWallet);
  const mint = new PublicKey(params.tokenMintAddress);
  const senderTokenAccount = splToken.getAssociatedTokenAddressSync(mint, sender);
  const { escrow, vaultAuthority } = getEscrowV3Pdas(params);
  const escrowVault = Keypair.generate();
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const data = Buffer.concat([
    instructionDiscriminator("create_escrow_v3"),
    hexToBytes(params.recipientChildHashHex, 32),
    new PublicKey(params.masterRegistryPubkey).toBuffer(),
    encodeU64(params.nonce),
    encodeI64(params.expiryUnixSeconds),
    hexToBytes(params.autoClaimDestinationHashHex, 32),
    encodeFixed64Hex(params.derivationProofSigHex),
    encodeU64(toBaseUnits(params.amount, tokenConfig.decimals)),
  ]);

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
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
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    escrowPda: escrow.toBase58(),
    escrowVault: escrowVault.publicKey.toBase58(),
    vaultAuthority: vaultAuthority.toBase58(),
    programId: getProgramId().toBase58(),
  };
}

export async function prepareClaimEscrowV3(params: {
  escrowPubkey: string;
  escrowVault: string;
  tokenMintAddress: string;
  masterRegistryPubkey: string;
  nonce: bigint;
  expiryUnixSeconds: bigint;
  childPubkey: string;
  destinationPubkey: string;
  derivationProofSigHex: string;
  childSigHex: string;
}) {
  const connection: Connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const mint = new PublicKey(params.tokenMintAddress);
  const destinationOwner = new PublicKey(params.destinationPubkey);
  const destinationTokenAccount = splToken.getAssociatedTokenAddressSync(mint, destinationOwner);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const destinationAtaInfo = await connection.getAccountInfo(destinationTokenAccount, "confirmed");
  if (!destinationAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        destinationTokenAccount,
        destinationOwner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  const nonceAccount = getNoncePda(params.masterRegistryPubkey, params.nonce);
  const claimData = Buffer.concat([
    instructionDiscriminator("claim_v3"),
    new PublicKey(params.childPubkey).toBuffer(),
    new PublicKey(params.destinationPubkey).toBuffer(),
    encodeFixed64Hex(params.derivationProofSigHex),
    encodeFixed64Hex(params.childSigHex),
  ]);

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(params.escrowPubkey), isSigner: false, isWritable: true },
        { pubkey: nonceAccount, isSigner: false, isWritable: true },
        { pubkey: getEscrowV3Pdas({
            recipientChildHashHex: Buffer.from(
              require("crypto").createHash("sha256").update(new PublicKey(params.childPubkey).toBuffer()).digest(),
            ).toString("hex"),
            nonce: params.nonce,
            tokenMintAddress: params.tokenMintAddress,
          }).vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(params.escrowVault), isSigner: false, isWritable: true },
        { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimData,
    }),
  );

  transaction.partialSign(payer);

  return {
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    programId: getProgramId().toBase58(),
    destinationTokenAccount: destinationTokenAccount.toBase58(),
    requiredProofs: {
      derivation: {
        pubkey: params.masterRegistryPubkey,
        signatureHex: params.derivationProofSigHex,
        messageBase64: derivationMessage({
          childPubkey: params.childPubkey,
          escrowPubkey: params.escrowPubkey,
          nonce: params.nonce,
          expiryTs: params.expiryUnixSeconds,
          destinationPubkey: params.destinationPubkey,
        }).toString("base64"),
      },
      child: {
        pubkey: params.childPubkey,
        signatureHex: params.childSigHex,
        messageBase64: claimMessage({
          escrowPubkey: params.escrowPubkey,
          nonce: params.nonce,
          expiryTs: params.expiryUnixSeconds,
          destinationPubkey: params.destinationPubkey,
        }).toString("base64"),
      },
    },
  };
}

export async function prepareAutoClaimEscrowV3(params: {
  escrowPubkey: string;
  escrowVault: string;
  tokenMintAddress: string;
  masterRegistryPubkey: string;
  recipientChildHashHex: string;
  nonce: bigint;
  expiryUnixSeconds: bigint;
  childPubkey: string;
  destinationPubkey: string;
  derivationProofSigHex: string;
}) {
  const connection = getConnection();
  const payer = getEscrowAuthorityKeypair();
  const mint = new PublicKey(params.tokenMintAddress);
  const destinationOwner = new PublicKey(params.destinationPubkey);
  const destinationTokenAccount = splToken.getAssociatedTokenAddressSync(mint, destinationOwner);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  const destinationAtaInfo = await connection.getAccountInfo(destinationTokenAccount, "confirmed");
  if (!destinationAtaInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        destinationTokenAccount,
        destinationOwner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  const nonceAccount = getNoncePda(params.masterRegistryPubkey, params.nonce);
  const vaultAuthority = getEscrowV3Pdas({
    recipientChildHashHex: params.recipientChildHashHex,
    nonce: params.nonce,
    tokenMintAddress: params.tokenMintAddress,
  }).vaultAuthority;

  transaction.add(
    new TransactionInstruction({
      programId: getProgramId(),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(params.escrowPubkey), isSigner: false, isWritable: true },
        { pubkey: nonceAccount, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(params.escrowVault), isSigner: false, isWritable: true },
        { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        instructionDiscriminator("auto_claim_v3"),
        new PublicKey(params.childPubkey).toBuffer(),
        new PublicKey(params.destinationPubkey).toBuffer(),
        encodeFixed64Hex(params.derivationProofSigHex),
      ]),
    }),
  );

  transaction.partialSign(payer);

  return {
    serializedTransaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    programId: getProgramId().toBase58(),
    destinationTokenAccount: destinationTokenAccount.toBase58(),
    requiredProofs: {
      derivation: {
        pubkey: params.masterRegistryPubkey,
        signatureHex: params.derivationProofSigHex,
        messageBase64: derivationMessage({
          childPubkey: params.childPubkey,
          escrowPubkey: params.escrowPubkey,
          nonce: params.nonce,
          expiryTs: params.expiryUnixSeconds,
          destinationPubkey: params.destinationPubkey,
        }).toString("base64"),
      },
    },
  };
}
