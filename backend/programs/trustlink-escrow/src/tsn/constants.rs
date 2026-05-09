// TrustLink Settlement Network (TSN) constants.

pub const TSN_MOTHER_ESCROW_SEED: &[u8] = b"tsn_mother_escrow";
pub const TSN_INTENT_SEED: &[u8] = b"tsn_intent";
pub const TSN_CRANKER_SEED: &[u8] = b"tsn_cranker";
pub const TSN_CRANKER_VAULT_SEED: &[u8] = b"tsn_cranker_vault";
pub const TSN_CRANKER_VAULT_AUTHORITY_SEED: &[u8] = b"tsn_cranker_vault_authority";
pub const TSN_LIQUIDITY_POSITION_SEED: &[u8] = b"tsn_liquidity_position";

pub const TSN_DEFAULT_LEASE_SECONDS: i64 = 30;
pub const TSN_DEFAULT_EPOCH_SECONDS: i64 = 7 * 60 * 60; // 7 hours

// Fee split bps (out of 10_000) for internal settlement distribution.
pub const TSN_SPLIT_BPS_CRANKER: u16 = 7_000;
pub const TSN_SPLIT_BPS_LP: u16 = 2_000;
pub const TSN_SPLIT_BPS_TREASURY: u16 = 1_000;

pub const BPS_DENOMINATOR: u64 = 10_000;
