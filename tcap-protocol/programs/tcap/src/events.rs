use anchor_lang::prelude::*;

use crate::asset_governance::{TcapAssetApprovalStatusV2, TcapAssetOperationalStatusV2};

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
pub struct AssetRegisteredV2 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub governance_policy: Pubkey,
    pub extension_policy: Pubkey,
    pub asset_commitment: [u8; 32],
    pub registry_version: u32,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub mint_profile: crate::asset_governance::TcapAssetMintProfileV2,
    pub approval_status: TcapAssetApprovalStatusV2,
    pub operational_status: TcapAssetOperationalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
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
pub struct AssetDepositAcceptedV2 {
    pub version: u16,
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub governance_policy: Pubkey,
    pub extension_policy: Pubkey,
    pub reserve_state: Pubkey,
    pub token_program: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub source: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub actual_assets: u64,
    pub accounting_epoch: u64,
    pub slot: u64,
}

#[event]
pub struct AssetDepositPolicyUpdatedV1 {
    pub asset_entry: Pubkey,
    pub enabled: bool,
}

#[event]
pub struct AssetApprovalUpdatedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_status: TcapAssetApprovalStatusV2,
    pub new_status: TcapAssetApprovalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetStatusUpdatedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_status: TcapAssetOperationalStatusV2,
    pub new_status: TcapAssetOperationalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetSettlementPolicyUpdatedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub previous_settlements_enabled: bool,
    pub previous_public_exit_enabled: bool,
    pub previous_confidential_settlement_enabled: bool,
    pub new_settlements_enabled: bool,
    pub new_public_exit_enabled: bool,
    pub new_confidential_settlement_enabled: bool,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetPausedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_status: TcapAssetOperationalStatusV2,
    pub new_status: TcapAssetOperationalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetResumedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_status: TcapAssetOperationalStatusV2,
    pub new_status: TcapAssetOperationalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetDeprecatedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub asset_commitment: [u8; 32],
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_status: TcapAssetOperationalStatusV2,
    pub new_status: TcapAssetOperationalStatusV2,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct CanonicalVaultInitializedV1 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub vault: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AssetDepositPolicyUpdatedV2 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub previous_enabled: bool,
    pub new_enabled: bool,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ReserveInitializedV2 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub reserve_authority: Pubkey,
    pub canonical_vault: Pubkey,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ReserveAssetsReconciledV2 {
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub vault: Pubkey,
    pub previous_actual_assets: u64,
    pub new_actual_assets: u64,
    pub total_liabilities: u64,
    pub reconciled_surplus: u64,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct MinimumInstructionVersionRaisedV2 {
    pub previous_version: u16,
    pub new_version: u16,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct FundingClaimCreatedV1 {
    pub version: u16,
    pub funding_claim: Pubkey,
    pub asset_entry: Pubkey,
    pub reserve_state: Pubkey,
    pub funding_commitment: [u8; 32],
    pub amount: u64,
    pub actual_assets: u64,
    pub pending_liabilities: u64,
    pub previous_funding_root: [u8; 32],
    pub current_funding_root: [u8; 32],
    pub funding_root_sequence: u64,
}

#[event]
pub struct FundingClaimCreatedV2 {
    pub version: u16,
    pub funding_claim: Pubkey,
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub governance_policy: Pubkey,
    pub extension_policy: Pubkey,
    pub reserve_state: Pubkey,
    pub token_program: Pubkey,
    pub mint: Pubkey,
    pub funding_commitment: [u8; 32],
    pub amount: u64,
    pub actual_assets: u64,
    pub pending_liabilities: u64,
    pub previous_funding_root: [u8; 32],
    pub current_funding_root: [u8; 32],
    pub funding_root_sequence: u64,
    pub slot: u64,
}
