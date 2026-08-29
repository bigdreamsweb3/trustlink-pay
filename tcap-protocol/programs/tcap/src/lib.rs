use anchor_lang::prelude::*;

pub mod asset_governance;
pub mod authority;
pub mod error;
pub mod errors;
pub mod events;
pub mod funding;
pub mod funding_state;
pub mod instructions;
pub mod state;

pub use asset_governance::*;
pub use authority::*;
pub use errors::*;
pub use funding::*;
pub use funding_state::*;
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

    pub fn initialize_tcap_tin_tip_v1(
        ctx: Context<InitializeTcapTinTipV1>,
        args: InitializeTcapTinTipV1Args,
    ) -> Result<()> {
        instructions::initialize_tcap_tin_tip_v1(ctx, args)
    }

    pub fn credit_tcap_tin_tip_v1(
        ctx: Context<CreditTcapTinTipV1>,
        args: CreditTcapTinTipV1Args,
    ) -> Result<()> {
        instructions::credit_tcap_tin_tip_v1::handler(ctx, args)
    }

    pub fn debit_tcap_balance_v1(
        ctx: Context<DebitTcapBalanceV1>,
        args: DebitTcapBalanceV1Args,
    ) -> Result<()> {
        instructions::debit_tcap_balance_v1::handler(ctx, args)
    }

    pub fn exit_tcap_liquidity_v1(
        ctx: Context<ExitTcapLiquidityV1>,
        args: ExitTcapLiquidityV1Args,
    ) -> Result<()> {
        instructions::exit_tcap_liquidity_v1::handler(ctx, args)
    }

    pub fn initialize_asset_state_v1(ctx: Context<InitializeAssetStateV1>) -> Result<()> {
        instructions::initialize_asset_state_v1::handler(ctx)
    }

    pub fn raise_minimum_instruction_version_v2(
        ctx: Context<RaiseMinimumInstructionVersionV2>,
    ) -> Result<()> {
        asset_governance::raise_minimum_instruction_version_v2(ctx)
    }

    pub fn register_governed_asset_v2(
        ctx: Context<RegisterGovernedAssetV2>,
        args: RegisterGovernedAssetArgsV2,
    ) -> Result<()> {
        asset_governance::register_governed_asset_v2(ctx, args)
    }

    pub fn migrate_legacy_asset_policy_v2(
        ctx: Context<MigrateLegacyAssetPolicyV2>,
        args: MigrateLegacyAssetPolicyArgsV2,
    ) -> Result<()> {
        asset_governance::migrate_legacy_asset_policy_v2(ctx, args)
    }

    pub fn set_asset_approval_v2(
        ctx: Context<GovernAssetV2>,
        new_status: TcapAssetApprovalStatusV2,
    ) -> Result<()> {
        asset_governance::set_asset_approval_v2(ctx, new_status)
    }

    pub fn set_asset_settlement_policy_v2(
        ctx: Context<GovernAssetV2>,
        settlements_enabled: bool,
        public_exit_enabled: bool,
        confidential_settlement_enabled: bool,
    ) -> Result<()> {
        asset_governance::set_asset_settlement_policy_v2(
            ctx,
            settlements_enabled,
            public_exit_enabled,
            confidential_settlement_enabled,
        )
    }

    pub fn initialize_governed_reserve_v2(
        ctx: Context<InitializeGovernedReserveV2>,
    ) -> Result<()> {
        asset_governance::initialize_governed_reserve_v2(ctx)
    }

    pub fn initialize_governed_vault_v2(
        ctx: Context<InitializeGovernedVaultV2>,
    ) -> Result<()> {
        asset_governance::initialize_governed_vault_v2(ctx)
    }

    pub fn sync_governed_asset_infrastructure_v2(
        ctx: Context<SyncGovernedAssetInfrastructureV2>,
    ) -> Result<()> {
        asset_governance::sync_governed_asset_infrastructure_v2(ctx)
    }

    pub fn set_governed_deposit_policy_v2(
        ctx: Context<SetGovernedDepositPolicyV2>,
        enabled: bool,
    ) -> Result<()> {
        asset_governance::set_governed_deposit_policy_v2(ctx, enabled)
    }

    pub fn set_asset_operational_status_v2(
        ctx: Context<ManageOperationalAssetV2>,
        new_status: TcapAssetOperationalStatusV2,
    ) -> Result<()> {
        asset_governance::set_asset_operational_status_v2(ctx, new_status)
    }

    pub fn revoke_asset_approval_v2(
        ctx: Context<ManageOperationalAssetV2>,
    ) -> Result<()> {
        asset_governance::revoke_asset_approval_v2(ctx)
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

    pub fn migrate_tcap_config_layout_v1(
        ctx: Context<MigrateTcapConfigLayoutV1>,
    ) -> Result<()> {
        instructions::migrate_tcap_config_layout_v1::handler(ctx)
    }

    pub fn register_tsn_authorization_v1(
        ctx: Context<RegisterTsnAuthorizationV1>,
        authorization: TsnSettlementAuthorizationV1,
    ) -> Result<()> {
        instructions::register_tsn_authorization_v1(ctx, authorization)
    }

    /// Version 2 privacy-preserving GPRU credit. Unlike the legacy V1 path,
    /// this instruction has no intent, epoch, receipt, or per-transfer PDA.
    pub fn credit_tcap_tin_tip_v2(
        ctx: Context<CreditTcapTinTipV2>,
        args: CreditTcapTinTipV2Args,
    ) -> Result<()> {
        instructions::credit_tcap_tin_tip_v2::handler(ctx, args)
    }

    pub fn initialize_tcap_tip_liability_v2(
        ctx: Context<InitializeTcapTipLiabilityV2>,
        args: InitializeTcapTipLiabilityV2Args,
    ) -> Result<()> {
        instructions::initialize_tcap_tip_liability_v2::handler(ctx, args)
    }

    pub fn migrate_asset_entry_custody_graph_v2(
        ctx: Context<MigrateAssetEntryCustodyGraphV2>,
    ) -> Result<()> {
        instructions::migrate_asset_entry_custody_graph_v2::handler(ctx)
    }

    pub fn debit_tcap_gpru_tip_v2(
        ctx: Context<DebitTcapGpruTipV2>,
        args: DebitTcapGpruTipV2Args,
    ) -> Result<()> {
        instructions::debit_tcap_gpru_tip_v2::handler(ctx, args)
    }

    pub fn deposit_asset_v2(ctx: Context<DepositAssetV2>, amount: u64) -> Result<()> {
        instructions::deposit_asset_v2::handler(ctx, amount)
    }

    pub fn deposit_with_funding_commitment_v2(
        ctx: Context<DepositWithFundingCommitmentV2>,
        args: DepositWithFundingCommitmentArgsV2,
    ) -> Result<()> {
        instructions::deposit_with_funding_commitment_v2::handler(ctx, args)
    }
}
