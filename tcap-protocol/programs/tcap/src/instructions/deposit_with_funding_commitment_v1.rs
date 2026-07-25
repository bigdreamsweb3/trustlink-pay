use anchor_lang::prelude::*;
use anchor_spl::token::ID as SPL_TOKEN_PROGRAM_ID;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::asset_governance::require_v1_asset_instruction_enabled;
use crate::authority::*;
use crate::error::TcapError;
use crate::events::FundingClaimCreatedV1;
use crate::funding::*;
use crate::funding_state::*;
use crate::state::*;

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

#[derive(Accounts)]
#[instruction(args: DepositWithFundingCommitmentArgsV1)]
pub struct DepositWithFundingCommitmentV1<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(seeds = [TCAP_GLOBAL_CONFIG_SEED], bump = config.bump, constraint = !config.paused @ TcapError::ProtocolPaused)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_REGISTRY_SEED],
        bump = registry.bump,
        constraint = registry.config == config.key() @ TcapError::InvalidPda,
        constraint = !registry.frozen @ TcapError::AssetUnavailable
    )]
    pub registry: Box<Account<'info, TcapAssetRegistryV1>>,
    #[account(
        seeds = [TCAP_ASSET_ENTRY_SEED, registry.key().as_ref(), asset_entry.asset.token_program.as_ref(), asset_entry.asset.mint.as_ref()],
        bump = asset_entry.bump,
        constraint = asset_entry.registry == registry.key() @ TcapError::InvalidPda,
        constraint = asset_entry.deposits_enabled @ TcapError::AssetUnavailable,
        constraint = !asset_entry.paused && !asset_entry.deprecated @ TcapError::AssetUnavailable
    )]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(
        mut,
        address = asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_entry == asset_entry.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.funding_enabled @ TcapError::AssetUnavailable,
        constraint = !reserve_state.paused @ TcapError::AssetUnavailable
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = FundingRootV1::SPACE,
        seeds = [TCAP_FUNDING_ROOT_SEED, asset_entry.key().as_ref()],
        bump
    )]
    pub funding_root: Box<Account<'info, FundingRootV1>>,
    #[account(
        init,
        payer = depositor,
        space = FundingClaimV1::SPACE,
        seeds = [TCAP_FUNDING_CLAIM_SEED, asset_entry.key().as_ref(), args.funding_identifier.as_ref()],
        bump
    )]
    pub funding_claim: Box<Account<'info, FundingClaimV1>>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = FundingAuthorizationNonceV1::SPACE,
        seeds = [TCAP_FUNDING_NONCE_SEED, asset_entry.key().as_ref(), depositor.key().as_ref()],
        bump
    )]
    pub funding_nonce: Box<Account<'info, FundingAuthorizationNonceV1>>,
    #[account(mut, constraint = source.mint == asset_entry.asset.mint @ TcapError::WrongAsset, constraint = source.owner == depositor.key() @ TcapError::InvalidDepositSource)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        address = asset_entry.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == asset_entry.asset.mint @ TcapError::WrongAsset,
        constraint = vault.owner == asset_entry.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DepositWithFundingCommitmentV1>,
    args: DepositWithFundingCommitmentArgsV1,
) -> Result<()> {
    require_v1_asset_instruction_enabled(&ctx.accounts.config)?;
    require!(args.amount > 0, TcapError::InvalidDepositAmount);
    require!(
        args.destination_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.funding_identifier != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(
        args.fee_authorization_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    require!(args.salt != [0; 32], TcapError::EmptyCommitment);
    let settlement_mode = FundingSettlementModeV1::try_from(args.settlement_mode)
        .map_err(|_| error!(TcapError::InvalidSettlementMode))?;
    require!(
        args.expires_at_slot > Clock::get()?.slot,
        TcapError::FundingAuthorizationExpired
    );
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
    require!(
        ctx.accounts.reserve_state.actual_assets == ctx.accounts.vault.amount,
        TcapError::InvalidReserve
    );

    let expected_domain = funding_domain_separator(
        ctx.accounts.config.protocol_version,
        ctx.accounts.config.domain_version,
        &ctx.accounts.asset_entry.asset.asset_commitment,
    );
    require!(
        args.domain_separator == expected_domain,
        TcapError::InvalidFundingDomain
    );
    let authorization_commitment = depositor_authorization_commitment(
        ctx.accounts.config.protocol_version,
        &ctx.accounts.depositor.key(),
        &args.funding_identifier,
        args.authorization_nonce,
        args.expires_at_slot,
    );
    let computed_commitment = funding_commitment(
        ctx.accounts.config.protocol_version,
        &ctx.accounts.registry.key(),
        &ctx.accounts.reserve_state.key(),
        &ctx.accounts.asset_entry.asset,
        &authorization_commitment,
        &args,
    );
    require!(
        computed_commitment == args.expected_funding_commitment,
        TcapError::FundingCommitmentMismatch
    );

    let nonce = &ctx.accounts.funding_nonce;
    if nonce.version != 0 {
        require!(
            nonce.version == TCAP_STATE_VERSION_V1
                && nonce.asset_entry == ctx.accounts.asset_entry.key()
                && nonce.depositor == ctx.accounts.depositor.key(),
            TcapError::InvalidFundingAuthorizationNonce
        );
    }
    let next_nonce =
        validate_and_advance_funding_nonce(nonce.next_nonce, args.authorization_nonce)?;
    let (new_actual_assets, new_pending_liabilities) = next_reserve_funding_accounting(
        ctx.accounts.reserve_state.actual_assets,
        ctx.accounts.reserve_state.pending_liabilities,
        args.amount,
    )?;

    let root = &ctx.accounts.funding_root;
    let (starting_root, starting_sequence) = if root.version == 0 {
        (
            empty_funding_root(&expected_domain, &ctx.accounts.asset_entry.key()),
            0,
        )
    } else {
        require!(
            root.version == TCAP_STATE_VERSION_V1
                && root.protocol_version == ctx.accounts.config.protocol_version
                && root.asset_entry == ctx.accounts.asset_entry.key(),
            TcapError::InvalidFundingRoot
        );
        (root.current_root, root.sequence)
    };
    let next_sequence = next_funding_sequence(starting_sequence)?;
    let previous_root = starting_root;
    let current_root = next_funding_root(
        &expected_domain,
        &previous_root,
        &computed_commitment,
        next_sequence,
    );

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        args.amount,
        ctx.accounts.mint.decimals,
    )?;

    ctx.accounts.reserve_state.actual_assets = new_actual_assets;
    ctx.accounts.reserve_state.pending_liabilities = new_pending_liabilities;

    let claim = &mut ctx.accounts.funding_claim;
    claim.version = TCAP_STATE_VERSION_V1;
    claim.protocol_version = ctx.accounts.config.protocol_version;
    claim.config = ctx.accounts.config.key();
    claim.asset_entry = ctx.accounts.asset_entry.key();
    claim.reserve_state = ctx.accounts.reserve_state.key();
    claim.funding_identifier = args.funding_identifier;
    claim.funding_commitment = computed_commitment;
    claim.amount = args.amount;
    claim.settlement_mode = settlement_mode;
    claim.destination_commitment = args.destination_commitment;
    claim.depositor_authorization_commitment = authorization_commitment;
    claim.authorization_nonce = args.authorization_nonce;
    claim.expires_at_slot = args.expires_at_slot;
    claim.fee_authorization_commitment = args.fee_authorization_commitment;
    claim.domain_separator = expected_domain;
    claim.funding_root_sequence = next_sequence;
    claim.status = FundingClaimStatusV1::Pending;
    claim.bump = ctx.bumps.funding_claim;

    let root = &mut ctx.accounts.funding_root;
    root.version = TCAP_STATE_VERSION_V1;
    root.protocol_version = ctx.accounts.config.protocol_version;
    root.asset_entry = ctx.accounts.asset_entry.key();
    root.previous_root = previous_root;
    root.current_root = current_root;
    root.sequence = next_sequence;
    root.bump = ctx.bumps.funding_root;

    let funding_nonce = &mut ctx.accounts.funding_nonce;
    funding_nonce.version = TCAP_STATE_VERSION_V1;
    funding_nonce.asset_entry = ctx.accounts.asset_entry.key();
    funding_nonce.depositor = ctx.accounts.depositor.key();
    funding_nonce.next_nonce = next_nonce;
    funding_nonce.last_funding_claim = claim.key();
    funding_nonce.bump = ctx.bumps.funding_nonce;

    emit!(FundingClaimCreatedV1 {
        version: TCAP_INSTRUCTION_VERSION_V1,
        funding_claim: claim.key(),
        asset_entry: claim.asset_entry,
        reserve_state: claim.reserve_state,
        funding_commitment: claim.funding_commitment,
        amount: claim.amount,
        actual_assets: new_actual_assets,
        pending_liabilities: new_pending_liabilities,
        previous_funding_root: previous_root,
        current_funding_root: current_root,
        funding_root_sequence: next_sequence,
    });
    Ok(())
}
