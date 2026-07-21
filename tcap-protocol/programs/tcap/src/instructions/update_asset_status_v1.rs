use super::{legacy, UpdateAssetStatusArgsV1, UpdateAssetStatusV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<UpdateAssetStatusV1>, args: UpdateAssetStatusArgsV1) -> Result<()> {
    legacy::update_asset_status_v1(ctx, args.status, args.risk)
}
