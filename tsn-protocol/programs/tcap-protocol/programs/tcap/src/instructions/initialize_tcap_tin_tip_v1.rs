use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::{hash, hashv};

use crate::authority::TCAP_TIN_TIP_V1_SEED;
use crate::error::TcapError;
use crate::events::TcapTinTipInitializedV1;
use crate::state::TCapTinTipV1;

const TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const TSN_MOTHER_ESCROW_SEED: &[u8] = b"tsn_mother_escrow";
const TSN_CRANKER_SEED: &[u8] = b"tsn_cranker";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeTcapTinTipV1Args {
    /// A blinded commitment to the TINS privacy-receiving root. It scopes the
    /// PDA without revealing the receiving root or a wallet address.
    pub blinded_tins_privacy_receiving_root_commitment: [u8; 32],
    pub current_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: InitializeTcapTinTipV1Args)]
pub struct InitializeTcapTinTipV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: The account is validated against the canonical TSN Mother PDA and layout below.
    pub mother_escrow: UncheckedAccount<'info>,
    /// CHECK: The account is validated against the canonical operator Cranker PDA and DNA below.
    pub cranker: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = TCapTinTipV1::SPACE,
        seeds = [
            TCAP_TIN_TIP_V1_SEED,
            args.blinded_tins_privacy_receiving_root_commitment.as_ref(),
        ],
        bump,
    )]
    pub tin_tip: Account<'info, TCapTinTipV1>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_tcap_tin_tip_v1(
    ctx: Context<InitializeTcapTinTipV1>,
    args: InitializeTcapTinTipV1Args,
) -> Result<()> {
    validate_registered_cranker(
        &ctx.accounts.mother_escrow,
        &ctx.accounts.cranker,
        &ctx.accounts.payer.key(),
    )?;
    require!(
        args.blinded_tins_privacy_receiving_root_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.current_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.policy_commitment != [0; 32],
        TcapError::EmptyCommitment
    );

    let tin_tip = &mut ctx.accounts.tin_tip;
    tin_tip.version = crate::TCAP_STATE_VERSION_V1;
    tin_tip.current_commitment = args.current_commitment;
    tin_tip.sequence = 0;
    tin_tip.policy_commitment = args.policy_commitment;
    tin_tip.last_transition_nullifier = [0; 32];
    tin_tip.frozen = false;
    tin_tip.bump = ctx.bumps.tin_tip;

    emit!(TcapTinTipInitializedV1 {
        tin_tip: tin_tip.key(),
    });
    Ok(())
}

fn validate_registered_cranker(
    mother_escrow: &UncheckedAccount,
    cranker: &UncheckedAccount,
    operator: &Pubkey,
) -> Result<()> {
    require_keys_eq!(*mother_escrow.owner, TSN_PROGRAM_ID, TcapError::InvalidCrankerDna);
    require_keys_eq!(*cranker.owner, TSN_PROGRAM_ID, TcapError::InvalidCrankerDna);

    let (expected_mother, _) = Pubkey::find_program_address(&[TSN_MOTHER_ESCROW_SEED], &TSN_PROGRAM_ID);
    require_keys_eq!(mother_escrow.key(), expected_mother, TcapError::InvalidCrankerDna);
    let (expected_cranker, _) = Pubkey::find_program_address(
        &[TSN_CRANKER_SEED, mother_escrow.key().as_ref(), operator.as_ref()],
        &TSN_PROGRAM_ID,
    );
    require_keys_eq!(cranker.key(), expected_cranker, TcapError::InvalidCrankerDna);

    let mother_data = mother_escrow.try_borrow_data()?;
    let mother_discriminator = hash(b"account:MotherEscrow").to_bytes();
    require!(mother_data.len() >= 104, TcapError::InvalidCrankerDna);
    require!(mother_data[..8] == mother_discriminator[..8], TcapError::InvalidCrankerDna);

    let cranker_data = cranker.try_borrow_data()?;
    let cranker_discriminator = hash(b"account:Cranker").to_bytes();
    require!(cranker_data.len() >= 104, TcapError::InvalidCrankerDna);
    require!(cranker_data[..8] == cranker_discriminator[..8], TcapError::InvalidCrankerDna);
    require!(cranker_data[8..40] == mother_escrow.key().to_bytes(), TcapError::InvalidCrankerDna);
    require!(cranker_data[40..72] == operator.to_bytes(), TcapError::InvalidCrankerDna);

    // MotherEscrow.protocol_seed follows the 8-byte discriminator and two Pubkeys.
    let protocol_seed: [u8; 32] = mother_data[72..104]
        .try_into()
        .map_err(|_| error!(TcapError::InvalidCrankerDna))?;
    let expected_dna = hashv(&[
        b"tsn_dna",
        mother_escrow.key().as_ref(),
        operator.as_ref(),
        &protocol_seed,
    ])
    .to_bytes();
    require!(cranker_data[72..104] == expected_dna, TcapError::InvalidCrankerDna);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tin_tip_state_serialization_fits_the_allocated_space() {
        let tip = TCapTinTipV1 {
            version: crate::TCAP_STATE_VERSION_V1,
            current_commitment: [1; 32],
            sequence: 0,
            policy_commitment: [2; 32],
            last_transition_nullifier: [0; 32],
            frozen: false,
            bump: 255,
        };
        assert_eq!(8 + tip.try_to_vec().unwrap().len(), TCapTinTipV1::SPACE);
    }
}
