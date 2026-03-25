use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const PAYMENT_SEED: &[u8] = b"payment";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const PAYMENT_ID_LEN: usize = 32;
pub const PHONE_HASH_LEN: usize = 32;

#[account]
pub struct EscrowConfig {
    pub claim_verifier: Pubkey,
    pub bump: u8,
    pub initialized_at: i64,
}

impl EscrowConfig {
    pub const SPACE: usize = 8 + 32 + 1 + 8;
}

#[account]
pub struct PaymentAccount {
    pub payment_id: [u8; PAYMENT_ID_LEN],
    pub sender_pubkey: Pubkey,
    pub receiver_phone_hash: [u8; PHONE_HASH_LEN],
    pub token_mint: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    pub expiry_ts: i64,
    pub status: PaymentStatus,
    pub payment_bump: u8,
    pub vault_authority_bump: u8,
}

impl PaymentAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PaymentStatus {
    Pending,
    Claimed,
    Cancelled,
    Expired,
}

impl PaymentStatus {
    pub fn is_pending(self) -> bool {
        matches!(self, Self::Pending)
    }
}
