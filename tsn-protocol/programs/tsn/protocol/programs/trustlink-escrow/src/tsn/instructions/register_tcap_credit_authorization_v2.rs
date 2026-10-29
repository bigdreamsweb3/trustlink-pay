use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};

use crate::tsn::{
    constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED},
    errors::TsnError,
    state::MotherEscrow,
};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
pub const GPRU_PROGRAM_ID: Pubkey = pubkey!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
const AUTHORIZATION_DOMAIN: &[u8] = b"TSN_GPRU_TCAP_CREDIT_HIDDEN_HEAD_V1\0";

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
pub struct RegisterTcapCreditAuthorizationV2Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_tcap_root: [u8; 32],
    pub tcap_root_sequence: u64,
    pub token_id: u32,
    pub amount_base_units: u64,
    pub nullifier: [u8; 32],
    pub proof: HiddenHeadProofArgsV1,
}

#[derive(Accounts)]
#[instruction(args: RegisterTcapCreditAuthorizationV2Args)]
pub struct RegisterTcapCreditAuthorizationV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [TSN_MOTHER_ESCROW_SEED], bump = mother_escrow.bump, constraint = mother_escrow.authority == authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Account<'info, MotherEscrow>,
    /// CHECK: constrained to the governed TCAP deployment.
    #[account(executable, address = TCAP_PROGRAM_ID)]
    pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: TCAP validates this exact approved TSN executable.
    #[account(executable, address = crate::ID)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP against its global config.
    pub tcap_config: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP against its registered asset and reserve.
    pub tcap_asset_entry: UncheckedAccount<'info>,
    /// CHECK: the shared TCAP root is mutated by TCAP in the same transition.
    #[account(mut)]
    pub commitment_root: UncheckedAccount<'info>,
    /// CHECK: canonical asset reserve; TCAP validates and updates it atomically.
    #[account(mut)]
    pub reserve_state: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA derived from the opaque authorization digest.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    /// CHECK: TIP's shared route-membership root; GPRU validates its owner/PDA/layout.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: canonical GPRU verifier configuration PDA.
    pub gpru_verifier: UncheckedAccount<'info>,
    /// CHECK: canonical instruction sysvar for Memo and top-level caller binding.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: canonical deployed GPRU program.
    #[account(executable, address = GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<RegisterTcapCreditAuthorizationV2>,
    args: RegisterTcapCreditAuthorizationV2Args,
) -> Result<()> {
    require!(args.authorization_digest != [0; 32] && args.nullifier != [0; 32], TsnError::Unauthorized);
    require!(args.amount_base_units > 0 && args.token_id > 0, TsnError::Unauthorized);
    require!(args.expires_at_slot >= args.valid_after_slot, TsnError::Unauthorized);
    require!(args.proof.action_kind == 1
        && args.proof.token_id == args.token_id
        && args.proof.amount == args.amount_base_units
        && args.proof.public_inputs[0] == args.previous_tcap_root
        && args.proof.public_inputs[4] == args.nullifier,
        TsnError::Unauthorized);
    require!(args.proof.authorization_commitment == sha256_to_bn254_scalar(args.authorization_digest), TsnError::Unauthorized);
    require!(args.authorization_digest == derive_authorization_digest_v2(&args, &ctx.accounts.commitment_root.key()), TsnError::Unauthorized);

    let (expected_signer, bump) = Pubkey::find_program_address(
        &[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest],
        &crate::ID,
    );
    require_keys_eq!(expected_signer, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);

    let tcap_args = tcap::instructions::credit_gpru_memo_v1::CreditGpruMemoV1Args {
        authorization_digest: args.authorization_digest,
        valid_after_slot: args.valid_after_slot,
        expires_at_slot: args.expires_at_slot,
        previous_tcap_root: args.previous_tcap_root,
        tcap_root_sequence: args.tcap_root_sequence,
        token_id: args.token_id,
        amount: args.amount_base_units,
        nullifier: args.nullifier,
        proof: tcap::instructions::credit_gpru_memo_v1::HiddenHeadProofArgsV1 {
            public_inputs: args.proof.public_inputs,
            proof_a: args.proof.proof_a,
            proof_b: args.proof.proof_b,
            proof_c: args.proof.proof_c,
            action_kind: args.proof.action_kind,
            token_id: args.proof.token_id,
            amount: args.proof.amount,
            authorization_commitment: args.proof.authorization_commitment,
        },
    };
    let mut data = anchor_lang::solana_program::hash::hash(b"global:credit_gpru_memo_v1").to_bytes()[..8].to_vec();
    data.extend_from_slice(&tcap_args.try_to_vec()?);
    let instruction = Instruction {
        program_id: TCAP_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
            AccountMeta::new(ctx.accounts.commitment_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_asset_entry.key(), false),
            AccountMeta::new(ctx.accounts.reserve_state.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tsn_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
            AccountMeta::new_readonly(ctx.accounts.tip_route_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.gpru_verifier.key(), false),
            AccountMeta::new_readonly(ctx.accounts.instructions.key(), false),
            AccountMeta::new_readonly(ctx.accounts.gpru_program.key(), false),
        ],
        data,
    };
    invoke_signed(
        &instruction,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.tcap_config.to_account_info(),
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.tcap_asset_entry.to_account_info(),
            ctx.accounts.reserve_state.to_account_info(),
            ctx.accounts.tsn_program.to_account_info(),
            ctx.accounts.tcap_authorization_signer.to_account_info(),
            ctx.accounts.tip_route_root.to_account_info(),
            ctx.accounts.gpru_verifier.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
            ctx.accounts.tcap_program.to_account_info(),
        ],
        &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]],],
    )?;
    Ok(())
}

pub fn derive_authorization_digest_v2(
    args: &RegisterTcapCreditAuthorizationV2Args,
    commitment_root: &Pubkey,
) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[
        AUTHORIZATION_DOMAIN,
        commitment_root.as_ref(),
        &args.previous_tcap_root,
        &args.tcap_root_sequence.to_le_bytes(),
        &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.amount_base_units.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.nullifier,
    ]).to_bytes()
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
