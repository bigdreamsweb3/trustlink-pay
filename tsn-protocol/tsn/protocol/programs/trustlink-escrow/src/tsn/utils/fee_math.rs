use crate::tsn::constants::{
    BPS_DENOMINATOR,
    TSN_SPLIT_BPS_CRANKER,
    TSN_SPLIT_BPS_LP,
    TSN_SPLIT_BPS_TREASURY,
    TSN_TIN_FEE_SPLIT_BPS_RESERVE_POOL,
    TSN_TIN_FEE_SPLIT_BPS_SUBMIT_CRANKER,
    TSN_TIN_FEE_SPLIT_BPS_TEAM,
    TSN_TIN_FEE_SPLIT_BPS_VERIFY_CRANKER,
};

pub fn default_fee_splits() -> (u16, u16, u16) {
    (TSN_SPLIT_BPS_CRANKER, TSN_SPLIT_BPS_LP, TSN_SPLIT_BPS_TREASURY)
}

pub fn is_valid_split(cranker_bps: u16, lp_bps: u16, treasury_bps: u16) -> bool {
    let total = cranker_bps as u64
        + lp_bps as u64
        + treasury_bps as u64
        ;
    if total != BPS_DENOMINATOR {
        return false;
    }

    let lp_in_range = (8_200..=8_800).contains(&lp_bps);
    let treasury_in_range = (500..=800).contains(&treasury_bps);
    let cranker_in_range = (200..=1_000).contains(&cranker_bps);

    lp_in_range && treasury_in_range && cranker_in_range
}

pub fn default_tin_fee_splits() -> (u16, u16, u16, u16) {
    (
        TSN_TIN_FEE_SPLIT_BPS_VERIFY_CRANKER,
        TSN_TIN_FEE_SPLIT_BPS_SUBMIT_CRANKER,
        TSN_TIN_FEE_SPLIT_BPS_TEAM,
        TSN_TIN_FEE_SPLIT_BPS_RESERVE_POOL,
    )
}

pub fn is_valid_tin_fee_split(
    verify_cranker_bps: u16,
    submit_cranker_bps: u16,
    team_bps: u16,
    reserve_pool_bps: u16,
) -> bool {
    let total = verify_cranker_bps as u64
        + submit_cranker_bps as u64
        + team_bps as u64
        + reserve_pool_bps as u64;
    if total != BPS_DENOMINATOR {
        return false;
    }

    verify_cranker_bps == TSN_TIN_FEE_SPLIT_BPS_VERIFY_CRANKER
        && submit_cranker_bps == TSN_TIN_FEE_SPLIT_BPS_SUBMIT_CRANKER
        && team_bps == TSN_TIN_FEE_SPLIT_BPS_TEAM
        && reserve_pool_bps == TSN_TIN_FEE_SPLIT_BPS_RESERVE_POOL
}
