use anchor_lang::prelude::*;
use anchor_spl::token::{Token, ID as SPL_TOKEN_PROGRAM_ID};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::asset_governance::require_v1_asset_instruction_enabled;
use crate::authority::*;
use crate::error::TcapError;
use crate::events::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeTcapArgsV1 {
    pub protocol_version: u16,
    pub emergency_authority: Pubkey,
    pub registry_authority: Pubkey,
    pub approved_tsn_program: Pubkey,
    pub domain_version: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeTcapArgsV1)]
pub struct InitializeTcapV1<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(
        init,
        payer = governance,
        space = TcapGlobalConfigV1::SPACE,
        seeds = [TCAP_GLOBAL_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, TcapGlobalConfigV1>,
    /// CHECK: Only its executable program identity is bound; TCAP never trusts its data here.
    #[account(executable)]
    pub approved_tsn_program: UncheckedAccount<'info>,
    /// CHECK: Canonical future registry address is validated but not created by this instruction.
    #[account(seeds = [TCAP_ASSET_REGISTRY_SEED], bump)]
    pub asset_registry: UncheckedAccount<'info>,
    /// CHECK: Canonical future root address is validated but not created by this instruction.
    #[account(seeds = [TCAP_COMMITMENT_ROOT_SEED], bump)]
    pub commitment_root_state: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_tcap_v1(
    ctx: Context<InitializeTcapV1>,
    args: InitializeTcapArgsV1,
) -> Result<()> {
    require!(args.protocol_version > 0, TcapError::InvalidPda);
    require!(args.domain_version > 0, TcapError::InvalidPda);
    require_keys_eq!(
        args.approved_tsn_program,
        ctx.accounts.approved_tsn_program.key(),
        TcapError::InvalidTsnProgram
    );
    require!(
        args.approved_tsn_program != Pubkey::default(),
        TcapError::InvalidTsnProgram
    );
    require!(
        args.approved_tsn_program != crate::ID,
        TcapError::InvalidTsnProgram
    );
    require!(
        args.approved_tsn_program != anchor_lang::system_program::ID,
        TcapError::InvalidTsnProgram
    );
    require!(
        args.emergency_authority != Pubkey::default(),
        TcapError::InvalidAuthority
    );
    require!(
        args.registry_authority != Pubkey::default(),
        TcapError::InvalidAuthority
    );

    let config = &mut ctx.accounts.config;
    config.version = TCAP_STATE_VERSION_V1;
    config.protocol_version = args.protocol_version;
    config.minimum_instruction_version = TCAP_INSTRUCTION_VERSION_V1;
    config.governance_authority = ctx.accounts.governance.key();
    config.emergency_authority = args.emergency_authority;
    config.registry_authority = args.registry_authority;
    config.approved_tsn_program = args.approved_tsn_program;
    config.proof_verifier_program = Pubkey::default();
    config.proof_verifier_enabled = false;
    config.paused = false;
    config.asset_registry = ctx.accounts.asset_registry.key();
    config.commitment_root_state = ctx.accounts.commitment_root_state.key();
    config.domain_version = args.domain_version;
    config.migration_state = TcapMigrationStateV1::Development;
    config.bump = ctx.bumps.config;

    emit!(TcapInitializedV1 {
        config: config.key(),
        governance: config.governance_authority,
        approved_tsn_program: config.approved_tsn_program,
        protocol_version: config.protocol_version,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeAssetRegistryV1<'info> {
    #[account(mut, address = config.registry_authority @ TcapError::InvalidAuthority)]
    pub registry_authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        init,
        payer = registry_authority,
        space = TcapAssetRegistryV1::SPACE,
        seeds = [TCAP_ASSET_REGISTRY_SEED],
        bump,
        constraint = config.asset_registry == registry.key() @ TcapError::InvalidPda
    )]
    pub registry: Account<'info, TcapAssetRegistryV1>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_asset_registry_v1(ctx: Context<InitializeAssetRegistryV1>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.version = TCAP_STATE_VERSION_V1;
    registry.config = ctx.accounts.config.key();
    registry.authority = ctx.accounts.registry_authority.key();
    registry.registry_version = 1;
    registry.entry_root = [0; 32];
    registry.entry_count = 0;
    registry.frozen = false;
    registry.bump = ctx.bumps.registry;
    emit!(AssetRegistryInitializedV1 {
        registry: registry.key(),
        registry_version: 1
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterAssetArgsV1 {
    pub asset_commitment: [u8; 32],
    pub transfer_fee_policy: u8,
    pub freeze_authority_policy: u8,
    pub issuer_control_policy: u8,
    pub governance_approval: [u8; 32],
}

#[derive(Accounts)]
pub struct RegisterAssetV1<'info> {
    #[account(mut, address = config.registry_authority @ TcapError::InvalidAuthority)]
    pub registry_authority: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, seeds = [TCAP_ASSET_REGISTRY_SEED], bump = registry.bump, constraint = !registry.frozen @ TcapError::AssetUnavailable)]
    pub registry: Account<'info, TcapAssetRegistryV1>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        init,
        payer = registry_authority,
        space = TcapAssetEntryV1::SPACE,
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), token_program.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    pub system_program: Program<'info, System>,
}

pub fn register_asset_v1(ctx: Context<RegisterAssetV1>, args: RegisterAssetArgsV1) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require!(args.asset_commitment != [0; 32], TcapError::EmptyCommitment);
    require!(
        args.governance_approval != [0; 32],
        TcapError::EmptyCommitment
    );
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        SPL_TOKEN_PROGRAM_ID,
        TcapError::InvalidTokenProgram
    );

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
    entry.transfer_fee_policy = args.transfer_fee_policy;
    entry.freeze_authority_policy = args.freeze_authority_policy;
    entry.issuer_control_policy = args.issuer_control_policy;
    entry.governance_approval = args.governance_approval;
    entry.status = TcapAssetStatusV1::Proposed;
    entry.risk_state = TcapRiskStateV1::PendingReview;
    entry.deprecated = false;
    entry.bump = ctx.bumps.asset_entry;
    ctx.accounts.registry.entry_count = ctx
        .accounts
        .registry
        .entry_count
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;

    emit!(AssetRegisteredV1 {
        asset_entry: entry_key,
        asset_commitment: args.asset_commitment,
        registry_version: entry.asset.registry_version,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAssetStatusV1<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, has_one = registry)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(seeds = [TCAP_ASSET_REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, TcapAssetRegistryV1>,
}

pub fn update_asset_status_v1(
    ctx: Context<UpdateAssetStatusV1>,
    status: TcapAssetStatusV1,
    risk: TcapRiskStateV1,
) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    let entry = &mut ctx.accounts.asset_entry;
    entry.status = status;
    entry.risk_state = risk;
    entry.paused = !matches!(status, TcapAssetStatusV1::Active);
    entry.deprecated = matches!(status, TcapAssetStatusV1::Deprecated);
    // Phase 3 never enables either direction, including when metadata becomes Active.
    entry.deposits_enabled = false;
    entry.withdrawals_enabled = false;
    Ok(())
}

pub fn deprecate_asset_v1(ctx: Context<UpdateAssetStatusV1>) -> Result<()> {
    update_asset_status_v1(ctx, TcapAssetStatusV1::Deprecated, TcapRiskStateV1::Blocked)
}

#[derive(Accounts)]
pub struct InitializeReserveStateV1<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(
        init,
        payer = governance,
        space = TcapReserveStateV1::SPACE,
        seeds = [TCAP_RESERVE_STATE_SEED, asset_entry.key().as_ref()],
        bump,
        constraint = asset_entry.reserve_state == reserve_state.key() @ TcapError::InvalidReserve
    )]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    /// CHECK: PDA metadata only; no account or token vault is created.
    #[account(seeds = [TCAP_RESERVE_AUTHORITY_SEED, asset_entry.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    /// CHECK: PDA metadata only; Phase 3 creates no token account.
    #[account(seeds = [TCAP_FUTURE_VAULT_SEED, asset_entry.key().as_ref()], bump)]
    pub future_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_reserve_state_v1(ctx: Context<InitializeReserveStateV1>) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require_keys_eq!(
        ctx.accounts.asset_entry.reserve_authority,
        ctx.accounts.reserve_authority.key(),
        TcapError::InvalidReserve
    );
    require_keys_eq!(
        ctx.accounts.asset_entry.future_vault,
        ctx.accounts.future_vault.key(),
        TcapError::InvalidReserve
    );
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
    emit!(ReserveStateInitializedV1 {
        reserve_state: reserve.key(),
        asset_entry: reserve.asset_entry,
        reserve_authority: reserve.reserve_authority
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeNullifierRegistryV1<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(init, payer = governance, space = NullifierRegistryV1::SPACE, seeds = [TCAP_NULLIFIER_REGISTRY_SEED], bump)]
    pub nullifier_registry: Account<'info, NullifierRegistryV1>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_nullifier_registry_v1(
    ctx: Context<InitializeNullifierRegistryV1>,
    domain_separator: [u8; 32],
) -> Result<()> {
    require!(domain_separator != [0; 32], TcapError::EmptyCommitment);
    let registry = &mut ctx.accounts.nullifier_registry;
    registry.version = TCAP_STATE_VERSION_V1;
    registry.protocol_version = ctx.accounts.config.protocol_version;
    registry.config = ctx.accounts.config.key();
    registry.domain_separator = domain_separator;
    registry.storage_model = NullifierStorageModelV1::HybridShardedIndividualPdas;
    registry.shard_count = 0;
    registry.consumed_count = 0;
    registry.paused = true;
    registry.bump = ctx.bumps.nullifier_registry;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeCommitmentRootV1<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(
        init,
        payer = governance,
        space = TcapCommitmentRootStateV1::SPACE,
        seeds = [TCAP_COMMITMENT_ROOT_SEED],
        bump,
        constraint = config.commitment_root_state == commitment_root.key() @ TcapError::InvalidPda
    )]
    pub commitment_root: Account<'info, TcapCommitmentRootStateV1>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_commitment_root_v1(
    ctx: Context<InitializeCommitmentRootV1>,
    empty_tree_root: [u8; 32],
) -> Result<()> {
    let root = &mut ctx.accounts.commitment_root;
    root.version = TCAP_STATE_VERSION_V1;
    root.protocol_version = ctx.accounts.config.protocol_version;
    root.current_root = empty_tree_root;
    root.previous_root = empty_tree_root;
    root.root_version = 1;
    root.sequence = 0;
    root.history_policy = 1; // append-only external history in a future audited phase
    root.verifier_config = Pubkey::default();
    root.verifier_enabled = false;
    root.paused = true;
    root.bump = ctx.bumps.commitment_root;
    Ok(())
}

