use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{hash::hashv, pubkey::Pubkey};

pub const CURRENT_VERSION: u8 = 3;
pub const TIP_ROUTE_VERSION_V1: u8 = 1;
pub const GPRU_ELGAMAL_KEY_VERSION_V1: u8 = 1;
pub const GPRU_BALANCE_SCAN_KEY_VERSION_V1: u8 = 1;

/// Current TIN creation binds the owner-held GPRU ElGamal public key to its
/// versioned commitment and stores the independent TIP policy commitment.
pub fn validate_tip_route(
    tip_route_version: u8,
    gpru_elgamal_key_version: u8,
    gpru_elgamal_public_key: &[u8; 32],
    gpru_elgamal_key_commitment: &[u8; 32],
    gpru_balance_scan_key_version: u8,
    gpru_balance_scan_public_key_x: &[u8; 32],
    gpru_balance_scan_public_key_y: &[u8; 32],
    policy_commitment: &[u8; 32],
) -> bool {
    tip_route_version == TIP_ROUTE_VERSION_V1
        && gpru_elgamal_key_version == GPRU_ELGAMAL_KEY_VERSION_V1
        && gpru_elgamal_public_key != &[0; 32]
        && gpru_elgamal_key_commitment != &[0; 32]
        && gpru_balance_scan_key_version == GPRU_BALANCE_SCAN_KEY_VERSION_V1
        && gpru_balance_scan_public_key_x != &[0; 32]
        && gpru_balance_scan_public_key_y != &[0; 32]
        && is_canonical_bn254_scalar(gpru_balance_scan_public_key_x)
        && is_canonical_bn254_scalar(gpru_balance_scan_public_key_y)
        && policy_commitment != &[0; 32]
        && valid_gpru_elgamal_key_commitment(
            gpru_elgamal_key_version,
            gpru_elgamal_public_key,
            gpru_elgamal_key_commitment,
        )
}

fn is_canonical_bn254_scalar(value: &[u8; 32]) -> bool {
    const MODULUS: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
        0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
    ];
    value < &MODULUS
}

pub fn valid_gpru_elgamal_key_commitment(
    version: u8,
    public_key: &[u8; 32],
    commitment: &[u8; 32],
) -> bool {
    let expected = hashv(&[
        b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0",
        &[version],
        public_key,
    ]).to_bytes();
    &expected == commitment
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct GlobalState {
    pub version: u8,
    pub bump: u8,
    pub reserved: [u8; 6],
    pub next_sequence: u64,
}

impl GlobalState {
    pub const LEN: usize = 16;
}

/// TIP-wide append-only tree of active GPRU routes. It contains no TIN number,
/// registry address, or owner key. Route indices are private proof witnesses
/// during settlement; `frontier` is only the append algorithm's shared state.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TipRouteMerkleRootV1 {
    pub version: u8,
    pub bump: u8,
    pub root: [u8; 32],
    pub leaf_count: u64,
    pub frontier: [[u8; 32]; 32],
}

impl TipRouteMerkleRootV1 {
    pub const VERSION: u8 = 1;
    pub const DEPTH: usize = 32;
    pub const LEN: usize = 2 + 32 + 8 + 32 * 32;
}

/// Current private TIN V1 registry account. Only the keyed lookup commitment,
/// encrypted identity/recovery envelopes, and committed route fields are stored.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinV1Account {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub lookup_commitment: [u8; 32],
    pub owner_commitment: [u8; 32],
    pub encrypted_identity_envelope: Vec<u8>,
    pub encrypted_master_seed: Vec<u8>,
    pub created_at: i64,
    pub encrypted_metadata_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tip_route_version: u8,
    pub gpru_elgamal_key_version: u8,
    pub gpru_elgamal_public_key: [u8; 32],
    pub gpru_elgamal_key_commitment: [u8; 32],
    pub gpru_balance_scan_key_version: u8,
    pub gpru_balance_scan_public_key_x: [u8; 32],
    pub gpru_balance_scan_public_key_y: [u8; 32],
    pub policy_commitment: [u8; 32],
}

/// Owner-wallet recovery locator; the TIN itself remains encrypted.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinV1OwnerRecoveryAccount {
    pub version: u8,
    pub bump: u8,
    pub owner_pubkey: Pubkey,
    pub encrypted_tin: Vec<u8>,
}

impl TinV1OwnerRecoveryAccount {
    pub const VERSION: u8 = 1;

    pub fn space(encrypted_tin_len: usize) -> usize {
        1 + 1 + 32 + 4 + encrypted_tin_len
    }
}

impl TinV1Account {
    pub const VERSION: u8 = 1;
    pub const STATUS_ACTIVE: u8 = 1;

    pub fn space(identity_len: usize, seed_len: usize) -> usize {
        // Keep allocation equal to the Borsh struct size. The prior formula
        // reserved an extra 32-byte tail that strict decoders rejected.
        1 + 1 + 1 + 5 + 32 + 32 + 4 + identity_len + 4 + seed_len + 8 + 32
            + 8 + 32 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 32
    }
}

/// Temporary storage for oversized encrypted TIN V1 creation payloads.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinV1CreationStaging {
    pub version: u8,
    pub bump: u8,
    pub owner_pubkey: Pubkey,
    pub lookup_commitment: [u8; 32],
    pub intent_hash: [u8; 32],
    pub encrypted_identity_envelope: Vec<u8>,
    pub identity_written: u32,
    pub encrypted_tin_recovery: Vec<u8>,
    pub recovery_written: u32,
    pub encrypted_master_seed: Vec<u8>,
    pub master_seed_written: u32,
    pub encrypted_metadata_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub tip_route_version: u8,
    pub gpru_elgamal_key_version: u8,
    pub gpru_elgamal_public_key: [u8; 32],
    pub gpru_elgamal_key_commitment: [u8; 32],
    pub gpru_balance_scan_key_version: u8,
    pub gpru_balance_scan_public_key_x: [u8; 32],
    pub gpru_balance_scan_public_key_y: [u8; 32],
    pub policy_commitment: [u8; 32],
    pub expiry_ts: i64,
}

impl TinV1CreationStaging {
    pub const VERSION: u8 = 4;
    pub const MAX_BLOB_LEN: usize = 16 * 1024;

    pub fn space(identity_len: usize, recovery_len: usize, seed_len: usize) -> usize {
        1 + 1 + 32 + 32 + 32 + 4 + identity_len + 4 + 4 + recovery_len + 4 + 4 + seed_len + 4
            + 32 + 8 + 32 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 32 + 8
    }
}
