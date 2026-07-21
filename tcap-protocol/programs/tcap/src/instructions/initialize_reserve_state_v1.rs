use super::{legacy, InitializeReserveStateV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<InitializeReserveStateV1>) -> Result<()> {
    legacy::initialize_reserve_state_v1(ctx)
}
