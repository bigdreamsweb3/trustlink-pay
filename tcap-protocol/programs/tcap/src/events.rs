use anchor_lang::prelude::*;

#[event]
pub struct TcapInitializedV1 {
    pub config: Pubkey,
    pub governance: Pubkey,
    pub approved_tsn_program: Pubkey,
    pub protocol_version: u16,
}

#[event]
pub struct AssetRegistryInitializedV1 {
    pub registry: Pubkey,
    pub registry_version: u32,
}

#[event]
pub struct AssetRegisteredV1 {
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub registry_version: u32,
}

#[event]
pub struct ReserveStateInitializedV1 {
    pub reserve_state: Pubkey,
    pub asset_entry: Pubkey,
    pub reserve_authority: Pubkey,
}

#[event]
pub struct TsnProgramAuthorizedV1 {
    pub receipt: Pubkey,
    pub epoch_id: u64,
    pub authorization_digest: [u8; 32],
}

#[event]
pub struct TcapPausedV1 {
    pub paused: bool,
    pub authority: Pubkey,
}

#[event]
pub struct ReserveVaultInitializedV1 {
    pub version: u16,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
}

#[event]
pub struct AssetDepositAcceptedV1 {
    pub version: u16,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub source: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub actual_assets: u64,
    pub accounting_epoch: u64,
}

#[event]
pub struct AssetDepositPolicyUpdatedV1 {
    pub asset_entry: Pubkey,
    pub enabled: bool,
}