#[derive(Accounts)]
pub struct SetTcapPauseV1<'info> {
    #[account(constraint = authority.key() == config.governance_authority || authority.key() == config.emergency_authority @ TcapError::InvalidAuthority)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, TcapGlobalConfigV1>,
}

pub fn set_tcap_pause_v1(ctx: Context<SetTcapPauseV1>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(TcapPausedV1 {
        paused,
        authority: ctx.accounts.authority.key()
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct TsnEpochCommitmentHeaderV1 {
    version: u16,
    epoch_id: u64,
    accepted_intent_root: [u8; 32],
    previous_tcap_state_root: [u8; 32],
}

fn read_tsn_epoch(
    account: &AccountInfo,
    tsn_program: &Pubkey,
) -> Result<TsnEpochCommitmentHeaderV1> {
    require_keys_eq!(
        *account.owner,
        *tsn_program,
        TcapError::InvalidTsnEpochRecord
    );
    let data = account.try_borrow_data()?;
    require!(data.len() >= 8, TcapError::InvalidTsnEpochRecord);
    let expected =
        anchor_lang::solana_program::hash::hash(b"account:EpochCommitmentStateV1").to_bytes();
    require!(data[..8] == expected[..8], TcapError::InvalidTsnEpochRecord);
    TsnEpochCommitmentHeaderV1::deserialize(&mut &data[8..])
        .map_err(|_| error!(TcapError::InvalidTsnEpochRecord))
}

#[derive(Accounts)]
#[instruction(authorization: TsnSettlementAuthorizationV1)]
pub struct RegisterTsnAuthorizationV1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(seeds = [TCAP_COMMITMENT_ROOT_SEED], bump = commitment_root.bump)]
    pub commitment_root: Account<'info, TcapCommitmentRootStateV1>,
    /// CHECK: Executable identity must equal the governance-bound approved TSN program.
    #[account(executable, address = config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: Owner and discriminator are validated before its epoch roots are read.
    pub tsn_epoch_commitment: UncheckedAccount<'info>,
    pub tsn_authorization_signer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = TsnAuthorizationReceiptV1::SPACE,
        seeds = [TCAP_TSN_AUTH_RECEIPT_SEED, authorization.authorization_digest.as_ref()],
        bump
    )]
    pub authorization_receipt: Account<'info, TsnAuthorizationReceiptV1>,
    pub system_program: Program<'info, System>,
}

