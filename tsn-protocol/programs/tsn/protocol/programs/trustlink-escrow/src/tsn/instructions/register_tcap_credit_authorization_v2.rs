use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::tsn::{
    constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED},
    errors::TsnError,
    state::MotherEscrow,
};

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
pub struct GpruInitialBalanceProofV1 {
    pub generator_commitment: [u8; 32],
    pub key_commitment: [u8; 32],
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
    pub previous_tcap_root: [u8; 32],
    pub tcap_root_sequence: u64,
    pub token_id: u32,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
    pub memo_commitment: [u8; 32],
    /// Node-derived commitment to the exact signed reserve-funding transaction.
    /// It is included in the authorization digest and forwarded to TCAP's
    /// atomic state transition; TSN does not create a per-funding spent PDA.
    pub nullifier: [u8; 32],
    pub dna_key_commitment: [u8; 32],
    pub dna: [u8; 32],
    pub ephemeral_public_key: [u8; 32],
    pub one_time_public_key: [u8; 32],
    pub dna_key_proof: GpruDnaKeyProofV1,
    /// Verified reserve deposit amount, bound into the Mother authorization.
    pub amount_base_units: u64,
    pub previous_balance_ciphertext: [u8; 64],
    pub balance_ciphertext: [u8; 64],
    /// Only used for sequence 1; GPRU verifies this is an encryption of the
    /// exact credit amount. Later credits derive the successor in GPRU.
    pub initial_balance_ciphertext: [u8; 64],
    pub initial_balance_proof: GpruInitialBalanceProofV1,
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
    /// CHECK: shared TCAP replay checkpoint; TCAP validates its canonical PDA.
    #[account(mut)]
    pub commitment_root: UncheckedAccount<'info>,
    /// CHECK: TSN-owned signer PDA, derived from the opaque authorization digest.
    pub tcap_authorization_signer: UncheckedAccount<'info>,
    /// CHECK: canonical GPRU program, invoked to validate the TIP route and one-time key proof.
    #[account(executable, address = GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
    /// CHECK: GPRU validates this account against TIP's program, PDA and route layout.
    pub tip_registry: UncheckedAccount<'info>,
    /// CHECK: canonical Solana instructions sysvar passed to GPRU to verify TSN is the top-level caller.
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterTcapCreditAuthorizationV2>,
    args: RegisterTcapCreditAuthorizationV2Args,
) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TsnError::Unauthorized);
    require!(
        args.previous_commitment != [0; 32] && args.new_commitment != [0; 32],
        TsnError::Unauthorized
    );
    require!(
        args.policy_commitment != [0; 32]
            && args.gpru_scope_commitment != [0; 32]
            && args.nullifier != [0; 32],
        TsnError::Unauthorized
    );
    require!(
        args.dna_key_commitment != [0; 32] && args.dna != [0; 32],
        TsnError::Unauthorized
    );
    require!(
        args.sequence > 0 && args.token_id > 0 && args.expires_at_slot >= args.valid_after_slot,
        TsnError::Unauthorized
    );
    require!(args.amount_base_units > 0, TsnError::Unauthorized);
    let expected_dna_key_commitment = anchor_lang::solana_program::hash::hashv(&[
        b"TSN_GPRU_DNA_ELGAMAL_KEY_COMMITMENT_V1\0",
        &[1],
        &args.dna,
        &args.ephemeral_public_key,
        &args.one_time_public_key,
    ])
    .to_bytes();
    require!(
        args.dna_key_commitment == expected_dna_key_commitment,
        TsnError::Unauthorized
    );
    require!(
        args.authorization_digest
            == derive_authorization_digest_v2(&args, &ctx.accounts.commitment_root.key()),
        TsnError::Unauthorized
    );
    let (expected_signer, signer_bump) = Pubkey::find_program_address(
        &[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest],
        &crate::ID,
    );
    require_keys_eq!(
        expected_signer,
        ctx.accounts.tcap_authorization_signer.key(),
        TsnError::Unauthorized
    );

    // Verify the registered TIP scan key and one-time DNA key proof before
    // authorizing the shared TCAP replay checkpoint transition.
    let mut gpru_data = anchor_lang::solana_program::hash::hash(b"global:verify_dna_key_proof_v1")
        .to_bytes()[..8]
        .to_vec();
    gpru_data.extend_from_slice(&args.dna);
    gpru_data.extend_from_slice(&args.ephemeral_public_key);
    gpru_data.extend_from_slice(&args.one_time_public_key);
    gpru_data.extend_from_slice(&args.dna_key_proof.try_to_vec()?);
    let gpru_instruction = Instruction {
        program_id: GPRU_PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(
            ctx.accounts.tip_registry.key(),
            false,
        )],
        data: gpru_data,
    };
    anchor_lang::solana_program::program::invoke(
        &gpru_instruction,
        &[
            ctx.accounts.tip_registry.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
        ],
    )?;

    #[derive(AnchorSerialize)]
    struct ApplyGpruCreditTransitionV1Args {
        amount: u64,
        token_id: u32,
        sequence: u64,
        previous_tcap_root: [u8; 32],
        tcap_root_sequence: u64,
        policy_commitment: [u8; 32],
        previous_commitment: [u8; 32],
        new_commitment: [u8; 32],
        memo_commitment: [u8; 32],
        nullifier: [u8; 32],
        authorization_digest: [u8; 32],
        previous_balance_ciphertext: [u8; 64],
        balance_ciphertext: [u8; 64],
        initial_ciphertext: [u8; 64],
        initial_proof: GpruInitialBalanceProofV1,
    }
    let mut balance_data =
        anchor_lang::solana_program::hash::hash(b"global:apply_credit_transition_v1").to_bytes()
            [..8]
            .to_vec();
    balance_data.extend_from_slice(
        &ApplyGpruCreditTransitionV1Args {
            amount: args.amount_base_units,
            token_id: args.token_id,
            sequence: args.sequence,
            previous_tcap_root: args.previous_tcap_root,
            tcap_root_sequence: args.tcap_root_sequence,
            policy_commitment: args.policy_commitment,
            previous_commitment: args.previous_commitment,
            new_commitment: args.new_commitment,
            memo_commitment: args.memo_commitment,
            nullifier: args.nullifier,
            authorization_digest: args.authorization_digest,
            previous_balance_ciphertext: args.previous_balance_ciphertext,
            balance_ciphertext: args.balance_ciphertext,
            initial_ciphertext: args.initial_balance_ciphertext,
            initial_proof: args.initial_balance_proof,
        }
        .try_to_vec()?,
    );
    let balance_instruction = Instruction {
        program_id: GPRU_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(ctx.accounts.tip_registry.key(), false),
            AccountMeta::new_readonly(ctx.accounts.commitment_root.key(), false),
            AccountMeta::new_readonly(ctx.accounts.instructions.key(), false),
        ],
        data: balance_data,
    };
    anchor_lang::solana_program::program::invoke(
        &balance_instruction,
        &[
            ctx.accounts.tip_registry.to_account_info(),
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
        ],
    )?;

    let mut data = anchor_lang::solana_program::hash::hash(b"global:credit_gpru_memo_v1")
        .to_bytes()[..8]
        .to_vec();
    let tcap_args = tcap::instructions::credit_gpru_memo_v1::CreditGpruMemoV1Args {
        authorization_digest: args.authorization_digest,
        valid_after_slot: args.valid_after_slot,
        expires_at_slot: args.expires_at_slot,
        previous_commitment: args.previous_commitment,
        new_commitment: args.new_commitment,
        sequence: args.sequence,
        previous_tcap_root: args.previous_tcap_root,
        tcap_root_sequence: args.tcap_root_sequence,
        token_id: args.token_id,
        policy_commitment: args.policy_commitment,
        gpru_scope_commitment: args.gpru_scope_commitment,
        memo_commitment: args.memo_commitment,
        nullifier: args.nullifier,
        dna_key_commitment: args.dna_key_commitment,
    };
    data.extend_from_slice(&tcap_args.try_to_vec()?);
    let instruction = Instruction {
        program_id: TCAP_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.tcap_config.key(), false),
            AccountMeta::new(ctx.accounts.commitment_root.key(), false),
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
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.tcap_asset_entry.to_account_info(),
            ctx.accounts.tsn_program.to_account_info(),
            ctx.accounts.tcap_authorization_signer.to_account_info(),
            ctx.accounts.tcap_program.to_account_info(),
        ],
        &[&[
            TSN_TCAP_AUTHORITY_SEED,
            &args.authorization_digest,
            &[signer_bump],
        ]],
    )?;
    Ok(())
}

/// Domain-separated digest helper for off-chain builders. It binds the balance
/// transition to the shared TCAP predecessor without publishing a recipient
/// route address in this authorization.
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
        &args.previous_commitment,
        &args.new_commitment,
        &args.sequence.to_le_bytes(),
        &args.token_id.to_le_bytes(),
        &args.policy_commitment,
        &args.gpru_scope_commitment,
        &args.nullifier,
        &args.dna_key_commitment,
    ])
    .to_bytes()
}
