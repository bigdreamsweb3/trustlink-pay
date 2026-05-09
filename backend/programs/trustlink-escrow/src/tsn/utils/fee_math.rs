use crate::tsn::constants::{BPS_DENOMINATOR, TSN_SPLIT_BPS_CRANKER, TSN_SPLIT_BPS_LP, TSN_SPLIT_BPS_TREASURY};

pub fn default_fee_splits() -> (u16, u16, u16) {
    (TSN_SPLIT_BPS_CRANKER, TSN_SPLIT_BPS_LP, TSN_SPLIT_BPS_TREASURY)
}

pub fn is_valid_split(cranker_bps: u16, lp_bps: u16, treasury_bps: u16) -> bool {
    let total = cranker_bps as u64 + lp_bps as u64 + treasury_bps as u64;
    total == BPS_DENOMINATOR
}
