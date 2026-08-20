use anchor_lang::{prelude::*, solana_program::{hash::hashv, program_pack::Pack, sysvar}};
use anchor_spl::{associated_token::{self, get_associated_token_address, AssociatedToken}, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::tsn::{constants::{TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_EPOCH_CLAIM_SLOT_SEED, TSN_EPOCH_LEDGER_SEED, TSN_EPOCH_TREASURY_AUTHORITY_SEED, TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS, TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, TSN_SETTLEMENT_DNA_SEED, TSN_VERIFIER_SEED}, errors::TsnError, events::TsnPrivatePayoutExecuted, state::{ClaimSlotStatus, Cranker, CrankerVault, EpochClaimSlot, EpochSettlementLedger, EpochTreasury, MotherEscrow, PrivateSettlementConfig, SettlementDna, SettlementDnaStatus}, utils::{slot_settlement_message, verify_ed25519_permit}};

#[derive(Accounts)]
#[instruction(slot: [u8; 32], lease_version: u64)]
pub struct ExecutePrivatePayout<'info> {
    #[account(mut)] pub operator: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(mut, has_one = mother_escrow, constraint = cranker.operator == operator.key())] pub cranker: Box<Account<'info, Cranker>>,
    #[account(seeds = [TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, mother_escrow.key().as_ref()], bump = private_settlement_config.bump, has_one = mother_escrow)] pub private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>,
    #[account(mut, has_one = mother_escrow, constraint = epoch_treasury.token_account == treasury_token_account.key(), constraint = epoch_treasury.token_mint == token_mint.key())] pub epoch_treasury: Box<Account<'info, EpochTreasury>>,
    #[account(mut, seeds = [TSN_EPOCH_LEDGER_SEED, epoch_treasury.key().as_ref()], bump = epoch_ledger.bump, has_one = epoch_treasury, constraint = epoch_ledger.token_mint == token_mint.key())] pub epoch_ledger: Box<Account<'info, EpochSettlementLedger>>,
    #[account(mut, seeds = [TSN_SETTLEMENT_DNA_SEED, mother_escrow.key().as_ref(), slot.as_ref()], bump = settlement_dna.bump, has_one = mother_escrow)] pub settlement_dna: Box<Account<'info, SettlementDna>>,
    #[account(init_if_needed, payer = operator, space = EpochClaimSlot::SPACE, seeds = [TSN_EPOCH_CLAIM_SLOT_SEED, epoch_treasury.key().as_ref(), slot.as_ref()], bump)] pub claim_slot: Box<Account<'info, EpochClaimSlot>>,
    #[account(mut, has_one = mother_escrow, constraint = cranker_vault.cranker == cranker.key(), constraint = cranker_vault.vault_token_account == vault_token_account.key(), constraint = cranker_vault.token_mint == token_mint.key())] pub cranker_vault: Box<Account<'info, CrankerVault>>,
    /// CHECK: PDA authority for the CrankerVault token account.
    #[account(seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()], bump = cranker_vault.vault_authority_bump)] pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token_account.owner == vault_authority.key(), constraint = vault_token_account.mint == token_mint.key())] pub vault_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Recipient wallet is committed in the permit.
    pub recipient_wallet: UncheckedAccount<'info>,
    #[account(mut)] pub recipient_token_account: UncheckedAccount<'info>,
    #[account(seeds = [TSN_EPOCH_TREASURY_AUTHORITY_SEED, epoch_treasury.key().as_ref()], bump)] pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut, address = epoch_treasury.token_account)] pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(address = sysvar::instructions::ID)] pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)] pub verifier_pda: UncheckedAccount<'info>,
    pub token_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn execute_private_payout(ctx: Context<ExecutePrivatePayout>, slot: [u8; 32], settlement_commitment: [u8; 32], commitment_digest: [u8; 32], random_nonce: [u8; 32], payout_nullifier: [u8; 32], payout_amount: u64, claim_fee_amount: u64, lease_id_hash: [u8; 32], lease_version: u64, lease_expiry_ts: i64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.private_settlement_config.enabled, TsnError::PrivateSettlementDisabled);
    require_keys_eq!(ctx.accounts.epoch_ledger.epoch_treasury, ctx.accounts.epoch_treasury.key(), TsnError::InvalidPrivateCommitment);
    require!(payout_amount > 0 && slot != [0; 32] && commitment_digest != [0; 32], TsnError::InvalidPrivateCommitment);
    require!(now <= expires_at_ts && expires_at_ts <= lease_expiry_ts, TsnError::PermitExpired);
    require!(ctx.accounts.epoch_treasury.pending_liability >= payout_amount && ctx.accounts.epoch_ledger.pending_total >= payout_amount, TsnError::InvalidLiquidityReservation);
    require!(ctx.accounts.vault_token_account.amount >= payout_amount, TsnError::InsufficientCrankerVaultLiquidity);
    require!(ctx.accounts.treasury_token_account.amount >= payout_amount, TsnError::InsufficientEpochTreasuryLiquidity);
    require_keys_eq!(ctx.accounts.recipient_token_account.key(), get_associated_token_address(&ctx.accounts.recipient_wallet.key(), &ctx.accounts.token_mint.key()), TsnError::InvalidRecoveryDestination);
    require!(ctx.accounts.claim_slot.epoch_treasury == Pubkey::default() && ctx.accounts.claim_slot.settlement_commitment == [0; 32], TsnError::OneTimeDecryptionTokenAlreadyUsed);
    require!(ctx.accounts.settlement_dna.status == SettlementDnaStatus::Active && ctx.accounts.settlement_dna.slot == slot && ctx.accounts.settlement_dna.settlement_commitment == settlement_commitment && ctx.accounts.settlement_dna.commitment_digest == commitment_digest && ctx.accounts.settlement_dna.random_nonce == random_nonce && ctx.accounts.settlement_dna.payout_nullifier == payout_nullifier && ctx.accounts.settlement_dna.cranker == ctx.accounts.cranker.key() && ctx.accounts.settlement_dna.cranker_vault == ctx.accounts.cranker_vault.key() && ctx.accounts.settlement_dna.recipient == ctx.accounts.recipient_wallet.key() && ctx.accounts.settlement_dna.token_mint == ctx.accounts.token_mint.key() && ctx.accounts.settlement_dna.amount == payout_amount && ctx.accounts.settlement_dna.lease_id_hash == lease_id_hash && ctx.accounts.settlement_dna.lease_version == lease_version && ctx.accounts.settlement_dna.lease_expiry_ts == lease_expiry_ts && ctx.accounts.settlement_dna.authorization_expiry_ts == expires_at_ts, TsnError::InvalidPrivateCommitment);
    let expected_commitment = hashv(&[b"TSN_SETTLEMENT_COMMITMENT_V2", ctx.accounts.epoch_treasury.key().as_ref(), ctx.accounts.epoch_ledger.key().as_ref(), &slot, &commitment_digest, &random_nonce, &payout_nullifier, ctx.accounts.cranker_vault.key().as_ref(), ctx.accounts.recipient_wallet.key().as_ref(), ctx.accounts.token_mint.key().as_ref(), &payout_amount.to_le_bytes(), &claim_fee_amount.to_le_bytes(), &lease_id_hash, &lease_version.to_le_bytes(), &lease_expiry_ts.to_le_bytes(), &expires_at_ts.to_le_bytes()]).to_bytes();
    require!(expected_commitment == settlement_commitment, TsnError::InvalidPrivateCommitment);
    let message = slot_settlement_message(ctx.program_id, &ctx.accounts.mother_escrow.key(), &ctx.accounts.operator.key(), &ctx.accounts.epoch_treasury.key(), &ctx.accounts.epoch_ledger.key(), &ctx.accounts.claim_slot.key(), &slot, &settlement_commitment, &commitment_digest, &random_nonce, &payout_nullifier, &ctx.accounts.cranker_vault.key(), &ctx.accounts.recipient_wallet.key(), &ctx.accounts.token_mint.key(), payout_amount, claim_fee_amount, &lease_id_hash, lease_version, lease_expiry_ts, expires_at_ts);
    verify_ed25519_permit(&ctx.accounts.instructions_sysvar.to_account_info(), &ctx.accounts.private_settlement_config.permit_signer, &permit_signature, &message)?;
    let verifier_signer: &[&[&[u8]]] = &[&[TSN_VERIFIER_SEED, &[ctx.bumps.verifier_pda]]];
    if ctx.accounts.recipient_token_account.lamports() == 0 {
        let rent = Rent::get()?.minimum_balance(anchor_spl::token::spl_token::state::Account::LEN).checked_add(TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS).ok_or(TsnError::FeeSplitOverflow)?;
        require!(ctx.accounts.verifier_pda.lamports() >= rent, TsnError::InsufficientVerifierLamports);
        associated_token::create(CpiContext::new_with_signer(ctx.accounts.associated_token_program.to_account_info(), associated_token::Create { payer: ctx.accounts.verifier_pda.to_account_info(), associated_token: ctx.accounts.recipient_token_account.to_account_info(), authority: ctx.accounts.recipient_wallet.to_account_info(), mint: ctx.accounts.token_mint.to_account_info(), system_program: ctx.accounts.system_program.to_account_info(), token_program: ctx.accounts.token_program.to_account_info() }, verifier_signer))?;
    }
    let vault_key = ctx.accounts.cranker_vault.key();
    let vault_bump = ctx.accounts.cranker_vault.vault_authority_bump;
    let vault_signer: &[&[&[u8]]] = &[&[TSN_CRANKER_VAULT_AUTHORITY_SEED, vault_key.as_ref(), &[vault_bump]]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.vault_token_account.to_account_info(), to: ctx.accounts.recipient_token_account.to_account_info(), authority: ctx.accounts.vault_authority.to_account_info() }, vault_signer), payout_amount)?;
    let treasury_key = ctx.accounts.epoch_treasury.key();
    let treasury_signer: &[&[&[u8]]] = &[&[TSN_EPOCH_TREASURY_AUTHORITY_SEED, treasury_key.as_ref(), &[ctx.bumps.treasury_authority]]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.treasury_token_account.to_account_info(), to: ctx.accounts.vault_token_account.to_account_info(), authority: ctx.accounts.treasury_authority.to_account_info() }, treasury_signer), payout_amount)?;
    let treasury = &mut ctx.accounts.epoch_treasury; let ledger = &mut ctx.accounts.epoch_ledger; let slot_state = &mut ctx.accounts.claim_slot;
    treasury.pending_liability = treasury.pending_liability.checked_sub(payout_amount).ok_or(TsnError::InvalidLiquidityReservation)?; treasury.settled_total = treasury.settled_total.checked_add(payout_amount).ok_or(TsnError::FeeSplitOverflow)?; ledger.pending_total = ledger.pending_total.checked_sub(payout_amount).ok_or(TsnError::InvalidLiquidityReservation)?; ledger.settled_total = ledger.settled_total.checked_add(payout_amount).ok_or(TsnError::FeeSplitOverflow)?; ledger.slot_count = ledger.slot_count.checked_add(1).ok_or(TsnError::FeeSplitOverflow)?;
    slot_state.epoch_treasury = treasury.key(); slot_state.slot = slot; slot_state.amount = payout_amount; slot_state.token_mint = ctx.accounts.token_mint.key(); slot_state.status = ClaimSlotStatus::Settled; slot_state.settlement_cranker = ctx.accounts.cranker.key(); slot_state.cranker_vault = ctx.accounts.cranker_vault.key(); slot_state.commitment_digest = commitment_digest; slot_state.settlement_commitment = settlement_commitment; slot_state.payout_nullifier = payout_nullifier; slot_state.random_nonce = random_nonce; slot_state.recipient = ctx.accounts.recipient_wallet.key(); slot_state.lease_id_hash = lease_id_hash; slot_state.lease_version = lease_version; slot_state.lease_expiry_ts = lease_expiry_ts; slot_state.authorization_expiry_ts = expires_at_ts; slot_state.reimbursed = false; slot_state.bump = ctx.bumps.claim_slot;
    let vault = &mut ctx.accounts.cranker_vault; vault.total_liquidity = vault.total_liquidity.checked_sub(payout_amount).ok_or(TsnError::InsufficientCrankerVaultLiquidity)?.checked_add(payout_amount).ok_or(TsnError::FeeSplitOverflow)?; vault.total_rewards_accrued = vault.total_rewards_accrued.checked_add(claim_fee_amount).ok_or(TsnError::FeeSplitOverflow)?;
    treasury.reimbursed_total = treasury.reimbursed_total.checked_add(payout_amount).ok_or(TsnError::FeeSplitOverflow)?;
    slot_state.reimbursed = true;
    ctx.accounts.settlement_dna.status = SettlementDnaStatus::Consumed;
    let cranker = &mut ctx.accounts.cranker; cranker.claim_credits = cranker.claim_credits.saturating_sub(1); cranker.total_claims = cranker.total_claims.saturating_add(1); cranker.total_executes = cranker.total_executes.saturating_add(1); cranker.last_active_ts = now;
    emit!(TsnPrivatePayoutExecuted { epoch_treasury: treasury.key(), claim_slot: slot_state.key(), settlement_commitment, cranker_vault: vault.key(), payout_nullifier, cranker: cranker.key(), token_mint: ctx.accounts.token_mint.key(), payout_amount }); Ok(())
}
