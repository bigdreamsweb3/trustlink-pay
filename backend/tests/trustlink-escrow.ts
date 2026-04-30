import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
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
  const receiverSettlementWallet = anchor.web3.Keypair.generate();
  const senderPhoneIdentity = anchor.web3.Keypair.generate().publicKey;
  const receiverPhoneIdentity = anchor.web3.Keypair.generate().publicKey;
  const secureReceiverAuthority = anchor.web3.Keypair.generate();
  const refundReceiverAuthority = anchor.web3.Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let senderTokenAccount: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(verifier.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      "confirmed",
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        receiverSettlementWallet.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
      "confirmed",
    );

    mint = await createMint(provider.connection, sender.payer, sender.publicKey, null, 6);
    senderTokenAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, sender.payer, mint, sender.publicKey)
    ).address;
    await mintTo(provider.connection, sender.payer, mint, senderTokenAccount, sender.publicKey, 5_000_000_000);

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
  });

  it("initializes config with verifier", async () => {
    await program.methods
      .initializeConfig(verifier.publicKey, new anchor.BN(3600))
      .accounts({
        payer: sender.publicKey,
        config: configPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.escrowConfig.fetch(configPda);
    expect(config.claimVerifier.toBase58()).to.equal(verifier.publicKey.toBase58());
    expect(config.defaultExpirySeconds.toNumber()).to.equal(3600);
  });

  it("creates a secure payment with locked escrow state", async () => {
    const paymentId = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
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
        new anchor.BN(1_500_000),
        expiryTs,
      )
      .accounts({
        payer: sender.publicKey,
        sender: sender.publicKey,
        senderTokenAccount,
        config: configPda,
        tokenMint: mint,
        paymentAccount: paymentPda,
        vaultAuthority: vaultAuthorityPda,
        escrowVault: escrowVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowVault])
      .rpc();

    const payment = await program.account.paymentAccount.fetch(paymentPda);
    const vault = await getAccount(provider.connection, escrowVault.publicKey);

    expect(payment.senderPhoneIdentityPubkey.toBase58()).to.equal(anchor.web3.PublicKey.default.toBase58());
    expect(payment.paymentMode.secure).to.not.equal(undefined);
    expect(payment.amount.toNumber()).to.equal(1_500_000);
    expect(payment.status.locked).to.not.equal(undefined);
    expect(Number(vault.amount)).to.equal(1_500_000);
  });

  it("marks expired invite payments as expired without sweeping funds", async () => {
    const paymentId = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 100 + index));
    const [paymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(paymentId)],
      program.programId,
    );
    const [vaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), Buffer.from(paymentId)],
      program.programId,
    );
    const escrowVault = anchor.web3.Keypair.generate();
    const expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 1);

    await program.methods
      .createPayment(
        [...paymentId],
        receiverPhoneIdentity,
        receiverPhoneIdentity,
        { invite: {} } as any,
        new anchor.BN(500_000),
        expiryTs,
      )
      .accounts({
        payer: sender.publicKey,
        sender: sender.publicKey,
        senderTokenAccount,
        config: configPda,
        tokenMint: mint,
        paymentAccount: paymentPda,
        vaultAuthority: vaultAuthorityPda,
        escrowVault: escrowVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowVault])
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    await program.methods
      .markExpired([...paymentId])
      .accounts({
        claimVerifier: verifier.publicKey,
        config: configPda,
        paymentAccount: paymentPda,
      })
      .signers([verifier])
      .rpc();

    const payment = await program.account.paymentAccount.fetch(paymentPda);
    const vault = await getAccount(provider.connection, escrowVault.publicKey);

    expect(payment.status.expired).to.not.equal(undefined);
    expect(payment.expiredAtTs.toNumber()).to.be.greaterThan(0);
    expect(Number(vault.amount)).to.equal(500_000);
  });
});
