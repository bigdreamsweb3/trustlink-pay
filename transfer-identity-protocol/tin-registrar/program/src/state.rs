use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

pub const CURRENT_VERSION: u8 = 2;
pub const IDENTITY_ACTIVE: u8 = 1;
pub const ESCROW_PENDING: u8 = 0;
pub const ESCROW_CLAIMED: u8 = 1;
pub const PLATFORM_ACTIVE: u8 = 1;
pub const PLATFORM_INACTIVE: u8 = 0;

/// A social identity encrypted off-chain with a key derived from the 10-digit TIN.
/// Anyone who knows the TIN can decrypt this ciphertext through the SDK.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct EncryptedSocialIdentity {
    pub identity_type: String,
    pub label: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub metadata: String,
    pub verified_by: Option<Pubkey>,
    pub proof_hash: [u8; 32],
    pub linked_at: i64,
}

impl EncryptedSocialIdentity {
    pub fn space(&self) -> usize {
        4 + self.identity_type.len()
            + 4 + self.label.len()
            + 4 + self.nonce.len()
            + 4 + self.ciphertext.len()
            + 4 + self.metadata.len()
            + 1 + self.verified_by.map(|_| 32).unwrap_or(0)
            + 32
            + 8
    }
}

/// A sensitive field encrypted off-chain with TIN + explicit user signature material.
/// Decryption requires a fresh user authorization signature in the SDK.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct EncryptedSensitiveField {
    pub field_type: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub metadata: String,
    pub proof_hash: [u8; 32],
    pub linked_at: i64,
}

impl EncryptedSensitiveField {
    pub fn space(&self) -> usize {
        4 + self.field_type.len()
            + 4 + self.nonce.len()
            + 4 + self.ciphertext.len()
            + 4 + self.metadata.len()
            + 32
            + 8
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct VerificationPlatform {
    pub platform_id: String,
    pub public_key: Pubkey,
    pub status: u8,
    pub added_at: i64,
    pub rotated_from: Option<Pubkey>,
}

impl VerificationPlatform {
    pub fn space(&self) -> usize {
        4 + self.platform_id.len() + 32 + 1 + 8 + 1 + self.rotated_from.map(|_| 32).unwrap_or(0)
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct PlatformRegistry {
    pub version: u8,
    pub bump: u8,
    pub authority: Pubkey,
    pub platforms: Vec<VerificationPlatform>,
    pub reserved: [u8; 6],
}

impl PlatformRegistry {
    pub fn base_space() -> usize {
        1 + 1 + 32 + 4 + 6
    }

    pub fn space(&self) -> usize {
        Self::base_space() + self.platforms.iter().map(|platform| platform.space()).sum::<usize>()
    }
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

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct IdentityRegistry {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub tin: u64,
    pub authority: Pubkey,
    pub master_privacy: Pubkey,
    pub last_escrow_id: u64,
    pub created_at: i64,
    pub name: String,
    pub social_identities: Vec<EncryptedSocialIdentity>,
    pub sensitive_fields: Vec<EncryptedSensitiveField>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct LegacyIdentityRegistry {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub tin: u64,
    pub authority: Pubkey,
    pub master_privacy: Pubkey,
    pub last_escrow_id: u64,
    pub created_at: i64,
    pub name: String,
}

impl From<LegacyIdentityRegistry> for IdentityRegistry {
    fn from(legacy: LegacyIdentityRegistry) -> Self {
        Self {
            version: CURRENT_VERSION,
            bump: legacy.bump,
            status: legacy.status,
            reserved: legacy.reserved,
            tin: legacy.tin,
            authority: legacy.authority,
            master_privacy: legacy.master_privacy,
            last_escrow_id: legacy.last_escrow_id,
            created_at: legacy.created_at,
            name: legacy.name,
            social_identities: Vec::new(),
            sensitive_fields: Vec::new(),
        }
    }
}

impl IdentityRegistry {
    pub fn space(name: &str) -> usize {
        100 + name.len() + 4 + 4
    }

    pub fn dynamic_space(&self) -> usize {
        100
            + self.name.len()
            + 4
            + self.social_identities.iter().map(|identity| identity.space()).sum::<usize>()
            + 4
            + self.sensitive_fields.iter().map(|field| field.space()).sum::<usize>()
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct EscrowState {
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub reserved: [u8; 5],
    pub tin: u64,
    pub escrow_id: u64,
    pub amount: u64,
    pub payer: Pubkey,
    pub recipient_authority: Pubkey,
    pub vault: Pubkey,
    pub created_at: i64,
    pub claimed_at: i64,
    pub destination: Pubkey,
}

impl EscrowState {
    pub const LEN: usize = 176;
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinAccount {
    pub tin: u64,                     // 10-digit ID
    pub display_name: String,         // public identity
    pub owner_pubkey_hash: [u8; 32],  // SHA-256 commitment to the owner wallet pubkey
    pub encrypted_master_seed: Vec<u8>, // AES-256-GCM encrypted blob
    pub created_at: i64,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub encrypted_public_route_envelope: Vec<u8>,
    pub route_version: u64,
    pub route_nonce: [u8; 32],
}

impl TinAccount {
    pub fn space(
        display_name: &str,
        encrypted_master_seed_len: usize,
        encrypted_public_route_envelope_len: usize,
    ) -> usize {
        8 + (4 + display_name.len())
            + 32
            + (4 + encrypted_master_seed_len)
            + 8
            + 32
            + 32
            + (4 + encrypted_public_route_envelope_len)
            + 8
            + 32
    }
}

/// Temporary program-owned storage for a TIN mutation whose encrypted
/// payloads do not fit in one Solana transaction packet. The Cranker uploads
/// bounded chunks, then the final owner-authorized instruction commits them.
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct TinMutationStaging {
    pub version: u8,
    pub bump: u8,
    pub owner_pubkey: Pubkey,
    pub intent_hash: [u8; 32],
    pub display_name: String,
    pub encrypted_metadata_hash: [u8; 32],
    pub pru_configuration_hash: [u8; 32],
    pub route_version: u64,
    pub route_nonce: [u8; 32],
    pub nonce: [u8; 32],
    pub expiry_ts: i64,
    pub encrypted_master_seed: Vec<u8>,
    pub master_seed_written: u32,
    pub encrypted_public_route_envelope: Vec<u8>,
    pub route_written: u32,
}

impl TinMutationStaging {
    pub const VERSION: u8 = 1;
    pub const MAX_BLOB_LEN: usize = 16 * 1024;

    pub fn space(display_name_len: usize, master_seed_len: usize, route_len: usize) -> usize {
        1 + 1 + 32 + 32 + 4 + display_name_len + 32 + 32 + 8 + 32 + 32 + 8
            + 4 + master_seed_len + 4 + 4 + route_len + 4
    }
}
