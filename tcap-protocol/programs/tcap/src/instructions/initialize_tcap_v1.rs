use super::{legacy, InitializeTcapArgsV1, InitializeTcapV1};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<InitializeTcapV1>, args: InitializeTcapArgsV1) -> Result<()> {
    legacy::initialize_tcap_v1(ctx, args)
}