pub fn register_tsn_authorization_v1(
    ctx: Context<RegisterTsnAuthorizationV1>,
    authorization: TsnSettlementAuthorizationV1,
) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require!(
        authorization.version == TSN_AUTHORIZATION_VERSION_V1,
        TcapError::InvalidPda
    );
    require_keys_eq!(
        authorization.tsn_program_id,
        ctx.accounts.config.approved_tsn_program,
        TcapError::InvalidTsnProgram
    );
    require!(
        authorization.authorization_digest != [0; 32] && authorization.replay_nonce != [0; 32],
        TcapError::EmptyCommitment
    );
    // This receipt is intentionally restricted to the credit-only transition.
    // AuthorizationOnly is an internal/preflight mode and must never mint a
    // receipt consumable by `credit_tcap_tin_tip_v1`.
    require!(
        matches!(
            authorization.transition_type,
            TcapTransitionTypeV1::ConfidentialSettlement
        ),
        TcapError::InvalidSettlementMode
    );
    require!(
        authorization.tin_tip != Pubkey::default()
            && authorization.previous_commitment != [0; 32]
            && authorization.new_commitment != [0; 32]
            && authorization.policy_commitment != [0; 32]
            && authorization.gpru_scope_commitment != [0; 32]
            && authorization.nullifier != [0; 32]
            && authorization.sequence > 0
            && authorization.token_id > 0,
        TcapError::InvalidTipAuthorization
    );
    require!(
        !ctx.accounts.asset_entry.paused && !ctx.accounts.asset_entry.deprecated,
        TcapError::AssetUnavailable
    );
    require_keys_eq!(
        ctx.accounts.asset_entry.reserve_state,
        ctx.accounts.reserve_state.key(),
        TcapError::InvalidReserve
    );
    require!(
        authorization.asset_commitment == ctx.accounts.asset_entry.asset.asset_commitment,
        TcapError::WrongAsset
    );
    require!(
        authorization.previous_tcap_root == ctx.accounts.commitment_root.current_root,
        TcapError::WrongTcapRoot
    );
    let clock = Clock::get()?;
    require!(
        clock.slot >= authorization.valid_after_slot && clock.slot <= authorization.expires_at_slot,
        TcapError::AuthorizationExpired
    );

    let expected_signer = derive_tsn_authorization_signer(
        &ctx.accounts.config.approved_tsn_program,
        &authorization.authorization_digest,
    )
    .0;
    require_keys_eq!(
        ctx.accounts.tsn_authorization_signer.key(),
        expected_signer,
        TcapError::InvalidTsnAuthorizationSigner
    );
    let epoch = read_tsn_epoch(
        &ctx.accounts.tsn_epoch_commitment.to_account_info(),
        &ctx.accounts.config.approved_tsn_program,
    )?;
    require!(
        epoch.version == TCAP_STATE_VERSION_V1 && epoch.epoch_id == authorization.epoch_id,
        TcapError::WrongEpochRoot
    );
    require!(
        epoch.accepted_intent_root == authorization.accepted_intent_root,
        TcapError::WrongEpochRoot
    );
    require!(
        epoch.previous_tcap_state_root == authorization.previous_tcap_root,
        TcapError::WrongTcapRoot
    );

    let receipt = &mut ctx.accounts.authorization_receipt;
    write_confidential_credit_receipt(
        receipt,
        ctx.accounts.config.key(),
        authorization,
        ctx.bumps.authorization_receipt,
    );
    emit!(TsnProgramAuthorizedV1 {
        receipt: receipt.key(),
        epoch_id: receipt.epoch_id,
        authorization_digest: receipt.authorization_digest
    });
    Ok(())
}

