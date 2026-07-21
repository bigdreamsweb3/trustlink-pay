use super::{legacy, DepositAssetV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<DepositAssetV1>, amount: u64) -> Result<()> {
    legacy::deposit_asset_v1(ctx, amount)
}
