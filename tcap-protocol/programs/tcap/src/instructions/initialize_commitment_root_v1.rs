use super::{legacy, InitializeCommitmentRootArgsV1, InitializeCommitmentRootV1};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<InitializeCommitmentRootV1>,
    args: InitializeCommitmentRootArgsV1,
) -> Result<()> {
    legacy::initialize_commitment_root_v1(ctx, args.empty_tree_root)
}
