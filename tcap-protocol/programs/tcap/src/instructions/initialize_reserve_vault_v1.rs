use super::{legacy, InitializeReserveVaultV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<InitializeReserveVaultV1>) -> Result<()> {
    legacy::initialize_reserve_vault_v1(ctx)
}
