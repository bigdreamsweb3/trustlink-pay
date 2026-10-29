use anchor_lang::prelude::*;

use crate::authority::{derive_tsn_authorization_signer, TCAP_COMMITMENT_ROOT_SEED};
use crate::error::TcapError;
use crate::events::TcapGpruMemoCreditedV1;
use crate::state::{TcapAssetEntryV1, TcapAssetStatusV1, TcapCommitmentRootStateV1, TcapGlobalConfigV1, TcapReserveStateV1, TcapRiskStateV1};

pub const GPRU_PROGRAM_ID: Pubkey = pubkey!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
pub const ACTION_KIND_CREDIT_V1: u8 = 1;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct HiddenHeadProofArgsV1 {
    pub public_inputs: [[u8; 32]; 8],
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    pub action_kind: u8,
    pub token_id: u32,
    pub amount: u64,
    pub authorization_commitment: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreditGpruMemoV1Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_tcap_root: [u8; 32],
    pub tcap_root_sequence: u64,
    pub token_id: u32,
    pub nullifier: [u8; 32],
    pub amount: u64,
    pub proof: HiddenHeadProofArgsV1,
}

#[derive(Accounts)]
#[instruction(args: CreditGpruMemoV1Args)]
pub struct CreditGpruMemoV1<'info> {
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
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve, constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve, constraint = !reserve_state.paused @ TcapError::AssetUnavailable)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    /// CHECK: authenticated by TCAP config.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: TSN PDA signer derived from the authorized digest.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
    /// CHECK: canonical TIP route-membership root validated by GPRU.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: canonical GPRU Groth16 verifier PDA.
    pub gpru_verifier: UncheckedAccount<'info>,
    /// CHECK: canonical instructions sysvar used to bind memo and TSN caller.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: canonical deployed GPRU program.
    #[account(executable, address = GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CreditGpruMemoV1>, args: CreditGpruMemoV1Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.nullifier != [0; 32], TcapError::EmptyCommitment);
    require!(args.amount > 0, TcapError::InvalidDepositAmount);
    require!(args.previous_tcap_root != [0; 32], TcapError::WrongTcapRoot);

    let asset = &ctx.accounts.asset_entry;
    require!(asset.token_id == args.token_id, TcapError::WrongAsset);
    require!(matches!(asset.status, TcapAssetStatusV1::Active) && matches!(asset.risk_state, TcapRiskStateV1::Approved), TcapError::AssetUnavailable);
    require!(!asset.paused && !asset.deprecated, TcapError::AssetUnavailable);

    let commitment_root_key = ctx.accounts.commitment_root.key();
    require!(ctx.accounts.commitment_root.version == crate::TCAP_STATE_VERSION_V1, TcapError::InvalidPda);
    require!(args.previous_tcap_root == ctx.accounts.commitment_root.current_root, TcapError::WrongTcapRoot);
    require!(
        args.tcap_root_sequence == ctx.accounts.commitment_root.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::WrongTcapRoot
    );
    require!(args.proof.action_kind == ACTION_KIND_CREDIT_V1
        && args.proof.token_id == args.token_id
        && args.proof.amount == args.amount,
        TcapError::ProofPayloadRequired);
    require!(args.proof.public_inputs[0] == ctx.accounts.commitment_root.current_root
        && args.proof.public_inputs[1] != ctx.accounts.commitment_root.current_root
        && args.proof.public_inputs[4] == args.nullifier,
        TcapError::WrongTcapRoot);
    require!(args.proof.authorization_commitment == sha256_to_bn254_scalar(args.authorization_digest), TcapError::InvalidTsnAuthorizationSigner);

    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    let clock = Clock::get()?;
    require!(clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);

    let pending_liabilities = ctx.accounts.reserve_state.pending_liabilities;
    let settled_liabilities = ctx.accounts.reserve_state.settled_confidential_liabilities;
    require!(pending_liabilities >= args.amount, TcapError::InvalidReserveLiability);
    require!(ctx.accounts.reserve_state.actual_assets >= ctx.accounts.reserve_state.total_liabilities().ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidReserveLiability);

    // Verify the hidden latest-head update before changing reserve or root state.
    // Both mutations are in this TCAP instruction, so either both commit or neither does.
    let mut gpru_data = anchor_lang::solana_program::hash::hash(b"global:verify_hidden_head_transition_v1").to_bytes()[..8].to_vec();
    gpru_data.extend_from_slice(&args.proof.try_to_vec()?);
    let gpru_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: GPRU_PROGRAM_ID,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.tip_route_root.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(commitment_root_key, false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.gpru_verifier.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.instructions.key(), false),
        ],
        data: gpru_data,
    };
    anchor_lang::solana_program::program::invoke(&gpru_ix, &[
        ctx.accounts.tip_route_root.to_account_info(),
        ctx.accounts.commitment_root.to_account_info(),
        ctx.accounts.gpru_verifier.to_account_info(),
        ctx.accounts.instructions.to_account_info(),
        ctx.accounts.gpru_program.to_account_info(),
    ])?;

    let transition_digest = anchor_lang::solana_program::hash::hashv(&[
        b"TCAP_GPRU_MEMO_CREDIT_V1\0",
        &args.previous_tcap_root,
        &args.proof.public_inputs[1],
        &args.authorization_digest,
        &args.nullifier,
        &args.token_id.to_le_bytes(),
        &args.amount.to_le_bytes(),
        &args.proof.public_inputs[2],
    ]).to_bytes();
    let next_root = args.proof.public_inputs[1];
    let root = &mut ctx.accounts.commitment_root;
    let previous_root = root.current_root;
    root.previous_root = previous_root;
    root.current_root = next_root;
    root.sequence = args.tcap_root_sequence;
    root.root_version = root.root_version.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.pending_liabilities = pending_liabilities.checked_sub(args.amount).ok_or(TcapError::ArithmeticOverflow)?;
    ctx.accounts.reserve_state.settled_confidential_liabilities = settled_liabilities.checked_add(args.amount).ok_or(TcapError::ArithmeticOverflow)?;
    emit!(TcapGpruMemoCreditedV1 {
        previous_root,
        current_root: next_root,
        settlement_sequence: args.tcap_root_sequence,
        token_id: args.token_id,
        transition_digest,
    });
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
        for index in (0..32).rev() {
            let a = result[index] as u16;
            let b = MODULUS[index] as u16 + borrow;
            if a >= b { result[index] = (a - b) as u8; borrow = 0; }
            else { result[index] = (a + 256 - b) as u8; borrow = 1; }
        }
    }
    result
}
