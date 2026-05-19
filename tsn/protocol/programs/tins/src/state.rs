use anchor_lang::prelude::*;

/// Identity type enum
#[derive(Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum IdentityType {
    /// Wallet-only identity (no phone/social)
    Wallet = 0,
    /// Phone number linked
    Phone = 1,
    /// Email linked
    Email = 2,
    /// X/Twitter handle linked
    XHandle = 3,
}

impl Default for IdentityType {
    fn default() -> Self {
        IdentityType::Wallet
    }
}

/// Global configuration for TINS protocol
#[account]
#[derive(Default, InitSpace)]
pub struct GlobalConfig {
    /// Protocol authority (can update config)
    pub authority: Pubkey,
    /// Fee recipient wallet
    pub fee_recipient: Pubkey,
    /// Registration fee in lamports
    pub registration_fee: u64,
    /// Version for upgrades
    pub version: u8,
    /// Bump seed
    pub bump: u8,
}

/// Per-identity TIN record
#[account]
#[derive(Default, InitSpace)]
pub struct IdentityRecord {
    /// Display name (e.g., "Daniel Ochieng") - shown before sending
    #[max_len(32)]
    pub display_name: String,
    /// Privacy public key (derived from main wallet, NOT the main wallet)
    pub privacy_pubkey: Pubkey,
    /// Owner authority (can modify this identity)
    pub owner: Pubkey,
    /// TIN number (9 digits)
    pub tin: u64,
    /// When created (unix timestamp)
    pub created_at: i64,
    /// Identity type
    pub identity_type: IdentityType,
    /// Hash of linked identity (phone/email)
    pub identity_hash: [u8; 32],
    /// Whether linked identity has been verified
    pub verified: bool,
    /// Whether identity is frozen (cannot receive funds)
    pub frozen: bool,
    /// Bump seed for PDA
    pub bump: u8,
    /// Version for upgrades
    pub version: u8,
}

/// Linked identity PDA (for phone → TIN mapping)
#[account]
#[derive(Default, InitSpace)]
pub struct LinkedIdentity {
    /// Identity type
    pub identity_type: IdentityType,
    /// Hash of the linked identity (phone/email/X)
    pub identity_hash: [u8; 32],
    /// Associated TIN record pubkey
    pub tin: Pubkey,
    /// When linked
    pub linked_at: i64,
    /// Whether verified
    pub verified: bool,
}

/// Rate limit tracker per owner
#[account]
#[derive(InitSpace)]
pub struct RateLimit {
    /// Owner pubkey
    pub owner: Pubkey,
    /// Number of TINs created in last hour
    pub count_last_hour: u32,
    /// Timestamp of oldest creation in current window
    pub window_start: i64,
    /// Number of TINs created this epoch
    pub epoch_count: u32,
    /// Bump
    pub bump: u8,
}