use anchor_lang::prelude::*;

use crate::authority::{empty_gpru_hidden_head_root_v1, TCAP_COMMITMENT_ROOT_SEED};
use crate::error::TcapError;
use crate::state::{TcapCommitmentRootStateV1, TcapGlobalConfigV1};

#[derive(Accounts)]
pub struct ActivateCommitmentRootV1<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [crate::authority::TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        mut,
        seeds = [TCAP_COMMITMENT_ROOT_SEED],
        bump = commitment_root.bump,
        constraint = config.commitment_root_state == commitment_root.key() @ TcapError::InvalidPda
    )]
    pub commitment_root: Account<'info, TcapCommitmentRootStateV1>,
}

pub fn handler(ctx: Context<ActivateCommitmentRootV1>) -> Result<()> {
    let root = &mut ctx.accounts.commitment_root;
    require!(root.version == crate::TCAP_STATE_VERSION_V1, TcapError::InvalidPda);
    require!(root.sequence == 0, TcapError::InvalidPda);

    let expected_empty_root = empty_gpru_hidden_head_root_v1()?;
    // Activation is permitted only before the first state transition. Reset
    // any legacy empty-root encoding to the circuit's canonical Poseidon root.
    root.current_root = expected_empty_root;
    root.previous_root = expected_empty_root;
    root.root_version = root.root_version.max(1);

    root.paused = false;
    Ok(())
}
