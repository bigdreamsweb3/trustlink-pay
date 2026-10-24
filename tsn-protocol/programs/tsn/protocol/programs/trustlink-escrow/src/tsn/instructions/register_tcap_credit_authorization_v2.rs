use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};

use crate::tsn::{constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED}, errors::TsnError, state::MotherEscrow};

pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
pub const GPRU_PROGRAM_ID: Pubkey = pubkey!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
const AUTHORIZATION_DOMAIN: &[u8] = b"TSN_GPRU_TCAP_CREDIT_V2";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct GpruDnaKeyProofV1 {
    pub shared_point: [u8; 32],
    pub generator_commitment: [u8; 32],
    pub scan_commitment: [u8; 32],
    pub response: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapCreditAuthorizationV2Args {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub dna_key_commitment: [u8; 32],
    pub dna: [u8; 32],
    pub ephemeral_public_key: [u8; 32],
    pub one_time_public_key: [u8; 32],
    pub dna_key_proof: GpruDnaKeyProofV1,
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
    /// CHECK: validated by TCAP.
    pub tcap_asset_entry: UncheckedAccount<'info>,
    /// CHECK: the blinded tip root is only a PDA seed.
    pub tip_root: UncheckedAccount<'info>,
    /// CHECK: validated by TCAP as the canonical tip PDA.
    pub tin_tip: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA, derived from the opaque authorization digest.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    /// CHECK: canonical GPRU program, invoked to validate the TIP route and one-time key proof.
    #[account(executable, address = GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
    /// CHECK: GPRU validates this account against TIP's program, PDA and route layout.
    pub tip_registry: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterTcapCreditAuthorizationV2>, args: RegisterTcapCreditAuthorizationV2Args) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TsnError::Unauthorized);
    require!(args.previous_commitment != [0; 32] && args.new_commitment != [0; 32], TsnError::Unauthorized);
    require!(args.policy_commitment != [0; 32] && args.gpru_scope_commitment != [0; 32] && args.nullifier != [0; 32], TsnError::Unauthorized);
    require!(args.dna_key_commitment != [0; 32] && args.dna != [0; 32], TsnError::Unauthorized);
    require!(args.sequence > 0 && args.token_id > 0 && args.expires_at_slot >= args.valid_after_slot, TsnError::Unauthorized);
    let expected_dna_key_commitment = anchor_lang::solana_program::hash::hashv(&[
        b"TSN_GPRU_DNA_ELGAMAL_KEY_COMMITMENT_V1\0",
        &[1],
        &args.dna,
        &args.ephemeral_public_key,
        &args.one_time_public_key,
    ]).to_bytes();
    require!(args.dna_key_commitment == expected_dna_key_commitment, TsnError::Unauthorized);
    require!(args.authorization_digest == derive_authorization_digest_v2(&args, &ctx.accounts.tin_tip.key()), TsnError::Unauthorized);
    let (expected_signer, signer_bump) = Pubkey::find_program_address(&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest], &crate::ID);
    require_keys_eq!(expected_signer, ctx.accounts.tcap_authorization_signer.key(), TsnError::Unauthorized);

    // Verify the recipient's registered TIP scan key and the Node's one-time
    // DNA key proof before authorizing TCAP state mutation in this transaction.
    let mut gpru_data = anchor_lang::solana_program::hash::hash(b"global:verify_dna_key_proof_v1").to_bytes()[..8].to_vec();
    gpru_data.extend_from_slice(&args.dna);
    gpru_data.extend_from_slice(&args.ephemeral_public_key);
    gpru_data.extend_from_slice(&args.one_time_public_key);
    gpru_data.extend_from_slice(&args.dna_key_proof.try_to_vec()?);
    let gpru_instruction = Instruction {
        program_id: GPRU_PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(ctx.accounts.tip_registry.key(), false)],
        data: gpru_data,
    };
    anchor_lang::solana_program::program::invoke(
        &gpru_instruction,
        &[
            ctx.accounts.tip_registry.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
        ],
    )?;

    let mut data = anchor_lang::solana_program::hash::hash(b"global:credit_tcap_tin_tip_v2").to_bytes()[..8].to_vec();
    let tcap_args = tcap::instructions::credit_tcap_tin_tip_v2::CreditTcapTinTipV2Args {
        authorization_digest: args.authorization_digest,
        valid_after_slot: args.valid_after_slot,
        expires_at_slot: args.expires_at_slot,
        previous_commitment: args.previous_commitment,
        new_commitment: args.new_commitment,
        sequence: args.sequence,
        token_id: args.token_id,
        policy_commitment: args.policy_commitment,
        gpru_scope_commitment: args.gpru_scope_commitment,
        nullifier: args.nullifier,
        dna_key_commitment: args.dna_key_commitment,
    };
    data.extend_from_slice(&tcap_args.try_to_vec()?);
    let instruction = Instruction {
        program_id: TCAP_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
            AccountMeta::new(ctx.accounts.tin_tip.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tip_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_asset_entry.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tsn_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.tcap_authorization_signer.key(), true),
        ],
        data,
    };
    invoke_signed(
        &instruction,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.tcap_config.to_account_info(),
            ctx.accounts.tin_tip.to_account_info(),
            ctx.accounts.tip_root.to_account_info(),
            ctx.accounts.tcap_asset_entry.to_account_info(),
            ctx.accounts.tsn_program.to_account_info(),
            ctx.accounts.tcap_authorization_signer.to_account_info(),
            ctx.accounts.tcap_program.to_account_info(),
        ],
        &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[signer_bump]]],
    )?;
    Ok(())
}

/// Domain-separated digest helper for off-chain builders. It intentionally
/// contains only the opaque tip transition, not a payment intent or recipient.
pub fn derive_authorization_digest_v2(args: &RegisterTcapCreditAuthorizationV2Args, tin_tip: &Pubkey) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[
        AUTHORIZATION_DOMAIN,
        tin_tip.as_ref(),
        &args.valid_after_slot.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.previous_commitment,
        &args.new_commitment,
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.policy_commitment,
        &args.gpru_scope_commitment,
        &args.nullifier,
        &args.dna_key_commitment,
    ]).to_bytes()
}
