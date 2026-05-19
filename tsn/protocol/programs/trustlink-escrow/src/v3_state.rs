use anchor_lang::prelude::*;

pub const ESCROW_V3_SEED: &[u8] = b"escrow_v3";
pub const ESCROW_V3_VAULT_AUTHORITY_SEED: &[u8] = b"escrow_v3_vault_authority";
pub const ESCROW_V3_NONCE_SEED: &[u8] = b"escrow_v3_nonce";

#[account]
pub struct EscrowV3 {
    pub sender: Pubkey,
    pub master_registry_pubkey: Pubkey,
    pub recipient_child_hash: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
    pub nonce: u64,
    pub expiry_ts: i64,
    pub auto_claim_dest_hash: [u8; 32],
    pub derivation_proof_sig: [u8; 64],
    pub state: EscrowV3State,
    pub bump: u8,
    pub vault_authority_bump: u8,
}

impl EscrowV3 {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 32 + 8 + 8 + 32 + 64 + 1 + 1 + 1;
}

#[account]
pub struct ConsumedNonceV3 {
    pub master_registry_pubkey: Pubkey,
    pub escrow: Pubkey,
    pub nonce: u64,
    pub consumed_at: i64,
    pub bump: u8,
}

impl ConsumedNonceV3 {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowV3State {
    Held,
    Claimed,
    Cancelled,
}

impl EscrowV3State {
    pub fn is_held(self) -> bool {
        matches!(self, Self::Held)
    }
}
