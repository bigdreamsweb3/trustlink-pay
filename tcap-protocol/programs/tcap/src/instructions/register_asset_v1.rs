use super::{legacy, RegisterAssetArgsV1, RegisterAssetV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<RegisterAssetV1>, args: RegisterAssetArgsV1) -> Result<()> {
    legacy::register_asset_v1(ctx, args)
}
