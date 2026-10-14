use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{hash::hashv, pubkey::Pubkey};

pub const CURRENT_VERSION: u8 = 3;
pub const TCAP_ROUTE_VERSION_V1: u8 = 1;

/// Current TIN creation accepts only the GPRU-point -> blinded TIP-seed
/// relationship. No prior route layout is accepted by the program.
pub fn validate_tcap_route(
    tcap_route_version: u8,
    relationship_commitment: &[u8; 32],
    relationship_reference: &[u8; 32],
    policy_commitment: &[u8; 32],
) -> bool {
    tcap_route_version == TCAP_ROUTE_VERSION_V1
        && relationship_commitment != &[0; 32]
        && relationship_reference != &[0; 32]
        && policy_commitment != &[0; 32]
        && valid_tcap_relationship_binding(relationship_commitment, relationship_reference)
}

fn valid_tcap_relationship_binding(
    relationship_commitment: &[u8; 32],
    relationship_reference: &[u8; 32],
) -> bool {
    let expected_reference = hashv(&[
        b"TSN_TCAP_TIN_TIP_ROOT_COMMITMENT_V1\0",
        relationship_commitment,
    ])
    .to_bytes();
    &expected_reference == relationship_reference
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
    pub tcap_route_version: u8,
    /// Public GPRU commitment. Its receiving secret remains in the owner envelope.
    pub tcap_relationship_commitment: [u8; 32],
    /// Blinded TIP PDA seed derived from the public GPRU commitment.
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
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
            + 8 + 32 + 1 + 32 + 32 + 32
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
    pub tcap_route_version: u8,
    pub tcap_relationship_commitment: [u8; 32],
    pub tcap_relationship_reference: [u8; 32],
    pub tcap_policy_commitment: [u8; 32],
    pub expiry_ts: i64,
}

impl TinV1CreationStaging {
    pub const VERSION: u8 = 2;
    pub const MAX_BLOB_LEN: usize = 16 * 1024;

    pub fn space(identity_len: usize, recovery_len: usize, seed_len: usize) -> usize {
        1 + 1 + 32 + 32 + 32 + 4 + identity_len + 4 + 4 + recovery_len + 4 + 4 + seed_len + 4
            + 32 + 8 + 32 + 1 + 32 + 32 + 32 + 8
    }
}
