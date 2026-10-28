//! GPRU V1 Anchor program for one-time DNA keys and TCAP balance-transition validation.

use anchor_lang::prelude::*;

pub mod balance;
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
    pub policy_commitment: [u8; 32],
    pub previous_commitment: [u8; 32],
    pub new_commitment: [u8; 32],
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
    /// CHECK: TCAP commitment/sequence head; GPRU verifies the memo-linked ciphertext transition against it.
    pub tcap_tip: UncheckedAccount<'info>,
    /// CHECK: must be the canonical Instructions sysvar; used to authenticate TSN as the top-level caller.
    pub instructions: UncheckedAccount<'info>,
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
}
