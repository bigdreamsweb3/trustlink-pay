//! GPRU V1 Anchor program and shared proof-context contract. The initial
//! on-chain instruction verifies one-time ElGamal key derivation only; it does
//! not persist transaction state or authorize TCAP.

use anchor_lang::prelude::*;

#[path = "program.rs"]
pub mod gpru_ix;
#[cfg(not(target_os = "solana"))]
pub mod proofs;
pub mod state;
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
}