fn write_confidential_credit_receipt(
    receipt: &mut TsnAuthorizationReceiptV1,
    config: Pubkey,
    authorization: TsnSettlementAuthorizationV1,
    bump: u8,
) {
    receipt.version = TCAP_STATE_VERSION_V1;
    receipt.config = config;
    receipt.tsn_program_id = authorization.tsn_program_id;
    receipt.epoch_id = authorization.epoch_id;
    receipt.accepted_intent_root = authorization.accepted_intent_root;
    receipt.previous_tcap_root = authorization.previous_tcap_root;
    receipt.asset_commitment = authorization.asset_commitment;
    receipt.authorization_digest = authorization.authorization_digest;
    receipt.replay_nonce = authorization.replay_nonce;
    receipt.tin_tip = authorization.tin_tip;
    receipt.previous_commitment = authorization.previous_commitment;
    receipt.new_commitment = authorization.new_commitment;
    receipt.sequence = authorization.sequence;
    receipt.token_id = authorization.token_id;
    receipt.policy_commitment = authorization.policy_commitment;
    receipt.gpru_scope_commitment = authorization.gpru_scope_commitment;
    receipt.nullifier = authorization.nullifier;
    receipt.transition_type = authorization.transition_type;
    receipt.valid_after_slot = authorization.valid_after_slot;
    receipt.expires_at_slot = authorization.expires_at_slot;
    receipt.non_spendable = true;
    receipt.consumed = false;
    receipt.bump = bump;
}

