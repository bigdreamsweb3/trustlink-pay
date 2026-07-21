use anchor_lang::prelude::*;

pub mod authority;
pub mod error;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use authority::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");

#[program]
pub mod tcap {
    use super::*;

    pub fn initialize_tcap_v1(
        ctx: Context<InitializeTcapV1>,
        args: InitializeTcapArgsV1,
    ) -> Result<()> {
        instructions::initialize_tcap_v1(ctx, args)
    }

    pub fn initialize_asset_registry_v1(ctx: Context<InitializeAssetRegistryV1>) -> Result<()> {
        instructions::initialize_asset_registry_v1(ctx)
    }

    pub fn register_asset_v1(
        ctx: Context<RegisterAssetV1>,
        args: RegisterAssetArgsV1,
    ) -> Result<()> {
        instructions::register_asset_v1(ctx, args)
    }

    pub fn update_asset_status_v1(
        ctx: Context<UpdateAssetStatusV1>,
        status: TcapAssetStatusV1,
        risk: TcapRiskStateV1,
    ) -> Result<()> {
        instructions::update_asset_status_v1(ctx, status, risk)
    }

    pub fn initialize_reserve_state_v1(ctx: Context<InitializeReserveStateV1>) -> Result<()> {
        instructions::initialize_reserve_state_v1(ctx)
    }

    pub fn initialize_nullifier_registry_v1(
        ctx: Context<InitializeNullifierRegistryV1>,
        domain_separator: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_nullifier_registry_v1(ctx, domain_separator)
    }

    pub fn initialize_commitment_root_v1(
        ctx: Context<InitializeCommitmentRootV1>,
        empty_tree_root: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_commitment_root_v1(ctx, empty_tree_root)
    }

    /// Records a replay-protected, non-spendable TSN authorization. It cannot
    /// move tokens, mutate a root, consume a nullifier, or create a claim.
    pub fn register_tsn_authorization_v1(
        ctx: Context<RegisterTsnAuthorizationV1>,
        authorization: TsnSettlementAuthorizationV1,
    ) -> Result<()> {
        instructions::register_tsn_authorization_v1(ctx, authorization)
    }

    pub fn initialize_reserve_vault_v1(ctx: Context<InitializeReserveVaultV1>) -> Result<()> {
        instructions::initialize_reserve_vault_v1(ctx)
    }

    pub fn set_asset_deposit_policy_v1(
        ctx: Context<SetAssetDepositPolicyV1>,
        enabled: bool,
    ) -> Result<()> {
        instructions::set_asset_deposit_policy_v1(ctx, enabled)
    }

    pub fn deposit_asset_v1(ctx: Context<DepositAssetV1>, amount: u64) -> Result<()> {
        instructions::deposit_asset_v1(ctx, amount)
    }
}
