use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::authority::{derive_tsn_authorization_signer, TCAP_COMMITMENT_ROOT_SEED};
use crate::error::TcapError;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapCommitmentRootStateV1, TcapGlobalConfigV1, TcapRiskStateV1};

pub const GPRU_PROGRAM_ID: Pubkey = pubkey!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
pub const GPRU_HIDDEN_HEAD_VERIFIER_SEED: &[u8] = b"gpru:hidden-head-verifier:v1";
pub const TIP_ROUTE_ROOT_SEED: &[u8] = b"tip:route-merkle-root:v1";
pub const ACTION_KIND_CREDIT_V1: u8 = 1;
pub const ACTION_KIND_DEBIT_V1: u8 = 2;
pub const ACTION_KIND_EXIT_V1: u8 = 3;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct HiddenHeadProofArgsV1 {
    pub public_inputs: [[u8; 32]; 6],
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    pub action_kind: u8,
    pub token_id: u32,
    pub amount: u64,
    pub authorization_commitment: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct AdvanceGpruHiddenHeadV1Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub next_root_sequence: u64,
    pub action_kind: u8,
    pub token_id: u32,
    pub amount: u64,
    pub memo_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub proof: HiddenHeadProofArgsV1,
}

#[derive(Accounts)]
pub struct AdvanceGpruHiddenHeadV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        mut,
        seeds = [TCAP_COMMITMENT_ROOT_SEED],
        bump = commitment_root.bump,
        constraint = config.commitment_root_state == commitment_root.key() @ TcapError::InvalidPda,
        constraint = !commitment_root.paused @ TcapError::ProtocolPaused
    )]
    pub commitment_root: Account<'info, TcapCommitmentRootStateV1>,
    #[account(
        seeds = [crate::authority::TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    /// CHECK: authenticated by TCAP config.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: TSN signer PDA derived from the authorized digest.
    pub tsn_authorization_signer: Signer<'info>,
    /// CHECK: canonical deployed GPRU program.
    #[account(executable, address = GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
    /// CHECK: GPRU validates the canonical TIP shared route root and its owner/layout.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: GPRU validates its canonical verifier PDA.
    pub gpru_verifier: UncheckedAccount<'info>,
    /// CHECK: canonical instructions sysvar used to bind the Memo and TSN caller.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdvanceGpruHiddenHeadV1>, args: AdvanceGpruHiddenHeadV1Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.memo_commitment != [0; 32] && args.nullifier != [0; 32], TcapError::EmptyCommitment);
    require!(matches!(args.action_kind, ACTION_KIND_CREDIT_V1 | ACTION_KIND_DEBIT_V1 | ACTION_KIND_EXIT_V1), TcapError::ProofPayloadRequired);
    require!(args.amount > 0 && args.token_id > 0, TcapError::InvalidDepositAmount);
    require!(args.proof.action_kind == args.action_kind && args.proof.token_id == args.token_id && args.proof.amount == args.amount, TcapError::ProofPayloadRequired);
    require!(args.proof.public_inputs[2] == sha256_to_bn254_scalar(args.memo_commitment), TcapError::EmptyCommitment);
    require!(args.proof.public_inputs[4] == args.nullifier, TcapError::EmptyCommitment);
    require!(args.proof.authorization_commitment == sha256_to_bn254_scalar(args.authorization_digest), TcapError::InvalidTsnAuthorizationSigner);
    require!(args.proof.public_inputs[0] == ctx.accounts.commitment_root.current_root, TcapError::WrongTcapRoot);
    require!(args.proof.public_inputs[1] != ctx.accounts.commitment_root.current_root, TcapError::WrongTcapRoot);
    require!(
        args.next_root_sequence == ctx.accounts.commitment_root.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::WrongTcapRoot
    );

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved), TcapError::AssetUnavailable);
    require!(!asset.paused && !asset.deprecated, TcapError::AssetUnavailable);

    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    let current_ix = load_current_index_checked(&ctx.accounts.instructions.to_account_info())? as usize;
    let top_level = load_instruction_at_checked(current_ix, &ctx.accounts.instructions.to_account_info())?;
    require_keys_eq!(top_level.program_id, ctx.accounts.config.approved_tsn_program, TcapError::InvalidTsnProgram);
    let slot = Clock::get()?.slot;
    require!(slot >= args.valid_after_slot && slot <= args.expires_at_slot, TcapError::AuthorizationExpired);

    let mut gpru_data = anchor_lang::solana_program::hash::hash(b"global:verify_hidden_head_transition_v1").to_bytes()[..8].to_vec();
    gpru_data.extend_from_slice(&args.proof.try_to_vec()?);
    let gpru_ix = Instruction {
        program_id: GPRU_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(ctx.accounts.tip_route_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.commitment_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.gpru_verifier.key(), false),
            AccountMeta::new_readonly(ctx.accounts.instructions.key(), false),
        ],
        data: gpru_data,
    };
    invoke(
        &gpru_ix,
        &[
            ctx.accounts.tip_route_root.to_account_info(),
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.gpru_verifier.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
        ],
    )?;

    let root = &mut ctx.accounts.commitment_root;
    let previous_root = root.current_root;
    root.previous_root = previous_root;
    root.current_root = args.proof.public_inputs[1];
    root.sequence = args.next_root_sequence;
    root.root_version = root.root_version.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?;
    Ok(())
}

fn sha256_to_bn254_scalar(value: [u8; 32]) -> [u8; 32] {
    const MODULUS: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
        0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
    ];
    let mut result = value;
    while result >= MODULUS {
        let mut borrow = 0u16;
        for i in (0..32).rev() {
            let a = result[i] as u16;
            let b = MODULUS[i] as u16 + borrow;
            if a >= b {
                result[i] = (a - b) as u8;
                borrow = 0;
            } else {
                result[i] = (a + 256 - b) as u8;
                borrow = 1;
            }
        }
    }
    result
}