#[cfg(test)]
mod confidential_settlement_receipt_tests {
    use super::*;

    fn confidential_authorization() -> TsnSettlementAuthorizationV1 {
        TsnSettlementAuthorizationV1 {
            version: TSN_AUTHORIZATION_VERSION_V1,
            tsn_program_id: Pubkey::new_unique(),
            epoch_id: 7,
            accepted_intent_root: [1; 32],
            previous_tcap_root: [2; 32],
            transition_type: TcapTransitionTypeV1::ConfidentialSettlement,
            asset_commitment: [3; 32],
            authorization_digest: [4; 32],
            verifier_domain_version: 1,
            valid_after_slot: 10,
            expires_at_slot: 20,
            replay_nonce: [5; 32],
            tin_tip: Pubkey::new_unique(),
            previous_commitment: [6; 32],
            new_commitment: [7; 32],
            sequence: 1,
            token_id: 1,
            policy_commitment: [8; 32],
            gpru_scope_commitment: [9; 32],
            nullifier: [10; 32],
        }
    }

    #[test]
    fn confidential_settlement_abi_has_credit_fields() {
        let authorization = confidential_authorization();
        assert!(matches!(
            authorization.transition_type,
            TcapTransitionTypeV1::ConfidentialSettlement
        ));
        assert_ne!(authorization.tin_tip, Pubkey::default());
        assert_ne!(authorization.previous_commitment, [0; 32]);
        assert_ne!(authorization.new_commitment, [0; 32]);
        assert_ne!(authorization.policy_commitment, [0; 32]);
        assert_ne!(authorization.gpru_scope_commitment, [0; 32]);
        assert_ne!(authorization.nullifier, [0; 32]);
        assert!(authorization.sequence > 0 && authorization.token_id > 0);
    }

