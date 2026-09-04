use anchor_lang::prelude::*;

use crate::error::TcapError;
use crate::state::TcapOneTimeTip;
use crate::authority::derive_tsn_authorization_signer;
use crate::state::TcapGlobalConfigV1;

pub const ONE_TIME_TIP_SEED: &[u8] = b"tcap:one-time-tip:v1";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeOneTimeTipArgs {
    pub blinded_settlement_commitment: [u8; 32],
    pub policy_commitment: [u8; 32],
    pub token_id: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeOneTimeTipArgs)]
pub struct InitializeOneTimeTip<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = TcapOneTimeTip::SPACE,
        seeds = [ONE_TIME_TIP_SEED, args.blinded_settlement_commitment.as_ref()],
        bump,
    )]
    pub one_time_tip: Account<'info, TcapOneTimeTip>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<InitializeOneTimeTip>,
    args: InitializeOneTimeTipArgs,
) -> Result<()> {
    require!(args.blinded_settlement_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.policy_commitment != [0; 32], TcapError::EmptyCommitment);
    let tip = &mut ctx.accounts.one_time_tip;
    tip.commitment = args.blinded_settlement_commitment;
    tip.sequence = 0;
    tip.sealed = [0; 48];
    tip.seal_commitment = [0; 32];
    tip.policy_commitment = args.policy_commitment;
    tip.transition_nullifier = [0; 32];
    tip.token_id = args.token_id;
    tip.consumed = false;
    tip.bump = ctx.bumps.one_time_tip;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ConsumeOneTimeTipArgs {
    pub authorization_digest: [u8; 32],
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub next_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub sequence: u64,
    pub amount: u64,
    pub policy_commitment: [u8; 32],
    pub gpru_scope_commitment: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: ConsumeOneTimeTipArgs)]
pub struct ConsumeOneTimeTip<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut)]
    pub one_time_tip: Account<'info, TcapOneTimeTip>,
    #[account(
        init,
        payer = payer,
        space = TcapOneTimeTip::SPACE,
        seeds = [ONE_TIME_TIP_SEED, args.next_commitment.as_ref()],
        bump,
    )]
    pub next_tip: Account<'info, TcapOneTimeTip>,
    /// CHECK: authenticated against the governance-bound TSN program.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: signer PDA supplied by the approved TSN CPI wrapper.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn consume_authorized(
    ctx: Context<ConsumeOneTimeTip>,
    args: ConsumeOneTimeTipArgs,
) -> Result<()> {
    require!(args.authorization_digest != [0; 32], TcapError::EmptyCommitment);
    require!(args.next_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(args.nullifier != [0; 32], TcapError::EmptyCommitment);
    require!(args.gpru_scope_commitment != [0; 32], TcapError::InvalidGpruScope);
    require!(args.amount > 0, TcapError::InvalidDepositAmount);
    let (expected_signer, _) = derive_tsn_authorization_signer(&ctx.accounts.config.approved_tsn_program, &args.authorization_digest);
    require_keys_eq!(expected_signer, ctx.accounts.tsn_authorization_signer.key(), TcapError::InvalidTsnAuthorizationSigner);
    require!(ctx.accounts.tsn_authorization_signer.is_signer, TcapError::InvalidTsnAuthorizationSigner);
    let clock = Clock::get()?;
    require!(clock.slot >= args.valid_after_slot && clock.slot <= args.expires_at_slot, TcapError::AuthorizationExpired);
    let tip = &mut ctx.accounts.one_time_tip;
    require!(!tip.consumed, TcapError::TipFrozen);
    require!(args.sequence == tip.sequence.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?, TcapError::InvalidTipSequence);
    require!(args.policy_commitment == tip.policy_commitment, TcapError::TipCommitmentMismatch);
    require!(args.nullifier != tip.transition_nullifier, TcapError::NullifierAlreadyConsumed);
    tip.commitment = args.next_commitment;
    tip.sequence = args.sequence;
    tip.transition_nullifier = args.nullifier;
    tip.consumed = true;
    let next = &mut ctx.accounts.next_tip;
    next.commitment = args.next_commitment;
    next.sequence = args.sequence;
    next.sealed = [0; 48];
    next.seal_commitment = [0; 32];
    next.policy_commitment = tip.policy_commitment;
    next.transition_nullifier = [0; 32];
    next.token_id = tip.token_id;
    next.consumed = false;
    next.bump = ctx.bumps.next_tip;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_time_tip_space_matches_layout() {
        let tip = TcapOneTimeTip {
        commitment: [1; 32],
            sequence: 0,
            sealed: [0; 48],
            seal_commitment: [0; 32],
            policy_commitment: [2; 32],
            transition_nullifier: [0; 32],
            token_id: 2,
            consumed: false,
            bump: 255,
        };
        assert_eq!(8 + tip.try_to_vec().unwrap().len(), TcapOneTimeTip::SPACE);
    }
}
