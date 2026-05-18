use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

pub const CURRENT_VERSION: u8 = 1;
pub const IDENTITY_ACTIVE: u8 = 1;
pub const ESCROW_PENDING: u8 = 0;
pub const ESCROW_CLAIMED: u8 = 1;

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
    pub reserved: [u8; 3],
    /// CRITICAL: Derived privacy key (NOT main wallet!)
    pub privacy_pubkey: Pubkey,
    /// Optional verification key (can rotate if compromised)
    pub verifying_pubkey: Option<Pubkey>,
    /// BIP-44 derivation path index
    pub path_index: u32,
    pub last_escrow_id: u64,
    pub created_at: i64,
    /// Display name for anti-scam
    pub display_name: String,
    /// RECOVERY WALLETS: Up to 3 recovery options
    /// Used to approve wallet rotation
    pub recovery_wallets: [Option<Pubkey>; 3],
    /// Latest rotation request (if any)
    pub pending_rotation: Option<RotationRequest>,
    /// Last successful rotation timestamp
    pub last_rotation_at: i64,
    /// Anti-replay nonce
    pub nonce: u64,
}

/// Wallet rotation request (requires MULTI-SIG approval)
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
pub struct RotationRequest {
    /// New privacy key
    pub new_privacy_pubkey: Pubkey,
    /// Who requested (must be recovery wallet)
    pub requested_by: Pubkey,
    /// When requested (for cooldown)
    pub requested_at: i64,
    /// Confirmation count (need 2 of 3 recovery wallets)
    pub confirmations: u8,
    /// Which recovery wallets confirmed (bitfield)
    pub confirmed_by: u8,
    /// Status: 0=pending, 1=confirmed, 2=cancelled
    pub status: u8,
}

impl IdentityRegistry {
    pub fn space(name: &str) -> usize {
        // version(1) + bump(1) + status(1) + reserved(3) + privacy_pubkey(32) + 
        // verifying(1+33) + path_index(4) + last_escrow(8) + created(8) +
        // name(len) + recovery(3*34) + rotation(~100) + last_rot(8) + nonce(8)
        300 + name.len()
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