    #[test]
    fn authorization_only_is_not_a_credit_transition() {
        let mut authorization = confidential_authorization();
        authorization.transition_type = TcapTransitionTypeV1::AuthorizationOnly;
        assert!(!matches!(
            authorization.transition_type,
            TcapTransitionTypeV1::ConfidentialSettlement
        ));
    }

    #[test]
    fn receipt_copy_preserves_every_credit_field() {
        let authorization = confidential_authorization();
        let mut receipt = TsnAuthorizationReceiptV1 {
            version: 0,
            config: Pubkey::default(),
            tsn_program_id: Pubkey::default(),
            epoch_id: 0,
            accepted_intent_root: [0; 32],
            previous_tcap_root: [0; 32],
            asset_commitment: [0; 32],
            authorization_digest: [0; 32],
            replay_nonce: [0; 32],
            tin_tip: Pubkey::default(),
            previous_commitment: [0; 32],
            new_commitment: [0; 32],
            sequence: 0,
            token_id: 0,
            policy_commitment: [0; 32],
            gpru_scope_commitment: [0; 32],
            nullifier: [0; 32],
            transition_type: TcapTransitionTypeV1::AuthorizationOnly,
            valid_after_slot: 0,
            expires_at_slot: 0,
            non_spendable: false,
            consumed: false,
            bump: 0,
        };
        write_confidential_credit_receipt(&mut receipt, Pubkey::new_unique(), authorization, 9);
        assert_eq!(receipt.tin_tip, authorization.tin_tip);
        assert_eq!(
            receipt.previous_commitment,
            authorization.previous_commitment
        );
        assert_eq!(receipt.new_commitment, authorization.new_commitment);
        assert_eq!(receipt.sequence, authorization.sequence);
        assert_eq!(receipt.token_id, authorization.token_id);
        assert_eq!(receipt.policy_commitment, authorization.policy_commitment);
        assert_eq!(
            receipt.gpru_scope_commitment,
            authorization.gpru_scope_commitment
        );
        assert_eq!(receipt.nullifier, authorization.nullifier);
        assert_eq!(receipt.valid_after_slot, authorization.valid_after_slot);
        assert_eq!(receipt.expires_at_slot, authorization.expires_at_slot);
        assert!(matches!(
            receipt.transition_type,
            TcapTransitionTypeV1::ConfidentialSettlement
        ));
    }
}

