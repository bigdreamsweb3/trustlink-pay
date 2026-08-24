use anchor_lang::prelude::*;

use crate::authority::TCAP_TIN_TIP_V1_SEED;
use crate::error::TcapError;
use crate::events::TcapTinTipInitializedV1;
use crate::state::TCapTinTipV1;

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
