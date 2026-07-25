use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::authority::*;
use crate::error::TcapError;
use crate::events::FundingClaimCreatedV2;
use crate::funding::*;
use crate::funding_state::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DepositWithFundingCommitmentArgsV2 {
    pub amount: u64,
    pub settlement_mode: u8,
    pub destination_commitment: [u8; 32],
    pub funding_identifier: [u8; 32],
    pub authorization_nonce: u64,
    pub expires_at_slot: u64,
    pub fee_authorization_commitment: [u8; 32],
    /// Commitment to client-local randomness. The raw randomness is never
    /// included in instruction data or persisted by TCAP.
    pub randomness_commitment: [u8; 32],
    pub domain_separator: [u8; 32],
    pub expected_funding_commitment: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: DepositWithFundingCommitmentArgsV2)]
pub struct DepositWithFundingCommitmentV2<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        seeds = [TCAP_GLOBAL_CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ TcapError::ProtocolPaused
    )]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(
        seeds = [TCAP_ASSET_STATE_SEED, token_program.key().as_ref(), mint.key().as_ref()],
        bump = asset_state.bump,
        constraint = asset_state.asset.token_program == token_program.key() @ TcapError::InvalidTokenProgram,
        constraint = asset_state.asset.mint == mint.key() @ TcapError::WrongAsset
    )]
    pub asset_state: Box<Account<'info, TcapAssetStateV1>>,
    #[account(
        mut,
        address = asset_state.reserve_state @ TcapError::InvalidReserve,
        constraint = reserve_state.asset_state == asset_state.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.future_vault == vault.key() @ TcapError::InvalidReserve,
        constraint = reserve_state.reserve_authority == asset_state.reserve_authority @ TcapError::InvalidReserve,
        constraint = reserve_state.funding_enabled @ TcapError::AssetUnavailable,
        constraint = !reserve_state.paused @ TcapError::AssetUnavailable
    )]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = FundingRootV1::SPACE,
        seeds = [TCAP_FUNDING_ROOT_SEED, asset_state.key().as_ref()],
        bump
    )]
    pub funding_root: Box<Account<'info, FundingRootV1>>,
    #[account(
        init,
        payer = depositor,
        space = FundingClaimV1::SPACE,
        seeds = [TCAP_FUNDING_CLAIM_SEED, asset_state.key().as_ref(), args.funding_identifier.as_ref()],
        bump
    )]
    pub funding_claim: Box<Account<'info, FundingClaimV1>>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = FundingAuthorizationNonceV1::SPACE,
        seeds = [TCAP_FUNDING_NONCE_SEED, asset_state.key().as_ref(), depositor.key().as_ref()],
        bump
    )]
    pub funding_nonce: Box<Account<'info, FundingAuthorizationNonceV1>>,
    #[account(
        mut,
        constraint = source.mint == mint.key() @ TcapError::WrongAsset,
        constraint = source.owner == depositor.key() @ TcapError::InvalidDepositSource
    )]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        address = asset_state.future_vault @ TcapError::ReserveVaultUnavailable,
        constraint = vault.mint == mint.key() @ TcapError::WrongAsset,
        constraint = vault.owner == asset_state.reserve_authority @ TcapError::InvalidReserve
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = asset_state.asset.mint @ TcapError::WrongAsset)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = asset_state.asset.token_program @ TcapError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DepositWithFundingCommitmentV2>,
    args: DepositWithFundingCommitmentArgsV2,
) -> Result<()> {
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
    require!(
        args.randomness_commitment != [0; 32],
        TcapError::EmptyCommitment
    );
    let settlement_mode = FundingSettlementModeV1::try_from(args.settlement_mode)
        .map_err(|_| error!(TcapError::InvalidSettlementMode))?;
    require!(
        args.expires_at_slot > Clock::get()?.slot,
        TcapError::FundingAuthorizationExpired
    );
    require_keys_eq!(
        *ctx.accounts.source.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    require_keys_eq!(
        *ctx.accounts.vault.to_account_info().owner,
        ctx.accounts.token_program.key(),
        TcapError::InvalidTokenProgram
    );
    let vault_before = ctx.accounts.vault.amount;
    require!(
        ctx.accounts.reserve_state.actual_assets == vault_before,
        TcapError::InvalidReserve
    );

    let expected_domain = funding_domain_separator_v3(
        ctx.accounts.config.protocol_version,
        ctx.accounts.config.domain_version,
        &[0u8; 32], // Note: asset_commitment is removed or zeroed in v3
    );
    require!(
        args.domain_separator == expected_domain,
        TcapError::InvalidFundingDomain
    );
    let authorization_commitment = depositor_authorization_commitment_v3(
        ctx.accounts.config.protocol_version,
        &ctx.accounts.depositor.key(),
        &ctx.accounts.asset_state.key(),
        &args.funding_identifier,
        args.authorization_nonce,
        args.expires_at_slot,
    );
    let computed_commitment = funding_commitment_v3(
        ctx.accounts.config.protocol_version,
        &ctx.accounts.reserve_state.key(),
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &[0u8; 32], // asset_commitment
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
                && nonce.asset_state == ctx.accounts.asset_state.key()
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
            empty_funding_root(&expected_domain, &ctx.accounts.asset_state.key()),
            0,
        )
    } else {
        require!(
            root.version == TCAP_STATE_VERSION_V1
                && root.protocol_version == ctx.accounts.config.protocol_version
                && root.asset_state == ctx.accounts.asset_state.key(),
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
    ctx.accounts.vault.reload()?;
    require!(
        ctx.accounts.vault.amount == new_actual_assets
            && ctx.accounts.vault.amount
                == vault_before
                    .checked_add(args.amount)
                    .ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::UnexpectedTokenBalanceDelta
    );
    ctx.accounts.reserve_state.actual_assets = ctx.accounts.vault.amount;
    ctx.accounts.reserve_state.pending_liabilities = new_pending_liabilities;

    let claim = &mut ctx.accounts.funding_claim;
    claim.version = TCAP_STATE_VERSION_V1;
    claim.protocol_version = ctx.accounts.config.protocol_version;
    claim.config = ctx.accounts.config.key();
    claim.asset_state = ctx.accounts.asset_state.key();
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
    root.asset_state = ctx.accounts.asset_state.key();
    root.previous_root = previous_root;
    root.current_root = current_root;
    root.sequence = next_sequence;
    root.bump = ctx.bumps.funding_root;

    let funding_nonce = &mut ctx.accounts.funding_nonce;
    funding_nonce.version = TCAP_STATE_VERSION_V1;
    funding_nonce.asset_state = ctx.accounts.asset_state.key();
    funding_nonce.depositor = ctx.accounts.depositor.key();
    funding_nonce.next_nonce = next_nonce;
    funding_nonce.last_funding_claim = claim.key();
    funding_nonce.bump = ctx.bumps.funding_nonce;

    emit!(FundingClaimCreatedV2 {
        version: crate::TCAP_INSTRUCTION_VERSION_V1,
        funding_claim: claim.key(),
        registry: Pubkey::default(),
        asset_entry: claim.asset_state,
        governance_policy: Pubkey::default(),
        extension_policy: Pubkey::default(),
        reserve_state: claim.reserve_state,
        token_program: ctx.accounts.token_program.key(),
        mint: ctx.accounts.mint.key(),
        funding_commitment: claim.funding_commitment,
        amount: claim.amount,
        actual_assets: ctx.accounts.reserve_state.actual_assets,
        pending_liabilities: new_pending_liabilities,
        previous_funding_root: previous_root,
        current_funding_root: current_root,
        funding_root_sequence: next_sequence,
        slot: Clock::get()?.slot,
    });
    Ok(())
}
