use super::{legacy, SetAssetDepositPolicyV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<SetAssetDepositPolicyV1>, enabled: bool) -> Result<()> {
    legacy::set_asset_deposit_policy_v1(ctx, enabled)
}
