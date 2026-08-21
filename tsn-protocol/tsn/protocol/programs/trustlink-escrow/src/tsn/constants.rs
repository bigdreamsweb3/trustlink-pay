// Transfer Settlement Network (TSN) constants.

pub const TSN_MOTHER_ESCROW_SEED: &[u8] = b"tsn_mother_escrow";
pub const TSN_VERIFIER_SEED: &[u8] = b"verifier";
pub const TSN_CRANKER_SEED: &[u8] = b"tsn_cranker";
pub const TSN_CRANKER_VAULT_SEED: &[u8] = b"tsn_cranker_vault";
pub const TSN_CRANKER_VAULT_AUTHORITY_SEED: &[u8] = b"tsn_cranker_vault_authority";
pub const TSN_LIQUIDITY_POSITION_SEED: &[u8] = b"tsn_liquidity_position";
pub const TSN_PRIVATE_SETTLEMENT_CONFIG_SEED: &[u8] = b"tsn_private_config";
pub const TSN_EPOCH_TREASURY_SEED: &[u8] = b"tsn_epoch_treasury";
pub const TSN_EPOCH_TREASURY_AUTHORITY_SEED: &[u8] = b"tsn_epoch_treasury_authority";
pub const TSN_EPOCH_LEDGER_SEED: &[u8] = b"tsn_epoch_ledger";
pub const TSN_EPOCH_CLAIM_SLOT_SEED: &[u8] = b"tsn_epoch_claim_slot";
pub const TSN_SETTLEMENT_DNA_SEED: &[u8] = b"tsn_settlement_dna";
pub const TSN_PRU_SPEND_GUARD_SEED: &[u8] = b"pru_spend_guard";
pub const TSN_TRUSTLINK_INTENT_DOMAIN_TAG: &[u8] = b"TSN_TRUSTLINK_INTENT_V1";
pub const TSN_PRU_SPEND_GUARD_DOMAIN_TAG: &[u8] = b"TRUSTLINK_PRU_SPEND_GUARD_V1";

pub const TSN_DEFAULT_LEASE_SECONDS: i64 = 30;
pub const TSN_DEFAULT_EPOCH_SECONDS: i64 = 7 * 60 * 60; // 7 hours
pub const TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;

// Fee split bps (out of 10_000) for internal settlement distribution.
// Default policy prioritizes LP incentives while keeping operator and treasury sustainable.
// Current default:
// - LP: 85%
// - Cranker/Operator: 8%
// - Treasury: 5%
pub const TSN_SPLIT_BPS_CRANKER: u16 = 800;
pub const TSN_SPLIT_BPS_LP: u16 = 8_500;
pub const TSN_SPLIT_BPS_TREASURY: u16 = 700;

pub const TSN_TIN_FEE_SPLIT_BPS_VERIFY_CRANKER: u16 = 3_000;
pub const TSN_TIN_FEE_SPLIT_BPS_SUBMIT_CRANKER: u16 = 4_000;
pub const TSN_TIN_FEE_SPLIT_BPS_TEAM: u16 = 2_000;
pub const TSN_TIN_FEE_SPLIT_BPS_RESERVE_POOL: u16 = 1_000;

pub const BPS_DENOMINATOR: u64 = 10_000;
