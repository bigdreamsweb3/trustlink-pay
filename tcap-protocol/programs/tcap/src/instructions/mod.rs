mod legacy;

pub use legacy::*;

pub mod deposit_asset_v1;
pub mod initialize_asset_registry_v1;
pub mod initialize_commitment_root_v1;
pub mod initialize_nullifier_registry_v1;
pub mod initialize_reserve_state_v1;
pub mod initialize_reserve_vault_v1;
pub mod initialize_tcap_v1;
pub mod register_asset_v1;
pub mod set_asset_deposit_policy_v1;
pub mod update_asset_status_v1;

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
