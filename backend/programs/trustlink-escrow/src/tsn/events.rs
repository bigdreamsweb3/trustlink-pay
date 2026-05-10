use anchor_lang::prelude::*;

#[event]
pub struct TsnMotherEscrowInitialized {
    pub mother_escrow: Pubkey,
    pub authority: Pubkey,
    pub epoch_seconds: i64,
    pub lease_seconds: i64,
}

#[event]
pub struct TsnCrankerRegistered {
    pub mother_escrow: Pubkey,
    pub cranker: Pubkey,
    pub operator: Pubkey,
}

#[event]
pub struct TsnIntentCreated {
    pub mother_escrow: Pubkey,
    pub intent: Pubkey,
    pub intent_id: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
}

#[event]
pub struct TsnLeaseClaimed {
    pub intent: Pubkey,
    pub cranker: Pubkey,
    pub lease_expiry_ts: i64,
}

#[event]
pub struct TsnLeaseExpired {
    pub intent: Pubkey,
    pub previous_cranker: Pubkey,
}

#[event]
pub struct TsnProofSubmitted {
    pub intent: Pubkey,
    pub cranker: Pubkey,
    pub payout_amount: u64,
    pub fee_amount: u64,
    pub operator_fee_amount: u64,
    pub lp_fee_amount: u64,
    pub treasury_fee_amount: u64,
}

#[event]
pub struct TsnEpochSettled {
    pub mother_escrow: Pubkey,
    pub epoch_id: u64,
}

#[event]
pub struct TsnCrankerFundingPolicyUpdated {
    pub cranker: Pubkey,
    pub operator: Pubkey,
    pub allow_external_funding: bool,
}

#[event]
pub struct TsnCrankerVaultInitialized {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
}

#[event]
pub struct TsnCrankerFunded {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TsnCrankerFundsWithdrawn {
    pub cranker: Pubkey,
    pub cranker_vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}
