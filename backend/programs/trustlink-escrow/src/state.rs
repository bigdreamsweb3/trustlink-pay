use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const PAYMENT_SEED: &[u8] = b"payment";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const IDENTITY_BINDING_SEED: &[u8] = b"identity_binding";

#[account]
pub struct EscrowConfig {
    pub claim_verifier: Pubkey,
    pub treasury_owner: Pubkey,
    pub default_expiry_seconds: i64,
    pub bump: u8,
}

impl EscrowConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct IdentityBinding {
    pub receiver_phone_hash: [u8; 32],
    pub main_wallet: Pubkey,
    pub recovery_wallet: Option<Pubkey>,
    pub is_frozen: bool,
    pub recovery_cooldown: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl IdentityBinding {
    pub const SPACE: usize = 8 + 32 + 32 + (1 + 32) + 1 + 8 + 8 + 8 + 1;
}

#[account]
pub struct PaymentAccount {
    pub payment_id: [u8; 32],
    pub sender_pubkey: Pubkey,
    pub receiver_phone_hash: [u8; 32],
    pub token_mint: Pubkey,
    pub amount: u64,
    pub sender_fee_amount: u64,
    pub claim_fee_amount: u64,
    pub expiry_ts: i64,
    pub status: PaymentStatus,
    pub payment_bump: u8,
    pub vault_authority_bump: u8,
}

impl PaymentAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentStatus {
    Pending,
    Claimed,
    Refunded,
    ExpiredToPool,
}

impl PaymentStatus {
    pub fn is_pending(self) -> bool {
        matches!(self, Self::Pending)
    }
}
