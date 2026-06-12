import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transferChecked,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { createHash } from "crypto";

function sha256Bytes(input: Uint8Array): Uint8Array {
  const digest = createHash("sha256").update(Buffer.from(input)).digest();
  return new Uint8Array(digest);
}

describe("tsn_flow (milestone 4)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustlinkEscrow as Program;
  const sender = provider.wallet as anchor.Wallet;

  const verifier = anchor.web3.Keypair.generate();
  const treasuryOwner = anchor.web3.Keypair.generate();
  const receiverPhoneIdentity = anchor.web3.Keypair.generate().publicKey;
  const secureReceiverAuthority = anchor.web3.Keypair.generate();
  const crankerOperator = anchor.web3.Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let senderTokenAccount: anchor.web3.PublicKey;
  let treasuryTokenAccount: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;

  let motherEscrowPda: anchor.web3.PublicKey;
  let crankerPda: anchor.web3.PublicKey;
  let verifierPda: anchor.web3.PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        verifier.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
      "confirmed",
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        crankerOperator.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
      "confirmed",
    );

    mint = await createMint(
      provider.connection,
      sender.payer,
      sender.publicKey,
      null,
      6,
    );
    senderTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        sender.payer,
        mint,
        sender.publicKey,
      )
    ).address;
    treasuryTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        sender.payer,
        mint,
        treasuryOwner.publicKey,
      )
    ).address;
    await mintTo(
      provider.connection,
      sender.payer,
      mint,
      senderTokenAccount,
      sender.publicKey,
      5_000_000_000,
    );

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
    [motherEscrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tsn_mother_escrow")],
      program.programId,
    );
    [verifierPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("verifier")],
      program.programId,
    );
    [crankerPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("tsn_cranker"),
        motherEscrowPda.toBuffer(),
        crankerOperator.publicKey.toBuffer(),
      ],
      program.programId,
    );
  });

  it("initializes base escrow config (if needed)", async () => {
    const existing = await provider.connection.getAccountInfo(
      configPda,
      "confirmed",
    );
    if (existing) return;

    await program.methods
      .initializeConfig(
        verifier.publicKey,
        treasuryOwner.publicKey,
        0,
        new anchor.BN(0),
        0,
        new anchor.BN(0),
        0,
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(3600),
      )
      .accounts({
        payer: sender.publicKey,
        config: configPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("initializes TSN mother escrow + registers cranker", async () => {
    const existing = await provider.connection.getAccountInfo(
      motherEscrowPda,
      "confirmed",
    );
    if (!existing) {
      await program.methods
        .tsnInitializeMotherEscrow(
          Array.from(sha256Bytes(new TextEncoder().encode("tsn-dev-seed"))),
          new anchor.BN(7 * 60 * 60),
          new anchor.BN(30),
          null,
          null,
          null,
        )
        .accounts({
          authority: sender.publicKey,
          motherEscrow: motherEscrowPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const existingCranker = await provider.connection.getAccountInfo(
      crankerPda,
      "confirmed",
    );
    if (!existingCranker) {
      await program.methods
        .tsnRegisterCranker()
        .accounts({
          operator: crankerOperator.publicKey,
          motherEscrow: motherEscrowPda,
          cranker: crankerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crankerOperator])
        .rpc();
    }

    const motherEscrow = await (program.account as any).motherEscrow.fetch(
      motherEscrowPda,
    );
    expect(motherEscrow.leaseSeconds.toNumber()).to.equal(30);
  });

  it("creates payment -> cranker submits intent -> earns and spends claim credit", async () => {
    const paymentId = Uint8Array.from(
      Array.from({ length: 32 }, (_, index) => 33 + index),
    );
    const [paymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(paymentId)],
      program.programId,
    );
    const [vaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), Buffer.from(paymentId)],
      program.programId,
    );
    const escrowVault = anchor.web3.Keypair.generate();
    const expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    await program.methods
      .createPayment(
        [...paymentId],
        receiverPhoneIdentity,
        secureReceiverAuthority.publicKey,
        { secure: {} } as any,
        new anchor.BN(1_250_000),
        new anchor.BN(0),
        expiryTs,
      )
      .accounts({
        payer: sender.publicKey,
        sender: sender.publicKey,
        senderTokenAccount,
        config: configPda,
        tokenMint: mint,
        treasuryTokenAccount,
        paymentAccount: paymentPda,
        vaultAuthority: vaultAuthorityPda,
        escrowVault: escrowVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowVault])
      .rpc();

    const vault = await getAccount(provider.connection, escrowVault.publicKey);
    expect(Number(vault.amount)).to.equal(1_250_000);

    const intentId = paymentId; // deterministic mapping for now
    const [intentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("tsn_intent"),
        motherEscrowPda.toBuffer(),
        Buffer.from(intentId),
      ],
      program.programId,
    );

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: sender.publicKey,
          toPubkey: verifierPda,
          lamports: anchor.web3.LAMPORTS_PER_SOL,
        }),
      ),
      [],
    );

    await program.methods
      .tsnCreateIntent(
        [...intentId],
        paymentPda,
        mint,
        new anchor.BN(1_250_000),
        Array.from(sha256Bytes(receiverPhoneIdentity.toBytes())),
      )
      .accounts({
        crankerOperator: crankerOperator.publicKey,
        motherEscrow: motherEscrowPda,
        cranker: crankerPda,
        verifierPda,
        intent: intentPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([crankerOperator])
      .rpc();

    let cranker = await (program.account as any).cranker.fetch(crankerPda);
    expect(cranker.claimCredits.toNumber()).to.equal(1);

    await program.methods
      .tsnClaimIntent()
      .accounts({
        operator: crankerOperator.publicKey,
        motherEscrow: motherEscrowPda,
        intent: intentPda,
        cranker: crankerPda,
      })
      .signers([crankerOperator])
      .rpc();

    const intent = await (program.account as any).paymentIntent.fetch(
      intentPda,
    );
    cranker = await (program.account as any).cranker.fetch(crankerPda);
    expect(intent.assignedCranker.toBase58()).to.equal(crankerPda.toBase58());
    expect(intent.status.claimed).to.not.equal(undefined);
    expect(cranker.claimCredits.toNumber()).to.equal(0);
  });

  it("registers a commitment and enforces an OTDT settlement lease", async () => {
    const paymentIntentId = new anchor.BN(Date.now());
    const paymentIdBytes = paymentIntentId.toArrayLike(Buffer, "le", 8);
    const [paymentVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), paymentIdBytes],
      program.programId,
    );
    const paymentVaultTokenAccount = getAssociatedTokenAddressSync(
      mint,
      paymentVault,
      true,
    );
    const transferId = sha256Bytes(new TextEncoder().encode("transfer-id"));
    const decryptionSecret = sha256Bytes(
      new TextEncoder().encode("settlement-secret"),
    );
    const commitmentHash = sha256Bytes(decryptionSecret);
    const otdt = sha256Bytes(
      new TextEncoder().encode("one-time-decryption-token"),
    );
    const otdtHash = sha256Bytes(otdt);

    await (program.methods as any)
      .tsnProcessPaymentIntent(
        paymentIntentId,
        new anchor.BN(1_250_000),
        Array.from(transferId),
        Array.from(commitmentHash),
      )
      .accounts({
        crankerOperator: crankerOperator.publicKey,
        motherEscrow: motherEscrowPda,
        cranker: crankerPda,
        verifierPda,
        uniqueVaultAccount: paymentVault,
        uniqueTokenAccount: paymentVaultTokenAccount,
        mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([crankerOperator])
      .rpc();

    let vault = await (program.account as any).vaultState.fetch(paymentVault);
    expect(
      Buffer.from(vault.transferId).equals(Buffer.from(transferId)),
    ).to.equal(true);
    expect(
      Buffer.from(vault.commitmentHash).equals(Buffer.from(commitmentHash)),
    ).to.equal(true);
    expect(vault.status.created).to.not.equal(undefined);

    await transferChecked(
      provider.connection,
      sender.payer,
      senderTokenAccount,
      mint,
      paymentVaultTokenAccount,
      sender.payer,
      1_250_000,
      6,
    );

    await (program.methods as any)
      .tsnFinalizePaymentIntent(paymentIntentId, new anchor.BN(1_250_000))
      .accounts({
        crankerOperator: crankerOperator.publicKey,
        motherEscrow: motherEscrowPda,
        cranker: crankerPda,
        paymentVault,
        paymentVaultTokenAccount,
      })
      .signers([crankerOperator])
      .rpc();

    vault = await (program.account as any).vaultState.fetch(paymentVault);
    expect(vault.status.escrowed).to.not.equal(undefined);

    await (program.methods as any)
      .tsnClaimVaultSettlement(paymentIntentId, Array.from(otdtHash))
      .accounts({
        operator: crankerOperator.publicKey,
        motherEscrow: motherEscrowPda,
        cranker: crankerPda,
        paymentVault,
      })
      .signers([crankerOperator])
      .rpc();

    vault = await (program.account as any).vaultState.fetch(paymentVault);
    expect(vault.status.leased).to.not.equal(undefined);
    expect(Buffer.from(vault.otdtHash).equals(Buffer.from(otdtHash))).to.equal(
      true,
    );
  });
});
