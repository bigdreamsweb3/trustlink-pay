// Transfer Settlement Network (TSN) constants.

pub const TSN_MOTHER_ESCROW_SEED: &[u8] = b"tsn_mother_escrow";
pub const TSN_VERIFIER_SEED: &[u8] = b"verifier";
pub const TSN_INTENT_SEED: &[u8] = b"tsn_intent";
pub const TSN_CRANKER_SEED: &[u8] = b"tsn_cranker";
pub const TSN_CRANKER_VAULT_SEED: &[u8] = b"tsn_cranker_vault";
pub const TSN_CRANKER_VAULT_AUTHORITY_SEED: &[u8] = b"tsn_cranker_vault_authority";
pub const TSN_LIQUIDITY_POSITION_SEED: &[u8] = b"tsn_liquidity_position";
pub const TSN_PAYMENT_VAULT_SEED: &[u8] = b"vault";
pub const TSN_PRIVATE_SETTLEMENT_CONFIG_SEED: &[u8] = b"tsn_private_config";
pub const TSN_PRIVATE_REPLAY_REGISTRY_SEED: &[u8] = b"tsn_private_replay";
pub const TSN_SHARED_ESCROW_AUTHORITY_SEED: &[u8] = b"tsn_shared_escrow";

pub const TSN_DEFAULT_LEASE_SECONDS: i64 = 30;
pub const TSN_DEFAULT_EPOCH_SECONDS: i64 = 7 * 60 * 60; // 7 hours
pub const TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;
pub const TSN_RECOVERY_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;
pub const TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;

// Fee split bps (out of 10_000) for internal settlement distribution.
// Default policy prioritizes LP incentives while keeping operator and treasury sustainable.
// Current default:
// - LP: 87%
// - Treasury: 8%
// - Cranker/Operator: 5%
pub const TSN_SPLIT_BPS_CRANKER: u16 = 500;
pub const TSN_SPLIT_BPS_LP: u16 = 8_700;
pub const TSN_SPLIT_BPS_TREASURY: u16 = 800;

pub const BPS_DENOMINATOR: u64 = 10_000;
