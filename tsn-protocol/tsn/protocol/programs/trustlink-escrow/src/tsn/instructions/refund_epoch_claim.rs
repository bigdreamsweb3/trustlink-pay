use anchor_lang::{prelude::*, solana_program::{hash::hashv, sysvar}};
use anchor_spl::{associated_token::{self, AssociatedToken}, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::tsn::{constants::{TSN_EPOCH_CLAIM_SLOT_SEED, TSN_EPOCH_LEDGER_SEED, TSN_EPOCH_TREASURY_AUTHORITY_SEED, TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, TSN_SETTLEMENT_DNA_SEED, TSN_VERIFIER_SEED}, errors::TsnError, events::TsnEpochClaimRefunded, state::{ClaimSlotStatus, EpochClaimSlot, EpochSettlementLedger, EpochTreasury, MotherEscrow, PrivateSettlementConfig, SettlementDna, SettlementDnaStatus}, utils::{slot_refund_message, verify_ed25519_permit}};

#[derive(Accounts)]
#[instruction(slot: [u8; 32], lease_version: u64)]
pub struct RefundEpochClaim<'info> {
    #[account(mut)] pub operator: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(seeds = [TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, mother_escrow.key().as_ref()], bump = private_settlement_config.bump, has_one = mother_escrow)] pub private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>,
    #[account(mut, has_one = mother_escrow, constraint = epoch_treasury.token_account == treasury_token_account.key(), constraint = epoch_treasury.token_mint == token_mint.key())] pub epoch_treasury: Box<Account<'info, EpochTreasury>>,
    #[account(mut, seeds = [TSN_EPOCH_LEDGER_SEED, epoch_treasury.key().as_ref()], bump = epoch_ledger.bump, has_one = epoch_treasury, constraint = epoch_ledger.token_mint == token_mint.key())] pub epoch_ledger: Box<Account<'info, EpochSettlementLedger>>,
    #[account(mut, seeds = [TSN_SETTLEMENT_DNA_SEED, mother_escrow.key().as_ref(), slot.as_ref()], bump = settlement_dna.bump, has_one = mother_escrow)] pub settlement_dna: Box<Account<'info, SettlementDna>>,
    #[account(init_if_needed, payer = operator, space = EpochClaimSlot::SPACE, seeds = [TSN_EPOCH_CLAIM_SLOT_SEED, epoch_treasury.key().as_ref(), slot.as_ref()], bump)] pub claim_slot: Box<Account<'info, EpochClaimSlot>>,
    #[account(seeds = [TSN_EPOCH_TREASURY_AUTHORITY_SEED, epoch_treasury.key().as_ref()], bump)] pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut, address = epoch_treasury.token_account)] pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Sender wallet is bound in the Mother/Node refund permit.
    pub sender_wallet: UncheckedAccount<'info>,
    #[account(mut)] pub sender_token_account: UncheckedAccount<'info>,
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)] pub verifier_pda: UncheckedAccount<'info>,
    #[account(address = sysvar::instructions::ID)] pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>, pub associated_token_program: Program<'info, AssociatedToken>, pub system_program: Program<'info, System>,
}

