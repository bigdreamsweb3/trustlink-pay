//! Immutable funded-root capture. Node/Mother attest the eligible source counts;
//! actual root authority comes from TCAP's funded-note tree, not the attestation.
use anchor_lang::prelude::*;
use crate::{error::TcapError,private_funding::TcapFundingMerkleRootV1,state::{TcapGlobalConfigV1,TcapAssetEntryV1}};
pub const POOL_SEED:&[u8]=b"tcap:sealed-funding:v1";
#[account]
pub struct TcapSealedFundingPoolV1 {
    pub version:u16,pub bump:u8,pub asset_entry:Pubkey,pub token_id:u32,pub root:[u8;32],
    pub leaf_count:u64,pub eligible_note_count:u64,pub source_wallet_count:u16,pub captured_slot:u64,pub release_slot:u64,
}
impl TcapSealedFundingPoolV1 {
    pub const SPACE:usize=113;
    pub fn validate(&self,asset:Pubkey,token:u32,slot:u64)->Result<()> {
        require!(self.version==1 && self.asset_entry==asset && self.token_id==token
            && self.root!=[0;32] && self.root<crate::private_funding::BN254_MODULUS
            && self.leaf_count<=1u64<<32 && self.eligible_note_count>=2
            && self.eligible_note_count<=self.leaf_count && self.source_wallet_count>=2
            && self.source_wallet_count as u64<=self.eligible_note_count
            && self.release_slot>=self.captured_slot && slot>=self.release_slot,TcapError::InvalidFundingRoot);Ok(())
    }
}
#[derive(AnchorSerialize,AnchorDeserialize,Clone,Copy)]
pub struct SealFundingPoolArgsV1 {pub root:[u8;32],pub eligible_note_count:u64,pub source_wallet_count:u16,pub release_slot:u64}
#[derive(Accounts)]
#[instruction(args:SealFundingPoolArgsV1)]
pub struct SealFundingPoolV1<'info> {
    #[account(mut)]pub authority:Signer<'info>,
    /// CHECK: canonical Mother Escrow and authority validated in handler.
    pub mother:UncheckedAccount<'info>,
    #[account(seeds=[crate::authority::TCAP_GLOBAL_CONFIG_SEED],bump=config.bump,constraint=!config.paused @ TcapError::ProtocolPaused)]
    pub config:Account<'info,TcapGlobalConfigV1>,
    #[account(seeds=[crate::authority::TCAP_ASSET_ENTRY_SEED,asset_entry.registry.as_ref(),asset_entry.asset.token_program.as_ref(),asset_entry.asset.mint.as_ref()],bump=asset_entry.bump)]
    pub asset_entry:Account<'info,TcapAssetEntryV1>,
    #[account(seeds=[crate::authority::TCAP_FUNDING_ROOT_SEED],bump=funding_root.bump)]pub funding_root:Box<Account<'info,TcapFundingMerkleRootV1>>,
    #[account(init,payer=authority,space=TcapSealedFundingPoolV1::SPACE,seeds=[POOL_SEED,asset_entry.key().as_ref(),args.root.as_ref()],bump)]
    pub pool:Account<'info,TcapSealedFundingPoolV1>,
    pub system_program:Program<'info,System>,
}
pub fn seal(ctx:Context<SealFundingPoolV1>,args:SealFundingPoolArgsV1)->Result<()> {
    crate::private_epoch::require_mother(&ctx.accounts.mother,&ctx.accounts.authority,ctx.accounts.config.approved_tsn_program)?;
    ctx.accounts.funding_root.validate()?;let slot=Clock::get()?.slot;
    require!(args.root==ctx.accounts.funding_root.current_root && args.eligible_note_count>=2
        && args.eligible_note_count<=ctx.accounts.funding_root.leaf_count && args.source_wallet_count>=2
        && args.source_wallet_count as u64<=args.eligible_note_count
        && args.release_slot>=slot && args.release_slot<=slot.checked_add(5000).ok_or(TcapError::ArithmeticOverflow)?,TcapError::InvalidFundingRoot);
    let p=&mut ctx.accounts.pool;p.version=1;p.bump=ctx.bumps.pool;p.asset_entry=ctx.accounts.asset_entry.key();
    p.token_id=ctx.accounts.asset_entry.token_id;p.root=args.root;p.leaf_count=ctx.accounts.funding_root.leaf_count;
    p.eligible_note_count=args.eligible_note_count;p.source_wallet_count=args.source_wallet_count;p.captured_slot=slot;p.release_slot=args.release_slot;Ok(())
}
