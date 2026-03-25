import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("trustlink_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustlinkEscrow as Program;
  const sender = provider.wallet as anchor.Wallet;
  const verifier = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
  const outsider = anchor.web3.Keypair.generate();

  const paymentId = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
  const receiverPhoneHash = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 255 - index));

  let mint: anchor.web3.PublicKey;
  let senderTokenAccount: anchor.web3.PublicKey;
  let receiverTokenAccount: anchor.web3.PublicKey;
  let senderRefundTokenAccount: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;
  let paymentPda: anchor.web3.PublicKey;
  let vaultAuthorityPda: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    await provider.connection.requestAirdrop(verifier.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(receiver.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(outsider.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    mint = await createMint(
      provider.connection,
      sender.payer,
      sender.publicKey,
      null,
      6
    );

    senderTokenAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, sender.payer, mint, sender.publicKey)
    ).address;
    receiverTokenAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, sender.payer, mint, receiver.publicKey)
    ).address;
    senderRefundTokenAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, sender.payer, mint, sender.publicKey)
    ).address;

    await mintTo(
      provider.connection,
      sender.payer,
      mint,
      senderTokenAccount,
      sender.publicKey,
      5_000_000_000
    );

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [paymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(paymentId)],
      program.programId
    );

    [vaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), Buffer.from(paymentId)],
      program.programId
    );

    vaultTokenAccount = await anchor.utils.token.associatedAddress({
      mint,
      owner: vaultAuthorityPda,
    });
  });

  it("initializes config", async () => {
    await program.methods
      .initializeConfig(verifier.publicKey)
      .accounts({
        payer: sender.publicKey,
        config: configPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.escrowConfig.fetch(configPda);
    expect(config.claimVerifier.toBase58()).to.equal(verifier.publicKey.toBase58());
  });

  it("creates and funds escrow", async () => {
    const expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    await program.methods
      .createPayment([...paymentId], [...receiverPhoneHash], new anchor.BN(1_500_000), expiryTs)
      .accounts({
        sender: sender.publicKey,
        senderTokenAccount,
        tokenMint: mint,
        paymentAccount: paymentPda,
        vaultAuthority: vaultAuthorityPda,
        escrowVault: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const payment = await program.account.paymentAccount.fetch(paymentPda);
    const vault = await getAccount(provider.connection, vaultTokenAccount);

    expect(payment.amount.toNumber()).to.equal(1_500_000);
    expect(payment.status.pending).to.not.equal(undefined);
    expect(Number(vault.amount)).to.equal(1_500_000);
  });

  it("prevents double claim", async () => {
    await program.methods
      .claimPayment([...paymentId], [...receiverPhoneHash])
      .accounts({
        claimVerifier: verifier.publicKey,
        config: configPda,
        paymentAccount: paymentPda,
        vaultAuthority: vaultAuthorityPda,
        escrowVault: vaultTokenAccount,
        receiverTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([verifier])
      .rpc();

    const payment = await program.account.paymentAccount.fetch(paymentPda);
    expect(payment.status.claimed).to.not.equal(undefined);

    try {
      await program.methods
        .claimPayment([...paymentId], [...receiverPhoneHash])
        .accounts({
          claimVerifier: verifier.publicKey,
          config: configPda,
          paymentAccount: paymentPda,
          vaultAuthority: vaultAuthorityPda,
          escrowVault: vaultTokenAccount,
          receiverTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([verifier])
        .rpc();

      expect.fail("second claim should fail");
    } catch (error) {
      expect(String(error)).to.include("PaymentNotPending");
    }
  });

  it("cancels expired payments", async () => {
    const secondPaymentId = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 10 + index));
    const [secondPaymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(secondPaymentId)],
      program.programId
    );
    const [secondVaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), Buffer.from(secondPaymentId)],
      program.programId
    );
    const secondVaultTokenAccount = await anchor.utils.token.associatedAddress({
      mint,
      owner: secondVaultAuthorityPda,
    });

    await program.methods
      .createPayment(
        [...secondPaymentId],
        [...receiverPhoneHash],
        new anchor.BN(500_000),
        new anchor.BN(Math.floor(Date.now() / 1000) - 5)
      )
      .accounts({
        sender: sender.publicKey,
        senderTokenAccount,
        tokenMint: mint,
        paymentAccount: secondPaymentPda,
        vaultAuthority: secondVaultAuthorityPda,
        escrowVault: secondVaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    await program.methods
      .cancelPayment([...secondPaymentId])
      .accounts({
        sender: sender.publicKey,
        paymentAccount: secondPaymentPda,
        vaultAuthority: secondVaultAuthorityPda,
        escrowVault: secondVaultTokenAccount,
        senderRefundTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const payment = await program.account.paymentAccount.fetch(secondPaymentPda);
    expect(payment.status.cancelled).to.not.equal(undefined);
  });

  it("expires and refunds pending payments", async () => {
    const thirdPaymentId = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 20 + index));
    const [thirdPaymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(thirdPaymentId)],
      program.programId
    );
    const [thirdVaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), Buffer.from(thirdPaymentId)],
      program.programId
    );
    const thirdVaultTokenAccount = await anchor.utils.token.associatedAddress({
      mint,
      owner: thirdVaultAuthorityPda,
    });

    await program.methods
      .createPayment(
        [...thirdPaymentId],
        [...receiverPhoneHash],
        new anchor.BN(250_000),
        new anchor.BN(Math.floor(Date.now() / 1000) - 5)
      )
      .accounts({
        sender: sender.publicKey,
        senderTokenAccount,
        tokenMint: mint,
        paymentAccount: thirdPaymentPda,
        vaultAuthority: thirdVaultAuthorityPda,
        escrowVault: thirdVaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    await program.methods
      .expirePayment([...thirdPaymentId])
      .accounts({
        paymentAccount: thirdPaymentPda,
        vaultAuthority: thirdVaultAuthorityPda,
        escrowVault: thirdVaultTokenAccount,
        senderRefundTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const payment = await program.account.paymentAccount.fetch(thirdPaymentPda);
    expect(payment.status.expired).to.not.equal(undefined);
  });
});
