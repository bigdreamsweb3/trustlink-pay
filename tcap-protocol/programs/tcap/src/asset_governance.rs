use anchor_lang::prelude::*;
use anchor_spl::token::ID as SPL_TOKEN_PROGRAM_ID;
use anchor_spl::token_2022::{
    spl_token_2022::{
        extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
        state::Mint as Token2022Mint,
    },
    ID as TOKEN_2022_PROGRAM_ID,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_program::hash::hashv;
use solana_program::program_option::COption;
use solana_program::program_pack::Pack;

use crate::authority::*;
use crate::error::TcapError;
use crate::events::*;
use crate::state::*;

pub const TCAP_ASSET_POLICY_VERSION_V2: u16 = 2;
pub const TCAP_INSTRUCTION_VERSION_V2: u16 = 2;
pub const EXTENSION_CONFIDENTIAL_TRANSFER: u64 = 1 << 0;
pub const EXTENSION_METADATA_POINTER: u64 = 1 << 1;
pub const EXTENSION_TOKEN_METADATA: u64 = 1 << 2;
pub const SUPPORTED_EXTENSION_BITMAP: u64 =
    EXTENSION_CONFIDENTIAL_TRANSFER | EXTENSION_METADATA_POINTER | EXTENSION_TOKEN_METADATA;

pub fn require_v1_asset_instruction_enabled(config: &TcapGlobalConfigV1) -> Result<()> {
    require!(
        config.minimum_instruction_version <= TCAP_INSTRUCTION_VERSION_V1,
        TcapError::LegacyInstructionDisabled
    );
    Ok(())
}

pub(crate) fn require_v2_instruction_enabled(config: &TcapGlobalConfigV1) -> Result<()> {
    require!(
        config.minimum_instruction_version <= TCAP_INSTRUCTION_VERSION_V2,
        TcapError::InvalidInstructionVersion
    );
    Ok(())
}

#[derive(Accounts)]
pub struct RaiseMinimumInstructionVersionV2<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(mut, seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
}

pub fn raise_minimum_instruction_version_v2(
    ctx: Context<RaiseMinimumInstructionVersionV2>,
) -> Result<()> {
    let previous_version = ctx.accounts.config.minimum_instruction_version;
    require!(
        ctx.accounts.config.minimum_instruction_version <= TCAP_INSTRUCTION_VERSION_V2,
        TcapError::InvalidInstructionVersion
    );
    if previous_version == TCAP_INSTRUCTION_VERSION_V2 {
        return Ok(());
    }
    ctx.accounts.config.minimum_instruction_version = TCAP_INSTRUCTION_VERSION_V2;
    emit!(MinimumInstructionVersionRaisedV2 {
        previous_version,
        new_version: TCAP_INSTRUCTION_VERSION_V2,
        authority: ctx.accounts.governance.key(),
        slot: Clock::get()?.slot,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TcapAssetApprovalStatusV2 {
    Pending,
    Approved,
    Rejected,
    Revoked,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TcapAssetOperationalStatusV2 {
    Inactive,
    Active,
    Paused,
    Deprecated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TcapAssetMintProfileV2 {
    /// Conventional public SPL-token balances and transfers.
    StandardPublic,
    /// Token-2022 mint with the immutable Confidential Transfer mint extension.
    ConfidentialTransferEnabled,
}

#[account]
pub struct TcapAssetGovernancePolicyV2 {
    pub version: u16,
    pub policy_version: u16,
    pub registry: Pubkey,
    pub asset_entry: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub approval_status: TcapAssetApprovalStatusV2,
    pub operational_status: TcapAssetOperationalStatusV2,
    pub deposits_enabled: bool,
    pub settlements_enabled: bool,
    pub public_exit_enabled: bool,
    pub confidential_settlement_enabled: bool,
    pub reserve_initialized: bool,
    pub vault_initialized: bool,
    pub deprecated_irreversible: bool,
    pub last_updated_slot: u64,
    pub authority: Pubkey,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl TcapAssetGovernancePolicyV2 {
    pub const SPACE: usize = 8 + 2 + 2 + (32 * 4) + 1 + 1 + 7 + 8 + 32 + 1 + 32;

    pub fn accepted_for_deposits(&self) -> bool {
        self.approval_status == TcapAssetApprovalStatusV2::Approved
            && self.operational_status == TcapAssetOperationalStatusV2::Active
            && self.deposits_enabled
            && self.reserve_initialized
            && self.vault_initialized
            && !self.deprecated_irreversible
    }

    pub fn accepted_for_settlement(&self) -> bool {
        self.approval_status == TcapAssetApprovalStatusV2::Approved
            && self.operational_status == TcapAssetOperationalStatusV2::Active
            && self.settlements_enabled
            && self.reserve_initialized
            && self.vault_initialized
            && !self.deprecated_irreversible
    }
}

#[account]
pub struct TcapAssetExtensionPolicyV2 {
    pub version: u16,
    pub asset_entry: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub decimals: u8,
    pub mint_profile: TcapAssetMintProfileV2,
    pub required_extension_bitmap: u64,
    pub allowed_extension_bitmap: u64,
    pub extension_bitmap: u64,
    pub extension_config_hash: [u8; 32],
    pub expected_mint_authority: Pubkey,
    pub expected_freeze_authority: Pubkey,
    pub confidential_transfer_enabled: bool,
    pub metadata_pointer_enabled: bool,
    pub token_metadata_enabled: bool,
    pub transfer_fee_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub permanent_delegate_enabled: bool,
    pub default_account_state_enabled: bool,
    pub non_transferable_enabled: bool,
    pub interest_bearing_enabled: bool,
    pub mint_close_authority_enabled: bool,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl TcapAssetExtensionPolicyV2 {
    pub const SPACE: usize = 8 + 2 + (32 * 3) + 1 + 1 + (8 * 3) + 32 + (32 * 2) + 10 + 1 + 32;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterGovernedAssetArgsV2 {
    pub asset_commitment: [u8; 32],
    pub governance_approval: [u8; 32],
    pub expected_decimals: u8,
    pub expected_mint_authority: Pubkey,
    pub expected_freeze_authority: Pubkey,
    pub mint_profile: TcapAssetMintProfileV2,
    pub required_extension_bitmap: u64,
    pub allowed_extension_bitmap: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct MigrateLegacyAssetPolicyArgsV2 {
    pub expected_mint_authority: Pubkey,
    pub expected_freeze_authority: Pubkey,
    pub mint_profile: TcapAssetMintProfileV2,
    pub required_extension_bitmap: u64,
    pub allowed_extension_bitmap: u64,
}

struct MintExtensionInspection {
    bitmap: u64,
    config_hash: [u8; 32],
    confidential_transfer_enabled: bool,
    metadata_pointer_enabled: bool,
    token_metadata_enabled: bool,
}

#[derive(Accounts)]
pub struct RegisterGovernedAssetV2<'info> {
    #[account(mut, address = config.registry_authority @ TcapError::InvalidAuthority)]
    pub registry_authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(mut, seeds = [TCAP_ASSET_REGISTRY_SEED], bump = registry.bump, constraint = !registry.frozen @ TcapError::AssetUnavailable)]
    pub registry: Box<Account<'info, TcapAssetRegistryV1>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        init,
        payer = registry_authority,
        space = TcapAssetEntryV1::SPACE,
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), token_program.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        init,
        payer = registry_authority,
        space = TcapAssetGovernancePolicyV2::SPACE,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        init,
        payer = registry_authority,
        space = TcapAssetExtensionPolicyV2::SPACE,
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    pub system_program: Program<'info, System>,
}

pub fn register_governed_asset_v2(
    ctx: Context<RegisterGovernedAssetV2>,
    args: RegisterGovernedAssetArgsV2,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    require!(args.asset_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(
        args.governance_approval != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        ctx.accounts.mint.decimals == args.expected_decimals,
        TcapError::InvalidMintDecimals
    );
    validate_token_program(&ctx.accounts.mint, &ctx.accounts.token_program.key())?;
    validate_expected_mint_authority(&ctx.accounts.mint, &args.expected_mint_authority)?;
    validate_expected_freeze_authority(&ctx.accounts.mint, &args.expected_freeze_authority)?;
    let inspection = inspect_extensions(
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        ctx.accounts.mint.decimals,
    )?;
    validate_mint_profile(
        args.mint_profile,
        args.required_extension_bitmap,
        args.allowed_extension_bitmap,
        &inspection,
    )?;

    let entry_key = ctx.accounts.asset_entry.key();
    let (reserve_state, _) = derive_reserve_state(&entry_key);
    let (reserve_authority, _) = derive_reserve_authority(&entry_key);
    let (future_vault, _) = derive_future_vault(&entry_key);
    let entry = &mut ctx.accounts.asset_entry;
    entry.version = TCAP_STATE_VERSION_V1;
    entry.protocol_version = ctx.accounts.config.protocol_version;
    entry.registry = ctx.accounts.registry.key();
    entry.asset = TcapAssetIdV1 {
        token_program: ctx.accounts.token_program.key(),
        mint: ctx.accounts.mint.key(),
        registry_version: ctx.accounts.registry.registry_version,
        asset_commitment: args.asset_commitment,
    };
    entry.reserve_state = reserve_state;
    entry.future_vault = future_vault;
    entry.reserve_authority = reserve_authority;
    entry.decimals = ctx.accounts.mint.decimals;
    entry.deposits_enabled = false;
    entry.withdrawals_enabled = false;
    entry.paused = true;
    entry.transfer_fee_policy = 0;
    entry.freeze_authority_policy = u8::from(ctx.accounts.mint.freeze_authority.is_some());
    entry.issuer_control_policy = u8::from(ctx.accounts.mint.mint_authority.is_some());
    entry.governance_approval = args.governance_approval;
    entry.status = TcapAssetStatusV1::Proposed;
    entry.risk_state = TcapRiskStateV1::PendingReview;
    entry.deprecated = false;
    entry.bump = ctx.bumps.asset_entry;

    initialize_governance_policy(
        &mut ctx.accounts.governance_policy,
        &ctx.accounts.config,
        &ctx.accounts.registry,
        entry,
        ctx.bumps.governance_policy,
    )?;
    initialize_extension_policy(
        &mut ctx.accounts.extension_policy,
        entry,
        &inspection,
        &args,
        ctx.bumps.extension_policy,
    );
    ctx.accounts.registry.entry_count = ctx
        .accounts
        .registry
        .entry_count
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;

    emit!(AssetRegisteredV1 {
        asset_entry: entry_key,
        asset_commitment: entry.asset.asset_commitment,
        registry_version: entry.asset.registry_version,
    });
    emit!(AssetRegisteredV2 {
        registry: ctx.accounts.registry.key(),
        asset_entry: entry_key,
        governance_policy: ctx.accounts.governance_policy.key(),
        extension_policy: ctx.accounts.extension_policy.key(),
        asset_commitment: entry.asset.asset_commitment,
        registry_version: entry.asset.registry_version,
        mint: entry.asset.mint,
        token_program: entry.asset.token_program,
        mint_profile: args.mint_profile,
        approval_status: TcapAssetApprovalStatusV2::Pending,
        operational_status: TcapAssetOperationalStatusV2::Inactive,
        authority: ctx.accounts.registry_authority.key(),
        slot: Clock::get()?.slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct MigrateLegacyAssetPolicyV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(seeds = [TCAP_ASSET_REGISTRY_SEED], bump = registry.bump)]
    pub registry: Box<Account<'info, TcapAssetRegistryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = asset_entry.registry == registry.key() @ TcapError::InvalidPda
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        init,
        payer = governance,
        space = TcapAssetGovernancePolicyV2::SPACE,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        init,
        payer = governance,
        space = TcapAssetExtensionPolicyV2::SPACE,
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    pub system_program: Program<'info, System>,
}

pub fn migrate_legacy_asset_policy_v2(
    ctx: Context<MigrateLegacyAssetPolicyV2>,
    args: MigrateLegacyAssetPolicyArgsV2,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    validate_token_program(&ctx.accounts.mint, &ctx.accounts.token_program.key())?;
    require!(
        ctx.accounts.asset_entry.decimals == ctx.accounts.mint.decimals,
        TcapError::InvalidMintDecimals
    );
    validate_expected_mint_authority(&ctx.accounts.mint, &args.expected_mint_authority)?;
    validate_expected_freeze_authority(&ctx.accounts.mint, &args.expected_freeze_authority)?;
    let inspection = inspect_extensions(
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        ctx.accounts.mint.decimals,
    )?;
    validate_mint_profile(
        args.mint_profile,
        args.required_extension_bitmap,
        args.allowed_extension_bitmap,
        &inspection,
    )?;
    ctx.accounts.asset_entry.deposits_enabled = false;
    ctx.accounts.asset_entry.withdrawals_enabled = false;
    ctx.accounts.asset_entry.paused = true;
    ctx.accounts.asset_entry.status = TcapAssetStatusV1::Proposed;
    ctx.accounts.asset_entry.risk_state = TcapRiskStateV1::PendingReview;
    initialize_governance_policy(
        &mut ctx.accounts.governance_policy,
        &ctx.accounts.config,
        &ctx.accounts.registry,
        &ctx.accounts.asset_entry,
        ctx.bumps.governance_policy,
    )?;
    initialize_extension_policy(
        &mut ctx.accounts.extension_policy,
        &ctx.accounts.asset_entry,
        &inspection,
        &RegisterGovernedAssetArgsV2 {
            asset_commitment: ctx.accounts.asset_entry.asset.asset_commitment,
            governance_approval: ctx.accounts.asset_entry.governance_approval,
            expected_decimals: ctx.accounts.asset_entry.decimals,
            expected_mint_authority: args.expected_mint_authority,
            expected_freeze_authority: args.expected_freeze_authority,
            mint_profile: args.mint_profile,
            required_extension_bitmap: args.required_extension_bitmap,
            allowed_extension_bitmap: args.allowed_extension_bitmap,
        },
        ctx.bumps.extension_policy,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct GovernAssetV2<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(seeds = [TCAP_ASSET_REGISTRY_SEED], bump = registry.bump)]
    pub registry: Box<Account<'info, TcapAssetRegistryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = asset_entry.registry == registry.key() @ TcapError::InvalidPda
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.registry == registry.key() @ TcapError::InvalidAssetPolicy
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
}

pub fn set_asset_approval_v2(
    ctx: Context<GovernAssetV2>,
    new_status: TcapAssetApprovalStatusV2,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    let slot = Clock::get()?.slot;
    let policy = &mut ctx.accounts.governance_policy;
    require!(
        !policy.deprecated_irreversible,
        TcapError::DeprecatedAssetImmutable
    );
    require!(
        policy.operational_status == TcapAssetOperationalStatusV2::Inactive,
        TcapError::InvalidAssetOperationalStatus
    );
    let previous_status = policy.approval_status;
    if previous_status == new_status {
        return Ok(());
    }
    let valid_transition = matches!(
        (previous_status, new_status),
        (
            TcapAssetApprovalStatusV2::Pending,
            TcapAssetApprovalStatusV2::Approved
        ) | (
            TcapAssetApprovalStatusV2::Pending,
            TcapAssetApprovalStatusV2::Rejected
        ) | (
            TcapAssetApprovalStatusV2::Rejected,
            TcapAssetApprovalStatusV2::Pending
        )
    );
    require!(valid_transition, TcapError::InvalidAssetPolicy);
    policy.approval_status = new_status;
    policy.last_updated_slot = slot;
    let entry = &mut ctx.accounts.asset_entry;
    match new_status {
        TcapAssetApprovalStatusV2::Approved => entry.risk_state = TcapRiskStateV1::Approved,
        TcapAssetApprovalStatusV2::Pending => {
            entry.risk_state = TcapRiskStateV1::PendingReview;
        }
        TcapAssetApprovalStatusV2::Rejected => {
            entry.risk_state = TcapRiskStateV1::Blocked;
        }
        TcapAssetApprovalStatusV2::Revoked => return err!(TcapError::InvalidAssetPolicy),
    }
    emit!(AssetApprovalUpdatedV1 {
        registry: policy.registry,
        asset_entry: policy.asset_entry,
        asset_commitment: entry.asset.asset_commitment,
        mint: policy.mint,
        token_program: policy.token_program,
        previous_status,
        new_status,
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ManageOperationalAssetV2<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_REGISTRY_SEED],
        bump = registry.bump,
        constraint = registry.config == config.key() @ TcapError::InvalidPda
    )]
    pub registry: Box<Account<'info, TcapAssetRegistryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), token_program.key().as_ref(), mint.key().as_ref()],
        bump = asset_entry.bump,
        constraint = asset_entry.registry == registry.key() @ TcapError::InvalidPda
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.registry == registry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.mint == mint.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.token_program == token_program.key() @ TcapError::InvalidAssetPolicy
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump = extension_policy.bump,
        constraint = extension_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    #[account(
        mut,
        address = asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.future_vault == vault.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.reserve_authority == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn set_asset_operational_status_v2(
    ctx: Context<ManageOperationalAssetV2>,
    new_status: TcapAssetOperationalStatusV2,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    let slot = Clock::get()?.slot;
    let policy = &mut ctx.accounts.governance_policy;
    if policy.deprecated_irreversible {
        require!(
            new_status == TcapAssetOperationalStatusV2::Deprecated,
            TcapError::DeprecatedAssetImmutable
        );
    }
    if requires_strict_activation_checks(new_status) {
        // Enabling or resuming an asset is fail-closed: every live mint,
        // extension, vault and accounting invariant must still match policy.
        verify_extension_policy(
            &ctx.accounts.mint,
            &ctx.accounts.token_program.key(),
            &ctx.accounts.extension_policy,
        )?;
        require_keys_eq!(
            *ctx.accounts.vault.to_account_info().owner,
            ctx.accounts.token_program.key(),
            TcapError::InvalidTokenProgram
        );
        require!(
            ctx.accounts.reserve_state.actual_assets == ctx.accounts.vault.amount,
            TcapError::InvalidReserve
        );
        require!(
            policy.approval_status == TcapAssetApprovalStatusV2::Approved,
            TcapError::AssetNotApproved
        );
        require!(policy.reserve_initialized, TcapError::ReserveNotInitialized);
        require!(policy.vault_initialized, TcapError::VaultNotInitialized);
    }
    let previous_status = policy.operational_status;
    if previous_status == new_status {
        return Ok(());
    }
    policy.operational_status = new_status;
    policy.last_updated_slot = slot;
    let entry = &mut ctx.accounts.asset_entry;
    match new_status {
        TcapAssetOperationalStatusV2::Inactive => {
            entry.status = TcapAssetStatusV1::Proposed;
            entry.paused = true;
            force_disable(policy, entry, &mut ctx.accounts.reserve_state);
        }
        TcapAssetOperationalStatusV2::Active => {
            entry.status = TcapAssetStatusV1::Active;
            entry.paused = false;
            entry.deprecated = false;
            ctx.accounts.reserve_state.paused = false;
        }
        TcapAssetOperationalStatusV2::Paused => {
            entry.status = TcapAssetStatusV1::DepositsPaused;
            entry.paused = true;
            force_disable(policy, entry, &mut ctx.accounts.reserve_state);
            emit!(AssetPausedV1 {
                registry: policy.registry,
                asset_entry: policy.asset_entry,
                asset_commitment: entry.asset.asset_commitment,
                mint: policy.mint,
                token_program: policy.token_program,
                previous_status,
                new_status,
                authority: ctx.accounts.governance.key(),
                slot,
            });
        }
        TcapAssetOperationalStatusV2::Deprecated => {
            entry.status = TcapAssetStatusV1::Deprecated;
            entry.risk_state = TcapRiskStateV1::Blocked;
            entry.paused = true;
            entry.deprecated = true;
            policy.deprecated_irreversible = true;
            force_disable(policy, entry, &mut ctx.accounts.reserve_state);
            emit!(AssetDeprecatedV1 {
                registry: policy.registry,
                asset_entry: policy.asset_entry,
                asset_commitment: entry.asset.asset_commitment,
                mint: policy.mint,
                token_program: policy.token_program,
                previous_status,
                new_status,
                authority: ctx.accounts.governance.key(),
                slot,
            });
        }
    }
    if previous_status == TcapAssetOperationalStatusV2::Paused
        && new_status == TcapAssetOperationalStatusV2::Active
    {
        emit!(AssetResumedV1 {
            registry: policy.registry,
            asset_entry: policy.asset_entry,
            asset_commitment: entry.asset.asset_commitment,
            mint: policy.mint,
            token_program: policy.token_program,
            previous_status,
            new_status,
            authority: ctx.accounts.governance.key(),
            slot,
        });
    }
    emit!(AssetStatusUpdatedV1 {
        registry: policy.registry,
        asset_entry: policy.asset_entry,
        asset_commitment: entry.asset.asset_commitment,
        mint: policy.mint,
        token_program: policy.token_program,
        previous_status,
        new_status,
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

fn requires_strict_activation_checks(status: TcapAssetOperationalStatusV2) -> bool {
    matches!(status, TcapAssetOperationalStatusV2::Active)
}

pub fn revoke_asset_approval_v2(ctx: Context<ManageOperationalAssetV2>) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    // Revocation is an emergency fail-safe. It must remain callable when the
    // live mint has drifted from its approved extension or authority policy.
    let slot = Clock::get()?.slot;
    let policy = &mut ctx.accounts.governance_policy;
    require!(
        !policy.deprecated_irreversible,
        TcapError::DeprecatedAssetImmutable
    );
    if policy.approval_status == TcapAssetApprovalStatusV2::Revoked {
        return Ok(());
    }
    require!(
        policy.approval_status == TcapAssetApprovalStatusV2::Approved,
        TcapError::InvalidAssetPolicy
    );
    let previous_status = policy.approval_status;
    policy.approval_status = TcapAssetApprovalStatusV2::Revoked;
    policy.operational_status = TcapAssetOperationalStatusV2::Paused;
    policy.last_updated_slot = slot;
    let entry = &mut ctx.accounts.asset_entry;
    entry.status = TcapAssetStatusV1::DepositsPaused;
    entry.risk_state = TcapRiskStateV1::Blocked;
    entry.paused = true;
    force_disable(policy, entry, &mut ctx.accounts.reserve_state);
    emit!(AssetApprovalUpdatedV1 {
        registry: policy.registry,
        asset_entry: policy.asset_entry,
        asset_commitment: entry.asset.asset_commitment,
        mint: policy.mint,
        token_program: policy.token_program,
        previous_status,
        new_status: TcapAssetApprovalStatusV2::Revoked,
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

pub fn set_asset_settlement_policy_v2(
    ctx: Context<GovernAssetV2>,
    settlements_enabled: bool,
    public_exit_enabled: bool,
    confidential_settlement_enabled: bool,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    require!(
        !settlements_enabled && !public_exit_enabled && !confidential_settlement_enabled,
        TcapError::SettlementNotImplemented
    );
    let slot = Clock::get()?.slot;
    let policy = &mut ctx.accounts.governance_policy;
    let previous_settlements_enabled = policy.settlements_enabled;
    let previous_public_exit_enabled = policy.public_exit_enabled;
    let previous_confidential_settlement_enabled = policy.confidential_settlement_enabled;
    policy.settlements_enabled = false;
    policy.public_exit_enabled = false;
    policy.confidential_settlement_enabled = false;
    policy.last_updated_slot = slot;
    emit!(AssetSettlementPolicyUpdatedV1 {
        registry: policy.registry,
        asset_entry: policy.asset_entry,
        previous_settlements_enabled,
        previous_public_exit_enabled,
        previous_confidential_settlement_enabled,
        new_settlements_enabled: false,
        new_public_exit_enabled: false,
        new_confidential_settlement_enabled: false,
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGovernedReserveV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.approval_status == TcapAssetApprovalStatusV2::Approved @ TcapError::AssetNotApproved
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        init,
        payer = governance,
        space = TcapReserveStateV1::SPACE,
        seeds = [TCAP_RESERVE_STATE_SEED, asset_entry.key().as_ref()],
        bump,
        constraint = asset_entry.reserve_state == reserve_state.key() @ TcapError::InvalidReserve
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    /// CHECK: Canonical PDA checked by seeds.
    #[account(seeds = [TCAP_RESERVE_AUTHORITY_SEED, asset_entry.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    /// CHECK: Canonical PDA checked by seeds; token account is initialized separately.
    #[account(seeds = [TCAP_FUTURE_VAULT_SEED, asset_entry.key().as_ref()], bump)]
    pub future_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_governed_reserve_v2(ctx: Context<InitializeGovernedReserveV2>) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    let reserve = &mut ctx.accounts.reserve_state;
    reserve.version = TCAP_STATE_VERSION_V1;
    reserve.protocol_version = ctx.accounts.config.protocol_version;
    reserve.asset_entry = ctx.accounts.asset_entry.key();
    reserve.future_vault = ctx.accounts.future_vault.key();
    reserve.reserve_authority = ctx.accounts.reserve_authority.key();
    reserve.actual_assets = 0;
    reserve.pending_liabilities = 0;
    reserve.settled_confidential_liabilities = 0;
    reserve.authorized_withdrawal_liabilities = 0;
    reserve.reserved_refund_liabilities = 0;
    reserve.accounting_epoch = 0;
    reserve.funding_enabled = false;
    reserve.paused = true;
    reserve.bump = ctx.bumps.reserve_state;
    reserve.reserve_authority_bump = ctx.bumps.reserve_authority;
    reserve.future_vault_bump = ctx.bumps.future_vault;
    ctx.accounts.governance_policy.reserve_initialized = true;
    ctx.accounts.governance_policy.last_updated_slot = Clock::get()?.slot;
    emit!(ReserveStateInitializedV1 {
        reserve_state: reserve.key(),
        asset_entry: reserve.asset_entry,
        reserve_authority: reserve.reserve_authority,
    });
    emit!(ReserveInitializedV2 {
        registry: ctx.accounts.governance_policy.registry,
        asset_entry: ctx.accounts.asset_entry.key(),
        reserve_state: reserve.key(),
        reserve_authority: reserve.reserve_authority,
        canonical_vault: reserve.future_vault,
        authority: ctx.accounts.governance.key(),
        slot: Clock::get()?.slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGovernedVaultV2<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.reserve_initialized @ TcapError::ReserveNotInitialized
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump = extension_policy.bump,
        constraint = extension_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.mint == mint.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.token_program == token_program.key() @ TcapError::InvalidAssetPolicy
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: Canonical PDA checked by seeds and used as token authority only.
    #[account(seeds = [TCAP_RESERVE_AUTHORITY_SEED, asset_entry.key().as_ref()], bump = reserve_state.reserve_authority_bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = governance,
        seeds = [TCAP_FUTURE_VAULT_SEED, asset_entry.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = reserve_authority,
        token::token_program = token_program,
        constraint = asset_entry.future_vault == vault.key() @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_governed_vault_v2(ctx: Context<InitializeGovernedVaultV2>) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    verify_extension_policy(
        &ctx.accounts.mint,
        &ctx.accounts.token_program.key(),
        &ctx.accounts.extension_policy,
    )?;
    require_keys_eq!(
        *ctx.accounts.vault.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.reserve_state.future_vault,
        ctx.accounts.vault.key(),
        TcapError::InvalidReserve
    );
    let slot = Clock::get()?.slot;
    ctx.accounts.governance_policy.vault_initialized = true;
    ctx.accounts.governance_policy.last_updated_slot = slot;
    emit!(CanonicalVaultInitializedV1 {
        registry: ctx.accounts.governance_policy.registry,
        asset_entry: ctx.accounts.asset_entry.key(),
        reserve_state: ctx.accounts.reserve_state.key(),
        vault: ctx.accounts.vault.key(),
        mint: ctx.accounts.mint.key(),
        token_program: ctx.accounts.token_program.key(),
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SyncGovernedAssetInfrastructureV2<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump = extension_policy.bump,
        constraint = extension_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.mint == mint.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.token_program == token_program.key() @ TcapError::InvalidAssetPolicy
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    #[account(
        mut,
        address = asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.future_vault == asset_entry.future_vault @ TcapError::InvalidReserve,
        constraint = reserve_state.reserve_authority == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn sync_governed_asset_infrastructure_v2(
    ctx: Context<SyncGovernedAssetInfrastructureV2>,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    verify_extension_policy(
        &ctx.accounts.mint,
        &ctx.accounts.token_program.key(),
        &ctx.accounts.extension_policy,
    )?;
    require_keys_eq!(
        *ctx.accounts.vault.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    let previous_actual_assets = ctx.accounts.reserve_state.actual_assets;
    let total_liabilities = ctx
        .accounts
        .reserve_state
        .total_liabilities()
        .ok_or(TcapError::ArithmeticOverflow)?;
    let new_actual_assets = reconcile_donated_vault_assets(
        previous_actual_assets,
        ctx.accounts.vault.amount,
        total_liabilities,
    )?;
    if new_actual_assets != previous_actual_assets {
        ctx.accounts.reserve_state.actual_assets = new_actual_assets;
        emit!(ReserveAssetsReconciledV2 {
            registry: ctx.accounts.governance_policy.registry,
            asset_entry: ctx.accounts.asset_entry.key(),
            reserve_state: ctx.accounts.reserve_state.key(),
            vault: ctx.accounts.vault.key(),
            previous_actual_assets,
            new_actual_assets,
            total_liabilities,
            reconciled_surplus: new_actual_assets
                .checked_sub(previous_actual_assets)
                .ok_or(TcapError::ArithmeticOverflow)?,
            authority: ctx.accounts.governance.key(),
            slot: Clock::get()?.slot,
        });
    }
    ctx.accounts.governance_policy.reserve_initialized = true;
    ctx.accounts.governance_policy.vault_initialized = true;
    ctx.accounts.governance_policy.last_updated_slot = Clock::get()?.slot;
    Ok(())
}

fn reconcile_donated_vault_assets(
    previous_actual_assets: u64,
    vault_amount: u64,
    total_liabilities: u64,
) -> Result<u64> {
    // Only an unsolicited inflow (or equality) is safe to reconcile here.
    // A lower live vault balance represents a loss and must never be hidden by
    // reducing the accounting record.
    require!(
        vault_amount >= previous_actual_assets,
        TcapError::UnexpectedTokenBalanceDelta
    );
    require!(
        vault_amount >= total_liabilities,
        TcapError::InsolventPendingFunding
    );
    Ok(vault_amount)
}

#[derive(Accounts)]
pub struct SetGovernedDepositPolicyV2<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        seeds = [TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_entry.key().as_ref()],
        bump = governance_policy.bump,
        constraint = governance_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.mint == mint.key() @ TcapError::InvalidAssetPolicy,
        constraint = governance_policy.token_program == token_program.key() @ TcapError::InvalidAssetPolicy
    )]
    pub governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>,
    #[account(
        seeds = [TCAP_ASSET_EXTENSION_POLICY_SEED, asset_entry.key().as_ref()],
        bump = extension_policy.bump,
        constraint = extension_policy.asset_entry == asset_entry.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.mint == mint.key() @ TcapError::InvalidAssetPolicy,
        constraint = extension_policy.token_program == token_program.key() @ TcapError::InvalidAssetPolicy
    )]
    pub extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(address = asset_entry.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_entry.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn set_governed_deposit_policy_v2(
    ctx: Context<SetGovernedDepositPolicyV2>,
    enabled: bool,
) -> Result<()> {
    require_v2_instruction_enabled(&ctx.accounts.config)?;
    if enabled {
        require!(!ctx.accounts.config.paused, TcapError::ProtocolPaused);
        require!(
            ctx.accounts.governance_policy.approval_status == TcapAssetApprovalStatusV2::Approved,
            TcapError::AssetNotApproved
        );
        require!(
            ctx.accounts.governance_policy.operational_status
                == TcapAssetOperationalStatusV2::Active,
            TcapError::InvalidAssetOperationalStatus
        );
        require!(
            ctx.accounts.governance_policy.reserve_initialized,
            TcapError::ReserveNotInitialized
        );
        require!(
            ctx.accounts.governance_policy.vault_initialized,
            TcapError::VaultNotInitialized
        );
        verify_extension_policy(
            &ctx.accounts.mint,
            &ctx.accounts.token_program.key(),
            &ctx.accounts.extension_policy,
        )?;
        require_keys_eq!(
            *ctx.accounts.vault.to_account_info().owner,
            ctx.accounts.token_program.key(),
            TcapError::InvalidTokenProgram
        );
        require!(
            ctx.accounts.reserve_state.actual_assets == ctx.accounts.vault.amount,
            TcapError::InvalidReserve
        );
    }
    let previous_enabled = ctx.accounts.governance_policy.deposits_enabled;
    let slot = Clock::get()?.slot;
    if previous_enabled == enabled {
        return Ok(());
    }
    ctx.accounts.governance_policy.deposits_enabled = enabled;
    ctx.accounts.governance_policy.last_updated_slot = slot;
    ctx.accounts.asset_entry.deposits_enabled = enabled;
    ctx.accounts.reserve_state.funding_enabled = enabled;
    emit!(AssetDepositPolicyUpdatedV1 {
        asset_entry: ctx.accounts.asset_entry.key(),
        enabled,
    });
    emit!(AssetDepositPolicyUpdatedV2 {
        registry: ctx.accounts.governance_policy.registry,
        asset_entry: ctx.accounts.asset_entry.key(),
        mint: ctx.accounts.mint.key(),
        token_program: ctx.accounts.token_program.key(),
        previous_enabled,
        new_enabled: enabled,
        authority: ctx.accounts.governance.key(),
        slot,
    });
    Ok(())
}

fn initialize_governance_policy(
    policy: &mut Account<TcapAssetGovernancePolicyV2>,
    config: &Account<TcapGlobalConfigV1>,
    registry: &Account<TcapAssetRegistryV1>,
    entry: &Account<TcapAssetEntryV1>,
    bump: u8,
) -> Result<()> {
    policy.version = TCAP_ASSET_POLICY_VERSION_V2;
    policy.policy_version = 1;
    policy.registry = registry.key();
    policy.asset_entry = entry.key();
    policy.mint = entry.asset.mint;
    policy.token_program = entry.asset.token_program;
    policy.approval_status = TcapAssetApprovalStatusV2::Pending;
    policy.operational_status = TcapAssetOperationalStatusV2::Inactive;
    policy.deposits_enabled = false;
    policy.settlements_enabled = false;
    policy.public_exit_enabled = false;
    policy.confidential_settlement_enabled = false;
    policy.reserve_initialized = false;
    policy.vault_initialized = false;
    policy.deprecated_irreversible = false;
    policy.last_updated_slot = Clock::get()?.slot;
    policy.authority = config.governance_authority;
    policy.bump = bump;
    policy.reserved = [0; 32];
    Ok(())
}

fn initialize_extension_policy(
    policy: &mut Account<TcapAssetExtensionPolicyV2>,
    entry: &Account<TcapAssetEntryV1>,
    inspection: &MintExtensionInspection,
    args: &RegisterGovernedAssetArgsV2,
    bump: u8,
) {
    policy.version = TCAP_ASSET_POLICY_VERSION_V2;
    policy.asset_entry = entry.key();
    policy.mint = entry.asset.mint;
    policy.token_program = entry.asset.token_program;
    policy.decimals = entry.decimals;
    policy.mint_profile = args.mint_profile;
    policy.required_extension_bitmap = args.required_extension_bitmap;
    policy.allowed_extension_bitmap = args.allowed_extension_bitmap;
    policy.extension_bitmap = inspection.bitmap;
    policy.extension_config_hash = inspection.config_hash;
    policy.expected_mint_authority = args.expected_mint_authority;
    policy.expected_freeze_authority = args.expected_freeze_authority;
    policy.confidential_transfer_enabled = inspection.confidential_transfer_enabled;
    policy.metadata_pointer_enabled = inspection.metadata_pointer_enabled;
    policy.token_metadata_enabled = inspection.token_metadata_enabled;
    policy.transfer_fee_enabled = false;
    policy.transfer_hook_enabled = false;
    policy.permanent_delegate_enabled = false;
    policy.default_account_state_enabled = false;
    policy.non_transferable_enabled = false;
    policy.interest_bearing_enabled = false;
    policy.mint_close_authority_enabled = false;
    policy.bump = bump;
    policy.reserved = [0; 32];
}

fn validate_token_program(mint: &InterfaceAccount<Mint>, token_program: &Pubkey) -> Result<()> {
    require_keys_eq!(
        *mint.to_account_info().owner,
        *token_program,
        TcapError::InvalidTokenProgram
    );
    require!(
        *token_program == SPL_TOKEN_PROGRAM_ID || *token_program == TOKEN_2022_PROGRAM_ID,
        TcapError::InvalidTokenProgram
    );
    Ok(())
}

fn validate_expected_mint_authority(
    mint: &InterfaceAccount<Mint>,
    expected: &Pubkey,
) -> Result<()> {
    let actual = match mint.mint_authority {
        COption::Some(authority) => authority,
        COption::None => Pubkey::default(),
    };
    require_keys_eq!(actual, *expected, TcapError::InvalidMintAuthority);
    Ok(())
}

fn validate_expected_freeze_authority(
    mint: &InterfaceAccount<Mint>,
    expected: &Pubkey,
) -> Result<()> {
    let actual = match mint.freeze_authority {
        COption::Some(authority) => authority,
        COption::None => Pubkey::default(),
    };
    require_keys_eq!(actual, *expected, TcapError::InvalidFreezeAuthority);
    Ok(())
}

fn validate_mint_profile(
    profile: TcapAssetMintProfileV2,
    required_extension_bitmap: u64,
    allowed_extension_bitmap: u64,
    inspection: &MintExtensionInspection,
) -> Result<()> {
    require!(
        required_extension_bitmap & !allowed_extension_bitmap == 0,
        TcapError::InvalidAssetPolicy
    );
    require!(
        allowed_extension_bitmap & !SUPPORTED_EXTENSION_BITMAP == 0,
        TcapError::UnsupportedTokenExtension
    );
    require!(
        inspection.bitmap & required_extension_bitmap == required_extension_bitmap,
        TcapError::ExtensionPolicyMismatch
    );
    require!(
        inspection.bitmap & !allowed_extension_bitmap == 0,
        TcapError::UnsupportedTokenExtension
    );
    match profile {
        TcapAssetMintProfileV2::StandardPublic => require!(
            !inspection.confidential_transfer_enabled
                && required_extension_bitmap & EXTENSION_CONFIDENTIAL_TRANSFER == 0,
            TcapError::InvalidMintProfile
        ),
        TcapAssetMintProfileV2::ConfidentialTransferEnabled => require!(
            inspection.confidential_transfer_enabled
                && required_extension_bitmap & EXTENSION_CONFIDENTIAL_TRANSFER != 0,
            TcapError::InvalidMintProfile
        ),
    }
    Ok(())
}

fn inspect_extensions(
    mint_info: &AccountInfo,
    token_program: &Pubkey,
    mint: &Pubkey,
    decimals: u8,
) -> Result<MintExtensionInspection> {
    let mut bitmap = 0_u64;
    let mut confidential_transfer_enabled = false;
    let mut metadata_pointer_enabled = false;
    let mut token_metadata_enabled = false;
    let data = mint_info.try_borrow_data()?;
    if *token_program == TOKEN_2022_PROGRAM_ID {
        let state = StateWithExtensions::<Token2022Mint>::unpack(&data)
            .map_err(|_| error!(TcapError::UnsupportedTokenExtension))?;
        for extension in state
            .get_extension_types()
            .map_err(|_| error!(TcapError::UnsupportedTokenExtension))?
        {
            match extension {
                ExtensionType::Uninitialized => {}
                ExtensionType::ConfidentialTransferMint => {
                    bitmap |= EXTENSION_CONFIDENTIAL_TRANSFER;
                    confidential_transfer_enabled = true;
                }
                ExtensionType::MetadataPointer => {
                    bitmap |= EXTENSION_METADATA_POINTER;
                    metadata_pointer_enabled = true;
                }
                ExtensionType::TokenMetadata => {
                    bitmap |= EXTENSION_TOKEN_METADATA;
                    token_metadata_enabled = true;
                }
                _ => return err!(TcapError::UnsupportedTokenExtension),
            }
        }
    }
    let extension_bytes = if data.len() > Token2022Mint::LEN {
        &data[Token2022Mint::LEN..]
    } else {
        &[]
    };
    let config_hash = hashv(&[
        b"trustlink:tcap:asset-extension-policy:v2",
        token_program.as_ref(),
        mint.as_ref(),
        &[decimals],
        &bitmap.to_le_bytes(),
        extension_bytes,
    ])
    .to_bytes();
    Ok(MintExtensionInspection {
        bitmap,
        config_hash,
        confidential_transfer_enabled,
        metadata_pointer_enabled,
        token_metadata_enabled,
    })
}

pub(crate) fn verify_extension_policy(
    mint: &InterfaceAccount<Mint>,
    token_program: &Pubkey,
    policy: &Account<TcapAssetExtensionPolicyV2>,
) -> Result<()> {
    validate_token_program(mint, token_program)?;
    require_keys_eq!(mint.key(), policy.mint, TcapError::WrongAsset);
    require_keys_eq!(
        *token_program,
        policy.token_program,
        TcapError::InvalidTokenProgram
    );
    require!(
        mint.decimals == policy.decimals,
        TcapError::InvalidMintDecimals
    );
    validate_expected_mint_authority(mint, &policy.expected_mint_authority)?;
    validate_expected_freeze_authority(mint, &policy.expected_freeze_authority)?;
    let inspection = inspect_extensions(
        &mint.to_account_info(),
        token_program,
        &mint.key(),
        mint.decimals,
    )?;
    require!(
        inspection.bitmap == policy.extension_bitmap
            && inspection.config_hash == policy.extension_config_hash,
        TcapError::ExtensionPolicyMismatch
    );
    validate_mint_profile(
        policy.mint_profile,
        policy.required_extension_bitmap,
        policy.allowed_extension_bitmap,
        &inspection,
    )?;
    Ok(())
}

fn force_disable(
    policy: &mut Account<TcapAssetGovernancePolicyV2>,
    entry: &mut Account<TcapAssetEntryV1>,
    reserve: &mut Account<TcapReserveStateV1>,
) {
    policy.deposits_enabled = false;
    policy.settlements_enabled = false;
    policy.public_exit_enabled = false;
    policy.confidential_settlement_enabled = false;
    entry.deposits_enabled = false;
    entry.withdrawals_enabled = false;
    reserve.funding_enabled = false;
    reserve.paused = true;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_approved_active_initialized_assets_are_accepted() {
        let mut policy = TcapAssetGovernancePolicyV2 {
            version: 2,
            policy_version: 1,
            registry: Pubkey::new_unique(),
            asset_entry: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            token_program: SPL_TOKEN_PROGRAM_ID,
            approval_status: TcapAssetApprovalStatusV2::Approved,
            operational_status: TcapAssetOperationalStatusV2::Active,
            deposits_enabled: true,
            settlements_enabled: true,
            public_exit_enabled: false,
            confidential_settlement_enabled: false,
            reserve_initialized: true,
            vault_initialized: true,
            deprecated_irreversible: false,
            last_updated_slot: 0,
            authority: Pubkey::new_unique(),
            bump: 1,
            reserved: [0; 32],
        };
        assert!(policy.accepted_for_deposits());
        assert!(policy.accepted_for_settlement());
        policy.operational_status = TcapAssetOperationalStatusV2::Paused;
        assert!(!policy.accepted_for_deposits());
        assert!(!policy.accepted_for_settlement());
    }

    #[test]
    fn governance_policy_allocation_covers_serialized_layout() {
        let policy = TcapAssetGovernancePolicyV2 {
            version: 2,
            policy_version: 1,
            registry: Pubkey::new_unique(),
            asset_entry: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            token_program: TOKEN_2022_PROGRAM_ID,
            approval_status: TcapAssetApprovalStatusV2::Pending,
            operational_status: TcapAssetOperationalStatusV2::Inactive,
            deposits_enabled: false,
            settlements_enabled: false,
            public_exit_enabled: false,
            confidential_settlement_enabled: false,
            reserve_initialized: false,
            vault_initialized: false,
            deprecated_irreversible: false,
            last_updated_slot: 0,
            authority: Pubkey::new_unique(),
            bump: 1,
            reserved: [0; 32],
        };
        assert!(8 + policy.try_to_vec().unwrap().len() <= TcapAssetGovernancePolicyV2::SPACE);
    }

    #[test]
    fn extension_policy_allocation_covers_serialized_layout() {
        let policy = TcapAssetExtensionPolicyV2 {
            version: TCAP_ASSET_POLICY_VERSION_V2,
            asset_entry: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            token_program: TOKEN_2022_PROGRAM_ID,
            decimals: 6,
            mint_profile: TcapAssetMintProfileV2::ConfidentialTransferEnabled,
            required_extension_bitmap: EXTENSION_CONFIDENTIAL_TRANSFER,
            allowed_extension_bitmap: EXTENSION_CONFIDENTIAL_TRANSFER
                | EXTENSION_METADATA_POINTER
                | EXTENSION_TOKEN_METADATA,
            extension_bitmap: EXTENSION_CONFIDENTIAL_TRANSFER,
            extension_config_hash: [1; 32],
            expected_mint_authority: Pubkey::new_unique(),
            expected_freeze_authority: Pubkey::default(),
            confidential_transfer_enabled: true,
            metadata_pointer_enabled: false,
            token_metadata_enabled: false,
            transfer_fee_enabled: false,
            transfer_hook_enabled: false,
            permanent_delegate_enabled: false,
            default_account_state_enabled: false,
            non_transferable_enabled: false,
            interest_bearing_enabled: false,
            mint_close_authority_enabled: false,
            bump: 255,
            reserved: [0; 32],
        };
        assert!(8 + policy.try_to_vec().unwrap().len() <= TcapAssetExtensionPolicyV2::SPACE);
    }

    #[test]
    fn mint_profiles_are_mutually_explicit() {
        let confidential = MintExtensionInspection {
            bitmap: EXTENSION_CONFIDENTIAL_TRANSFER
                | EXTENSION_METADATA_POINTER
                | EXTENSION_TOKEN_METADATA,
            config_hash: [0; 32],
            confidential_transfer_enabled: true,
            metadata_pointer_enabled: true,
            token_metadata_enabled: true,
        };
        assert!(validate_mint_profile(
            TcapAssetMintProfileV2::ConfidentialTransferEnabled,
            confidential.bitmap,
            confidential.bitmap,
            &confidential,
        )
        .is_ok());
        assert!(validate_mint_profile(
            TcapAssetMintProfileV2::StandardPublic,
            0,
            confidential.bitmap,
            &confidential,
        )
        .is_err());

        let standard = MintExtensionInspection {
            bitmap: 0,
            config_hash: [0; 32],
            confidential_transfer_enabled: false,
            metadata_pointer_enabled: false,
            token_metadata_enabled: false,
        };
        assert!(
            validate_mint_profile(TcapAssetMintProfileV2::StandardPublic, 0, 0, &standard,).is_ok()
        );
        assert!(validate_mint_profile(
            TcapAssetMintProfileV2::ConfidentialTransferEnabled,
            EXTENSION_CONFIDENTIAL_TRANSFER,
            EXTENSION_CONFIDENTIAL_TRANSFER,
            &standard,
        )
        .is_err());
    }

    #[test]
    fn vault_donations_reconcile_upward_without_hiding_losses() {
        assert_eq!(reconcile_donated_vault_assets(100, 125, 90).unwrap(), 125);
        assert_eq!(reconcile_donated_vault_assets(100, 100, 100).unwrap(), 100);
        assert!(reconcile_donated_vault_assets(100, 99, 90).is_err());
        assert!(reconcile_donated_vault_assets(50, 75, 76).is_err());
    }

    #[test]
    fn only_activation_or_resume_requires_healthy_asset_state() {
        assert!(requires_strict_activation_checks(
            TcapAssetOperationalStatusV2::Active
        ));
        assert!(!requires_strict_activation_checks(
            TcapAssetOperationalStatusV2::Inactive
        ));
        assert!(!requires_strict_activation_checks(
            TcapAssetOperationalStatusV2::Paused
        ));
        assert!(!requires_strict_activation_checks(
            TcapAssetOperationalStatusV2::Deprecated
        ));
    }
}
