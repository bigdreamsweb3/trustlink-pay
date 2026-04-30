use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const PAYMENT_SEED: &[u8] = b"payment";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const IDENTITY_BINDING_SEED: &[u8] = b"identity_binding";

#[account]
pub struct EscrowConfig {
    pub claim_verifier: Pubkey,
    pub default_expiry_seconds: i64,
    pub bump: u8,
}

impl EscrowConfig {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct IdentityBinding {
    pub phone_identity_pubkey: Pubkey,
    pub settlement_wallet: Pubkey,
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
    pub phone_identity_pubkey: Pubkey,
    pub payment_receiver_pubkey: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub expiry_ts: i64,
    pub status: PaymentStatus,
    pub payment_bump: u8,
    pub vault_authority_bump: u8,
    pub sender_phone_identity_pubkey: Pubkey,
    pub payment_mode: PaymentMode,
    pub refund_receiver_pubkey: Option<Pubkey>,
    pub refund_requested_at_ts: i64,
    pub refund_available_at_ts: i64,
    pub expired_at_ts: i64,
}

impl PaymentAccount {
    pub const SPACE: usize =
        8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 1 + 32 + 1 + (1 + 32) + 8 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentStatus {
    Created,
    Locked,
    Claimed,
    RefundRequested,
    Refunded,
    Expired,
}

impl PaymentStatus {
    pub fn is_locked(self) -> bool {
        matches!(self, Self::Locked)
    }

    pub fn is_receiver_claimable(self) -> bool {
        matches!(self, Self::Locked | Self::Expired)
    }

    pub fn is_refund_requested(self) -> bool {
        matches!(self, Self::RefundRequested)
    }

    pub fn is_expired(self) -> bool {
        matches!(self, Self::Expired)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentMode {
    Secure,
    Invite,
}

impl PaymentMode {
    pub fn is_secure(self) -> bool {
        matches!(self, Self::Secure)
    }

    pub fn is_invite(self) -> bool {
        matches!(self, Self::Invite)
    }
}
