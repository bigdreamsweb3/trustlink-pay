use super::{legacy, InitializeNullifierRegistryArgsV1, InitializeNullifierRegistryV1};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<InitializeNullifierRegistryV1>,
    args: InitializeNullifierRegistryArgsV1,
) -> Result<()> {
    legacy::initialize_nullifier_registry_v1(ctx, args.domain_separator)
}