pub fn refund_epoch_claim(ctx: Context<RefundEpochClaim>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], refund_nullifier: [u8; 32], refund_amount: u64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.private_settlement_config.enabled && now <= expires_at_ts && refund_amount > 0 && slot != [0;32], TsnError::PermitExpired);
    require_keys_eq!(ctx.accounts.epoch_ledger.epoch_treasury, ctx.accounts.epoch_treasury.key(), TsnError::InvalidPrivateCommitment);
    require!(ctx.accounts.claim_slot.epoch_treasury == Pubkey::default() && ctx.accounts.claim_slot.settlement_commitment == [0; 32], TsnError::OneTimeDecryptionTokenAlreadyUsed);
    require!(ctx.accounts.settlement_dna.status == SettlementDnaStatus::Active && ctx.accounts.settlement_dna.slot == slot && ctx.accounts.settlement_dna.commitment_digest == commitment_digest && ctx.accounts.settlement_dna.payout_nullifier == refund_nullifier && ctx.accounts.settlement_dna.amount == refund_amount && ctx.accounts.settlement_dna.lease_version == lease_version, TsnError::InvalidPrivateCommitment);
    require!(ctx.accounts.epoch_treasury.pending_liability >= refund_amount && ctx.accounts.epoch_ledger.pending_total >= refund_amount, TsnError::InvalidLiquidityReservation);
    let message = slot_refund_message(ctx.program_id, &ctx.accounts.mother_escrow.key(), &ctx.accounts.operator.key(), &ctx.accounts.epoch_treasury.key(), &ctx.accounts.epoch_ledger.key(), &ctx.accounts.claim_slot.key(), &slot, lease_version, &commitment_digest, &ctx.accounts.sender_wallet.key(), &ctx.accounts.token_mint.key(), refund_amount, &refund_nullifier, expires_at_ts);
    verify_ed25519_permit(&ctx.accounts.instructions_sysvar.to_account_info(), &ctx.accounts.private_settlement_config.permit_signer, &permit_signature, &message)?;
    require_keys_eq!(ctx.accounts.sender_token_account.key(), anchor_spl::associated_token::get_associated_token_address(&ctx.accounts.sender_wallet.key(), &ctx.accounts.token_mint.key()), TsnError::InvalidRecoveryDestination);
    let verifier_signer: &[&[&[u8]]] = &[&[TSN_VERIFIER_SEED, &[ctx.bumps.verifier_pda]]];
    if ctx.accounts.sender_token_account.lamports() == 0 { associated_token::create(CpiContext::new_with_signer(ctx.accounts.associated_token_program.to_account_info(), associated_token::Create { payer: ctx.accounts.verifier_pda.to_account_info(), associated_token: ctx.accounts.sender_token_account.to_account_info(), authority: ctx.accounts.sender_wallet.to_account_info(), mint: ctx.accounts.token_mint.to_account_info(), system_program: ctx.accounts.system_program.to_account_info(), token_program: ctx.accounts.token_program.to_account_info() }, verifier_signer))?; }
    let treasury_key = ctx.accounts.epoch_treasury.key(); let treasury_signer: &[&[&[u8]]] = &[&[TSN_EPOCH_TREASURY_AUTHORITY_SEED, treasury_key.as_ref(), &[ctx.bumps.treasury_authority]]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.treasury_token_account.to_account_info(), to: ctx.accounts.sender_token_account.to_account_info(), authority: ctx.accounts.treasury_authority.to_account_info() }, treasury_signer), refund_amount)?;
    let treasury = &mut ctx.accounts.epoch_treasury; let ledger = &mut ctx.accounts.epoch_ledger; treasury.pending_liability -= refund_amount; treasury.refunded_total = treasury.refunded_total.checked_add(refund_amount).ok_or(TsnError::FeeSplitOverflow)?; ledger.pending_total -= refund_amount; ledger.refunded_total = ledger.refunded_total.checked_add(refund_amount).ok_or(TsnError::FeeSplitOverflow)?; ledger.slot_count = ledger.slot_count.checked_add(1).ok_or(TsnError::FeeSplitOverflow)?;
    let refund_commitment = hashv(&[b"TSN_REFUND_COMMITMENT_V1", ctx.accounts.epoch_treasury.key().as_ref(), &slot, &commitment_digest, &refund_nullifier, ctx.accounts.sender_wallet.key().as_ref(), ctx.accounts.token_mint.key().as_ref(), &refund_amount.to_le_bytes(), &expires_at_ts.to_le_bytes()]).to_bytes();
    let slot_state = &mut ctx.accounts.claim_slot; slot_state.epoch_treasury = treasury.key(); slot_state.slot = slot; slot_state.amount = refund_amount; slot_state.token_mint = ctx.accounts.token_mint.key(); slot_state.status = ClaimSlotStatus::Refunded; slot_state.settlement_cranker = Pubkey::default(); slot_state.cranker_vault = Pubkey::default(); slot_state.commitment_digest = commitment_digest; slot_state.settlement_commitment = refund_commitment; slot_state.payout_nullifier = refund_nullifier; slot_state.random_nonce = [0;32]; slot_state.recipient = ctx.accounts.sender_wallet.key(); slot_state.lease_id_hash = [0;32]; slot_state.lease_version = 0; slot_state.lease_expiry_ts = expires_at_ts; slot_state.authorization_expiry_ts = expires_at_ts; slot_state.reimbursed = true; slot_state.bump = ctx.bumps.claim_slot;
    ctx.accounts.settlement_dna.status = SettlementDnaStatus::Consumed;
    emit!(TsnEpochClaimRefunded { epoch_treasury: treasury.key(), claim_slot: slot_state.key(), amount: refund_amount }); Ok(())
}
