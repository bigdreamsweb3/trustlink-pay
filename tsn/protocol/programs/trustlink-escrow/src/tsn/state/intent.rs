use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum IntentStatus {
    Pending,
    Claimed,
    Executed,
    Settled,
}

#[account]
pub struct PaymentIntent {
    pub mother_escrow: Pubkey,
    pub intent_id: [u8; 32],
    pub underlying_payment: Pubkey, // maps to existing TrustLink Pay payment PDA (optional)
    pub token_mint: Pubkey,
    pub amount: u64,
    pub recipient_hash: [u8; 32],
    pub status: IntentStatus,
    pub assigned_cranker: Pubkey,
    pub lease_expiry_ts: i64,
    pub proof_submitted: bool,
    pub payout_tx_sig: [u8; 64], // signature bytes (ed25519)
    pub created_at_ts: i64,
    pub executed_at_ts: i64,
    pub settled_epoch_id: u64,
    pub bump: u8,
}

impl PaymentIntent {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 8
        + 32
        + 1
        + 32
        + 8
        + 1
        + 64
        + 8
        + 8
        + 8
        + 1;
}
