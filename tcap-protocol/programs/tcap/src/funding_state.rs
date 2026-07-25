use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum FundingSettlementModeV1 {
    ConfidentialOwner,
    PublicWallet,
}

impl TryFrom<u8> for FundingSettlementModeV1 {
    type Error = ();

    fn try_from(value: u8) -> core::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::ConfidentialOwner),
            1 => Ok(Self::PublicWallet),
            _ => Err(()),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum FundingClaimStatusV1 {
    Pending,
}

#[account]
pub struct FundingRootV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub asset_state: Pubkey,
    pub current_root: [u8; 32],
    pub previous_root: [u8; 32],
    pub sequence: u64,
    pub bump: u8,
}

impl FundingRootV1 {
    pub const SPACE: usize = 8 + 2 + 2 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct FundingClaimV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub config: Pubkey,
    pub asset_state: Pubkey,
    pub reserve_state: Pubkey,
    pub funding_identifier: [u8; 32],
    pub funding_commitment: [u8; 32],
    pub amount: u64,
    pub settlement_mode: FundingSettlementModeV1,
    pub destination_commitment: [u8; 32],
    pub depositor_authorization_commitment: [u8; 32],
    pub authorization_nonce: u64,
    pub expires_at_slot: u64,
    pub fee_authorization_commitment: [u8; 32],
    pub domain_separator: [u8; 32],
    pub funding_root_sequence: u64,
    pub status: FundingClaimStatusV1,
    pub bump: u8,
}

impl FundingClaimV1 {
    pub const SPACE: usize = 8 + 2 + 2 + (32 * 5) + 8 + 1 + (32 * 2) + 8 + 8 + (32 * 2) + 8 + 1 + 1;
}

#[account]
pub struct FundingAuthorizationNonceV1 {
    pub version: u16,
    pub asset_state: Pubkey,
    pub depositor: Pubkey,
    pub next_nonce: u64,
    pub last_funding_claim: Pubkey,
    pub bump: u8,
}

impl FundingAuthorizationNonceV1 {
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 8 + 32 + 1;
}
