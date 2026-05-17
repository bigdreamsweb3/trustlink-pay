use crate::tsn::constants::{BPS_DENOMINATOR, TSN_SPLIT_BPS_CRANKER, TSN_SPLIT_BPS_LP, TSN_SPLIT_BPS_TREASURY};

pub fn default_fee_splits() -> (u16, u16, u16) {
    (TSN_SPLIT_BPS_CRANKER, TSN_SPLIT_BPS_LP, TSN_SPLIT_BPS_TREASURY)
}

pub fn is_valid_split(cranker_bps: u16, lp_bps: u16, treasury_bps: u16) -> bool {
    let total = cranker_bps as u64 + lp_bps as u64 + treasury_bps as u64;
    if total != BPS_DENOMINATOR {
        return false;
    }

    let lp_in_range = (8_200..=8_800).contains(&lp_bps);
    let treasury_in_range = (500..=800).contains(&treasury_bps);
    let cranker_in_range = (200..=500).contains(&cranker_bps);

    lp_in_range && treasury_in_range && cranker_in_range
}
