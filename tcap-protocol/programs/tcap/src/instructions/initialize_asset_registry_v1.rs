use super::{legacy, InitializeAssetRegistryV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<InitializeAssetRegistryV1>) -> Result<()> {
    legacy::initialize_asset_registry_v1(ctx)
}
