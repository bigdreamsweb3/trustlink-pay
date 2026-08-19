// Transfer Settlement Network (TSN) constants.

pub const TSN_MOTHER_ESCROW_SEED: &[u8] = b"tsn_mother_escrow";
pub const TSN_VERIFIER_SEED: &[u8] = b"verifier";
pub const TSN_TREASURY_SEED: &[u8] = b"tsn_treasury";
pub const TSN_INTENT_SEED: &[u8] = b"tsn_intent";
pub const TSN_CRANKER_SEED: &[u8] = b"tsn_cranker";
pub const TSN_CRANKER_VAULT_SEED: &[u8] = b"tsn_cranker_vault";
pub const TSN_CRANKER_VAULT_AUTHORITY_SEED: &[u8] = b"tsn_cranker_vault_authority";
pub const TSN_LIQUIDITY_POSITION_SEED: &[u8] = b"tsn_liquidity_position";
pub const TSN_PAYMENT_VAULT_SEED: &[u8] = b"vault";
pub const TSN_PRIVATE_SETTLEMENT_CONFIG_SEED: &[u8] = b"tsn_private_config";
pub const TSN_PRIVATE_REPLAY_REGISTRY_SEED: &[u8] = b"tsn_private_replay";
pub const TSN_SHARED_ESCROW_AUTHORITY_SEED: &[u8] = b"tsn_shared_escrow";
pub const TSN_PRIVATE_ESCROW_RECORD_SEED: &[u8] = b"tsn_private_escrow_record";
/// One settlement capability per payment/commitment digest.  The account is
/// the public, opaque voucher; it is deliberately not derived from or linked
/// to the sender's escrow token account.
pub const TSN_PRIVATE_SETTLEMENT_DNA_SEED: &[u8] = b"tsn_private_settlement_dna";
pub const TSN_PRU_SPEND_GUARD_SEED: &[u8] = b"pru_spend_guard";
pub const TSN_TRUSTLINK_INTENT_DOMAIN_TAG: &[u8] = b"TSN_TRUSTLINK_INTENT_V1";
pub const TSN_PRU_SPEND_GUARD_DOMAIN_TAG: &[u8] = b"TRUSTLINK_PRU_SPEND_GUARD_V1";

pub const TSN_EPOCH_ACCOUNT_SEED: &[u8] = b"tsn_epoch";
pub const TSN_PEA_SEED: &[u8] = b"pea";
pub const TSN_PAYMENT_COMMITMENT_SEED: &[u8] = b"tsn_payment_commitment";
pub const TSN_PRIVACY_RECEIVE_SEED: &[u8] = b"tsn_privacy_receive";
/// Domain for non-spendable TSN -> TCAP authorization records.
pub const TSN_TCAP_AUTHORIZATION_SEED: &[u8] = b"tsn:tcap-authorization:v1";

pub const TSN_DEFAULT_LEASE_SECONDS: i64 = 30;
pub const TSN_DEFAULT_EPOCH_SECONDS: i64 = 7 * 60 * 60; // 7 hours
pub const TSN_PAYMENT_INTENT_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;
pub const TSN_RECOVERY_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;
pub const TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS: u64 = 10_000;

// Fee split bps (out of 10_000) for internal settlement distribution.
// Default policy prioritizes LP incentives while keeping operator and treasury sustainable.
// Current default:
// - LP: 85%
// - Cranker/Operator: 8%
// - Treasury: 5%
// - Recovery bonus pool: 2%
pub const TSN_SPLIT_BPS_CRANKER: u16 = 800;
pub const TSN_SPLIT_BPS_LP: u16 = 8_500;
pub const TSN_SPLIT_BPS_TREASURY: u16 = 500;
pub const TSN_SPLIT_BPS_RECOVERY_BONUS: u16 = 200;

pub const TSN_TIN_FEE_SPLIT_BPS_VERIFY_CRANKER: u16 = 3_000;
pub const TSN_TIN_FEE_SPLIT_BPS_SUBMIT_CRANKER: u16 = 4_000;
pub const TSN_TIN_FEE_SPLIT_BPS_TEAM: u16 = 2_000;
pub const TSN_TIN_FEE_SPLIT_BPS_RESERVE_POOL: u16 = 1_000;

pub const BPS_DENOMINATOR: u64 = 10_000;