#[derive(Accounts)]
pub struct InitializeReserveVaultV1<'info> {
    #[account(mut, address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: This PDA is the sole token authority for the reserve vault.
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
        constraint = asset_entry.future_vault == vault.key() @ TcapError::InvalidReserve,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_reserve_vault_v1(ctx: Context<InitializeReserveVaultV1>) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require_keys_eq!(
        ctx.accounts.mint.key(),
        ctx.accounts.asset_entry.asset.mint,
        TcapError::WrongAsset
    );
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        SPL_TOKEN_PROGRAM_ID,
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.reserve_state.future_vault,
        ctx.accounts.vault.key(),
        TcapError::InvalidReserve
    );
    require!(
        !ctx.accounts.asset_entry.deprecated,
        TcapError::AssetUnavailable
    );
    emit!(ReserveVaultInitializedV1 {
        version: TCAP_INSTRUCTION_VERSION_V1,
        asset_entry: ctx.accounts.asset_entry.key(),
        reserve_state: ctx.accounts.reserve_state.key(),
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key()
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetAssetDepositPolicyV1<'info> {
    #[account(address = config.governance_authority @ TcapError::InvalidAuthority)]
    pub governance: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(mut, seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}

pub fn set_asset_deposit_policy_v1(
    ctx: Context<SetAssetDepositPolicyV1>,
    enabled: bool,
) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    if enabled {
        require!(
            matches!(ctx.accounts.asset_entry.status, TcapAssetStatusV1::Active),
            TcapError::AssetUnavailable
        );
        require!(
            matches!(
                ctx.accounts.asset_entry.risk_state,
                TcapRiskStateV1::Approved
            ),
            TcapError::AssetUnavailable
        );
        require!(
            !ctx.accounts.asset_entry.paused && !ctx.accounts.asset_entry.deprecated,
            TcapError::AssetUnavailable
        );
    }
    require_keys_eq!(
        *ctx.accounts.vault.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.vault.mint,
        ctx.accounts.asset_entry.asset.mint,
        TcapError::WrongAsset
    );
    ctx.accounts.asset_entry.deposits_enabled = enabled;
    ctx.accounts.reserve_state.funding_enabled = enabled;
    ctx.accounts.reserve_state.paused = !enabled;
    emit!(AssetDepositPolicyUpdatedV1 {
        asset_entry: ctx.accounts.asset_entry.key(),
        enabled
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DepositAssetV1<'info> {
    pub depositor: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Account<'info, TcapGlobalConfigV1>,
    #[account(seeds = [TCAP_ASSET_ENTRY_SEED, asset_entry.registry.as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()], bump = asset_entry.bump, constraint = asset_entry.deposits_enabled @ TcapError::AssetUnavailable, constraint = !asset_entry.paused && !asset_entry.deprecated @ TcapError::AssetUnavailable)]
    pub asset_entry: Account<'info, TcapAssetEntryV1>,
    #[account(mut, address = asset_entry.reserve_state @ TcapError::InvalidReserve, constraint = reserve_state.funding_enabled @ TcapError::AssetUnavailable, constraint = !reserve_state.paused @ TcapError::AssetUnavailable)]
    pub reserve_state: Account<'info, TcapReserveStateV1>,
    #[account(mut, constraint = source.mint == asset_entry.asset.mint @ TcapError::WrongAsset, constraint = source.owner == depositor.key() @ TcapError::InvalidDepositSource)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable, constraint = vault.mint == asset_entry.asset.mint @ TcapError::WrongAsset, constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn deposit_asset_v1(ctx: Context<DepositAssetV1>, amount: u64) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require!(amount > 0, TcapError::InvalidDepositAmount);
    require_keys_eq!(
        ctx.accounts.mint.key(),
        ctx.accounts.asset_entry.asset.mint,
        TcapError::WrongAsset
    );
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        SPL_TOKEN_PROGRAM_ID,
        TcapError::InvalidTokenProgram
    );
    let cpi_accounts = token_interface::TransferChecked {
        from: ctx.accounts.source.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    let reserve = &mut ctx.accounts.reserve_state;
    reserve.actual_assets = reserve
        .actual_assets
        .checked_add(amount)
        .ok_or(TcapError::ArithmeticOverflow)?;
    emit!(AssetDepositAcceptedV1 {
        version: TCAP_INSTRUCTION_VERSION_V1,
        asset_entry: ctx.accounts.asset_entry.key(),
        reserve_state: reserve.key(),
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key(),
        source: ctx.accounts.source.key(),
        depositor: ctx.accounts.depositor.key(),
        amount,
        actual_assets: reserve.actual_assets,
        accounting_epoch: reserve.accounting_epoch
    });
    Ok(())
}
