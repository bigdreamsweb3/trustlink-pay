use anchor_lang::prelude::*;
use crate::{authority::{TCAP_FUNDING_ROOT_SEED,TCAP_GLOBAL_CONFIG_SEED},error::TcapError,
    private_funding::{funding_zero_hashes,TcapFundingMerkleRootV1,FUNDING_TREE_DEPTH},state::TcapGlobalConfigV1};

#[derive(Accounts)]
pub struct InitializePrivateFundingRootV1<'info> {
    #[account(mut,address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds=[TCAP_GLOBAL_CONFIG_SEED],bump=config.bump)]
    pub config: Account<'info,TcapGlobalConfigV1>,
    #[account(init,payer=governance,space=TcapFundingMerkleRootV1::SPACE,seeds=[TCAP_FUNDING_ROOT_SEED],bump)]
    pub funding_root: Box<Account<'info,TcapFundingMerkleRootV1>>,
    pub system_program: Program<'info,System>,
}

pub fn handler(ctx: Context<InitializePrivateFundingRootV1>) -> Result<()> {
    require!(ctx.accounts.config.protocol_version == 1,TcapError::InvalidFundingRoot);
    let root=&mut ctx.accounts.funding_root;
    root.version=TcapFundingMerkleRootV1::VERSION;
    root.protocol_version=ctx.accounts.config.protocol_version;
    root.bump=ctx.bumps.funding_root;
    root.current_root=funding_zero_hashes()?[FUNDING_TREE_DEPTH];
    root.leaf_count=0;
    root.frontier=vec![[0;32];FUNDING_TREE_DEPTH];
    Ok(())
}
