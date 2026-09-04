use anchor_lang::prelude::*;
use crate::authority::derive_tsn_authorization_signer;
use crate::error::TcapError;
use crate::state::{TcapEncryptedSnapshot, TcapGlobalConfigV1, TcapOneTimeTip};

pub const ENCRYPTED_SNAPSHOT_SEED: &[u8] = b"tcap:encrypted-snapshot";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StoreEncryptedSnapshotArgs {
    pub authorization_digest: [u8; 32],
    pub commitment: [u8; 32],
    pub owner_binding: [u8; 32],
    pub sequence: u64,
    pub nonce: [u8; 12],
    pub ciphertext_commitment: [u8; 32],
    pub ciphertext: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: StoreEncryptedSnapshotArgs)]
pub struct StoreEncryptedSnapshot<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut)] pub one_time_tip: Account<'info, TcapOneTimeTip>,
    #[account(init, payer = payer, space = TcapEncryptedSnapshot::space(args.ciphertext.len()), seeds = [ENCRYPTED_SNAPSHOT_SEED, one_time_tip.key().as_ref(), args.commitment.as_ref()], bump)]
    pub snapshot: Account<'info, TcapEncryptedSnapshot>,
    pub system_program: Program<'info, System>,
    /// CHECK: approved TSN executable.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: signer PDA supplied by TSN CPI.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
}

pub fn store(ctx: Context<StoreEncryptedSnapshot>, args: StoreEncryptedSnapshotArgs) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.owner_binding != [0; 32] && args.ciphertext_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(!args.ciphertext.is_empty(), TcapError::EmptyCommitment);
    require!(args.sequence == ctx.accounts.one_time_tip.sequence, TcapError::InvalidTipSequence);
    require!(args.commitment == ctx.accounts.one_time_tip.commitment, TcapError::TipCommitmentMismatch);
    let (expected, bump) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    let snapshot = &mut ctx.accounts.snapshot;
    snapshot.tip = ctx.accounts.one_time_tip.key();
    snapshot.commitment = args.commitment;
    snapshot.owner_binding = args.owner_binding;
    snapshot.sequence = args.sequence;
    snapshot.nonce = args.nonce;
    snapshot.ciphertext_commitment = args.ciphertext_commitment;
    snapshot.ciphertext = args.ciphertext;
    snapshot.bump = ctx.bumps.snapshot;
    let _ = bump;
    Ok(())
}
