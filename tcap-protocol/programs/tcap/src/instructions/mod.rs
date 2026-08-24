mod legacy;

pub use legacy::*;

pub mod credit_tcap_tin_tip_v1;
pub mod debit_tcap_balance_v1;
pub mod deposit_asset_v2;
pub mod deposit_with_funding_commitment_v2;
pub mod exit_tcap_liquidity_v1;
pub mod initialize_asset_state_v1;
pub mod initialize_commitment_root_v1;
pub mod initialize_nullifier_registry_v1;
pub mod initialize_tcap_tin_tip_v1;
pub mod migrate_tcap_config_layout_v1;
pub mod initialize_tcap_v1;

pub use credit_tcap_tin_tip_v1::*;
pub use debit_tcap_balance_v1::*;
pub use exit_tcap_liquidity_v1::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DepositWithFundingCommitmentArgsV1 {
    pub amount: u64,
    pub settlement_mode: u8,
    pub destination_commitment: [u8; 32],
    pub funding_identifier: [u8; 32],
    pub authorization_nonce: u64,
    pub expires_at_slot: u64,
    pub fee_authorization_commitment: [u8; 32],
    pub salt: [u8; 32],
    pub domain_separator: [u8; 32],
    pub expected_funding_commitment: [u8; 32],
}
pub use deposit_asset_v2::*;
pub use deposit_with_funding_commitment_v2::*;
pub use initialize_asset_state_v1::*;
pub use initialize_tcap_tin_tip_v1::*;
pub use migrate_tcap_config_layout_v1::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdateAssetStatusArgsV1 {
    pub status: crate::TcapAssetStatusV1,
    pub risk: crate::TcapRiskStateV1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeCommitmentRootArgsV1 {
    pub empty_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeNullifierRegistryArgsV1 {
    pub domain_separator: [u8; 32],
}
use anchor_lang::prelude::*;
