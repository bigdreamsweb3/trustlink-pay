//! GPRU V1 Anchor program for one-time DNA keys and TCAP balance-transition validation.

use anchor_lang::prelude::*;

pub mod balance;
pub mod hidden_head;
#[path = "program.rs"]
pub mod gpru_ix;
#[cfg(not(target_os = "solana"))]
pub mod proofs;
pub mod stealth_keys;

#[cfg(not(target_os = "solana"))]
mod ffi;

/// Canonical Devnet program address. Its deployment keypair is local and
/// ignored by Git under `gpru-program-keys/`.
declare_id!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");

#[derive(Accounts)]
pub struct VerifyDnaKeyProof<'info> {
    /// TIP's private TIN registry account. GPRU validates its owner, PDA,
    /// active route, and registered scan-key commitment before checking proof.
    /// CHECK: validated against TIP's deployed account layout in the handler.
    pub tip_registry: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitialBalanceProofArgsV1 {
    pub generator_commitment: [u8; 32],
    pub key_commitment: [u8; 32],
    pub response: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ApplyCreditTransitionArgsV1 {
    pub amount: u64,
    pub token_id: u32,
    pub sequence: u64,
    pub previous_tcap_root: [u8; 32],
    pub tcap_root_sequence: u64,
    pub policy_commitment: [u8; 32],
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
    pub memo_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub authorization_digest: [u8; 32],
    pub previous_balance_ciphertext: [u8; 64],
    pub balance_ciphertext: [u8; 64],
    pub initial_ciphertext: [u8; 64],
    pub initial_proof: InitialBalanceProofArgsV1,
}

#[derive(Accounts)]
#[instruction(args: ApplyCreditTransitionArgsV1)]
pub struct ApplyCreditTransitionV1<'info> {
    /// CHECK: GPRU validates the canonical TIP registry layout and key fields.
    pub tip_registry: UncheckedAccount<'info>,
    /// CHECK: shared TCAP commitment root used for atomic settlement replay checks.
    pub commitment_root: UncheckedAccount<'info>,
    /// CHECK: must be the canonical Instructions sysvar; used to authenticate TSN as the top-level caller.
    pub instructions: UncheckedAccount<'info>,
}

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

#[derive(Accounts)]
pub struct VerifyHiddenHeadTransitionV1<'info> {
    /// CHECK: validated against the TIP program's canonical shared route-root account.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: validated against the canonical TCAP shared commitment-root account.
    pub tcap_commitment_root: UncheckedAccount<'info>,
    /// GPRU-owned, globally shared verifier configuration; it contains no user-specific data.
    #[account(seeds = [hidden_head::GPRU_HIDDEN_HEAD_VERIFIER_SEED], bump = verifier.bump)]
    pub verifier: Account<'info, hidden_head::GpruHiddenHeadVerifierV1>,
    /// CHECK: canonical instructions sysvar; GPRU binds the proof's memo commitment to the Memo instruction following the TSN call.
    pub instructions: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeHiddenHeadVerifierArgsV1 {
    pub circuit_commitment: [u8; 32],
    pub verifying_key_commitment: [u8; 32],
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
    pub ic: [[u8; 64]; hidden_head::HIDDEN_HEAD_PUBLIC_INPUTS + 1],
}

#[derive(Accounts)]
#[instruction(args: InitializeHiddenHeadVerifierArgsV1)]
pub struct InitializeHiddenHeadVerifierV1<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: authenticated as the canonical TSN Mother Escrow account below.
    pub mother_escrow: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = hidden_head::GpruHiddenHeadVerifierV1::SPACE, seeds = [hidden_head::GPRU_HIDDEN_HEAD_VERIFIER_SEED], bump)]
    pub verifier: Account<'info, hidden_head::GpruHiddenHeadVerifierV1>,
    pub system_program: Program<'info, System>,
}

#[program]
pub mod tsn_gpru_proof_contract {
    use super::*;

    pub fn verify_dna_key_proof_v1(
        ctx: Context<VerifyDnaKeyProof>,
        dna: [u8; 32],
        ephemeral_public_key: [u8; 32],
        one_time_public_key: [u8; 32],
        proof: gpru_ix::DnaKeyProofV1,
    ) -> Result<()> {
        gpru_ix::verify_dna_key_proof_v1(
            &ctx.accounts.tip_registry,
            dna,
            ephemeral_public_key,
            one_time_public_key,
            proof,
        )
    }

    pub fn apply_credit_transition_v1(
        ctx: Context<ApplyCreditTransitionV1>,
        args: ApplyCreditTransitionArgsV1,
    ) -> Result<()> {
        gpru_ix::apply_credit_transition_v1(ctx, args)
    }

    /// Verify a zero-knowledge update of one hidden TIN head and a one-time
    /// nullifier against the public shared roots. This instruction does not
    /// accept a TIN/TIP registry account or expose a per-TIN sequence.
    pub fn verify_hidden_head_transition_v1(
        ctx: Context<VerifyHiddenHeadTransitionV1>,
        args: HiddenHeadProofArgsV1,
    ) -> Result<()> {
        hidden_head::verify_transition(ctx, args)
    }

    /// Install the versioned Groth16 verifying key under Mother authority.
    /// This is a one-time protocol setup instruction; it stores only global
    /// verifier parameters and no TIN-specific state.
    pub fn initialize_hidden_head_verifier_v1(
        ctx: Context<InitializeHiddenHeadVerifierV1>,
        args: InitializeHiddenHeadVerifierArgsV1,
    ) -> Result<()> {
        hidden_head::initialize_verifier(ctx, args)
    }
}
