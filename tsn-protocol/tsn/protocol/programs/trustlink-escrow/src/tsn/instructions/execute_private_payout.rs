use anchor_lang::{prelude::*, solana_program::{hash::hashv, program_pack::Pack, sysvar}, system_program::{self, Transfer as SystemTransfer}};
use anchor_spl::{associated_token::{self, get_associated_token_address, AssociatedToken}, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::tsn::{constants::{TSN_CRANKER_VAULT_AUTHORITY_SEED, TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS, TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, TSN_PRIVATE_SETTLEMENT_DNA_SEED, TSN_VERIFIER_SEED}, errors::TsnError, events::TsnPrivatePayoutExecuted, state::{Cranker, CrankerVault, MotherEscrow, PrivateSettlementConfig, PrivateSettlementDna}, utils::{compute_cranker_dna, private_payout_message, verify_ed25519_permit}};

#[derive(Accounts)]
#[instruction(payment_id_hash: [u8; 32], commitment_digest: [u8; 32])]
pub struct ExecutePrivatePayout<'info> {
    #[account(mut)] pub operator: Signer<'info>,
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    #[account(mut, has_one = mother_escrow, constraint = cranker.operator == operator.key())] pub cranker: Box<Account<'info, Cranker>>,
    #[account(seeds = [TSN_PRIVATE_SETTLEMENT_CONFIG_SEED, mother_escrow.key().as_ref()], bump = private_settlement_config.bump, has_one = mother_escrow)] pub private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>,
    /// Opaque payment voucher. It is not linked to an intent or escrow token account.
    #[account(init_if_needed, payer = operator, space = PrivateSettlementDna::SPACE, seeds = [TSN_PRIVATE_SETTLEMENT_DNA_SEED, payment_id_hash.as_ref(), commitment_digest.as_ref()], bump)] pub settlement_dna: Box<Account<'info, PrivateSettlementDna>>,
    #[account(mut, has_one = mother_escrow, constraint = cranker_vault.cranker == cranker.key(), constraint = cranker_vault.vault_token_account == vault_token_account.key())] pub cranker_vault: Box<Account<'info, CrankerVault>>,
    /// CHECK: PDA authority for the CrankerVault token account.
    #[account(seeds = [TSN_CRANKER_VAULT_AUTHORITY_SEED, cranker_vault.key().as_ref()], bump = cranker_vault.vault_authority_bump)] pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token_account.mint == cranker_vault.token_mint, constraint = vault_token_account.owner == vault_authority.key() @ TsnError::InvalidCrankerVaultAuthority)] pub vault_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Recipient wallet is bound by the Node permit and DNA.
    pub recipient_wallet: UncheckedAccount<'info>,
    #[account(constraint = token_mint.key() == cranker_vault.token_mint)] pub token_mint: Box<Account<'info, Mint>>,
    /// CHECK: Canonical ATA, created by the verifier PDA when missing.
    #[account(mut)] pub recipient_token_account: UncheckedAccount<'info>,
    #[account(address = sysvar::instructions::ID)] pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut, seeds = [TSN_VERIFIER_SEED], bump)] pub verifier_pda: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

fn compute_settlement_commitment(dna: &Pubkey, payment: &[u8; 32], digest: &[u8; 32], nonce: &[u8; 32], vault: &Pubkey, recipient: &Pubkey, mint: &Pubkey, amount: u64, nullifier: &[u8; 32], lease: &[u8; 32], version: u64, lease_expiry: i64, expires: i64) -> [u8; 32] {
    hashv(&[b"TSN_SETTLEMENT_COMMITMENT_V1", dna.as_ref(), payment, digest, nonce, vault.as_ref(), recipient.as_ref(), mint.as_ref(), &amount.to_le_bytes(), nullifier, lease, &version.to_le_bytes(), &lease_expiry.to_le_bytes(), &expires.to_le_bytes()]).to_bytes()
}

pub fn execute_private_payout(ctx: Context<ExecutePrivatePayout>, payment_id_hash: [u8; 32], commitment_digest: [u8; 32], settlement_commitment: [u8; 32], random_nonce: [u8; 32], payout_nullifier: [u8; 32], payout_sequence: u64, payout_amount: u64, claim_fee_amount: u64, lease_id_hash: [u8; 32], lease_version: u64, lease_expiry_ts: i64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()> {
    require!(ctx.accounts.private_settlement_config.enabled, TsnError::PrivateSettlementDisabled);
    let now = Clock::get()?.unix_timestamp;
    require!(now <= expires_at_ts && expires_at_ts <= lease_expiry_ts, TsnError::PermitExpired);
    require!(payout_amount > 0 && commitment_digest != [0; 32], TsnError::InvalidPrivateCommitment);
    require!(ctx.accounts.cranker.claim_credits > 0, TsnError::InsufficientCrankerClaimCredits);
    require!(ctx.accounts.vault_token_account.amount >= payout_amount, TsnError::InsufficientCrankerVaultLiquidity);
    require_keys_eq!(ctx.accounts.recipient_token_account.key(), get_associated_token_address(&ctx.accounts.recipient_wallet.key(), &ctx.accounts.token_mint.key()), TsnError::InvalidRecoveryDestination);
    let expected_dna = compute_cranker_dna(&ctx.accounts.mother_escrow.key(), &ctx.accounts.operator.key(), &ctx.accounts.mother_escrow.protocol_seed);
    require!(ctx.accounts.cranker.dna_hash == expected_dna, TsnError::CrankerDnaMismatch);
    let dna = &mut ctx.accounts.settlement_dna;
    if dna.consumed { return err!(TsnError::OneTimeDecryptionTokenAlreadyUsed); }
    if dna.authorized_cranker != Pubkey::default() {
        require!(now > dna.lease_expiry_ts, TsnError::LeaseStillActive);
        require!(dna.payment_id_hash == payment_id_hash && dna.commitment_digest == commitment_digest, TsnError::InvalidPrivateCommitment);
    }
    dna.mother_escrow = ctx.accounts.mother_escrow.key(); dna.payment_id_hash = payment_id_hash; dna.commitment_digest = commitment_digest; dna.settlement_commitment = settlement_commitment; dna.authorized_cranker = ctx.accounts.cranker.key(); dna.cranker_vault = ctx.accounts.cranker_vault.key(); dna.token_mint = ctx.accounts.token_mint.key(); dna.recipient_wallet = ctx.accounts.recipient_wallet.key(); dna.amount = payout_amount; dna.claim_fee_amount = claim_fee_amount; dna.lease_id_hash = lease_id_hash; dna.lease_version = lease_version; dna.lease_expiry_ts = lease_expiry_ts; dna.expires_at_ts = expires_at_ts; dna.random_nonce = random_nonce; dna.payout_nullifier = payout_nullifier; dna.bump = ctx.bumps.settlement_dna;
    let expected_commitment = compute_settlement_commitment(&dna.key(), &payment_id_hash, &commitment_digest, &random_nonce, &ctx.accounts.cranker_vault.key(), &ctx.accounts.recipient_wallet.key(), &ctx.accounts.token_mint.key(), payout_amount, &payout_nullifier, &lease_id_hash, lease_version, lease_expiry_ts, expires_at_ts);
    require!(expected_commitment == settlement_commitment, TsnError::InvalidPrivateCommitment);
    let message = private_payout_message(ctx.program_id, &ctx.accounts.mother_escrow.key(), &ctx.accounts.operator.key(), &dna.key(), &payout_nullifier, payout_sequence, &payment_id_hash, &commitment_digest, &random_nonce, &settlement_commitment, &ctx.accounts.cranker_vault.key(), &ctx.accounts.recipient_wallet.key(), &ctx.accounts.token_mint.key(), payout_amount, claim_fee_amount, &lease_id_hash, lease_version, lease_expiry_ts, expires_at_ts);
    verify_ed25519_permit(&ctx.accounts.instructions_sysvar.to_account_info(), &ctx.accounts.private_settlement_config.permit_signer, &permit_signature, &message)?;
    let verifier_bump = ctx.bumps.verifier_pda; let verifier_signer: &[&[&[u8]]] = &[&[TSN_VERIFIER_SEED, &[verifier_bump]]];
    if ctx.accounts.recipient_token_account.lamports() == 0 {
        let rent = Rent::get()?.minimum_balance(anchor_spl::token::spl_token::state::Account::LEN).checked_add(TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS).ok_or(TsnError::FeeSplitOverflow)?;
        require!(ctx.accounts.verifier_pda.lamports() >= rent, TsnError::InsufficientVerifierLamports);
        associated_token::create(CpiContext::new_with_signer(ctx.accounts.associated_token_program.to_account_info(), associated_token::Create { payer: ctx.accounts.verifier_pda.to_account_info(), associated_token: ctx.accounts.recipient_token_account.to_account_info(), authority: ctx.accounts.recipient_wallet.to_account_info(), mint: ctx.accounts.token_mint.to_account_info(), system_program: ctx.accounts.system_program.to_account_info(), token_program: ctx.accounts.token_program.to_account_info() }, verifier_signer))?;
    }
    let vault_key = ctx.accounts.cranker_vault.key(); let vault_signer: &[&[&[u8]]] = &[&[TSN_CRANKER_VAULT_AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.cranker_vault.vault_authority_bump]]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.vault_token_account.to_account_info(), to: ctx.accounts.recipient_token_account.to_account_info(), authority: ctx.accounts.vault_authority.to_account_info() }, vault_signer), payout_amount)?;
    ctx.accounts.cranker_vault.total_liquidity = ctx.accounts.cranker_vault.total_liquidity.checked_sub(payout_amount).ok_or(TsnError::InsufficientCrankerVaultLiquidity)?;
    ctx.accounts.cranker_vault.total_rewards_accrued = ctx.accounts.cranker_vault.total_rewards_accrued.checked_add(claim_fee_amount).ok_or(TsnError::FeeSplitOverflow)?;
    ctx.accounts.cranker.claim_credits = ctx.accounts.cranker.claim_credits.saturating_sub(1); ctx.accounts.cranker.total_claims = ctx.accounts.cranker.total_claims.saturating_add(1); ctx.accounts.cranker.total_executes = ctx.accounts.cranker.total_executes.saturating_add(1); ctx.accounts.cranker.last_active_ts = now;
    dna.consumed = true; dna.settlement_cranker = ctx.accounts.cranker.key(); dna.consumed_at_ts = now; dna.reimbursement_amount = payout_amount; dna.reimbursed = false;
    require!(ctx.accounts.verifier_pda.lamports() >= TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS, TsnError::InsufficientVerifierLamports);
    system_program::transfer(CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(), SystemTransfer { from: ctx.accounts.verifier_pda.to_account_info(), to: ctx.accounts.operator.to_account_info() }, verifier_signer), TSN_PRIVATE_ACTION_GAS_REIMBURSEMENT_LAMPORTS)?;
    emit!(TsnPrivatePayoutExecuted { settlement_dna: dna.key(), settlement_commitment, cranker_vault: ctx.accounts.cranker_vault.key(), payout_nullifier, payout_sequence, cranker: ctx.accounts.cranker.key(), token_mint: ctx.accounts.token_mint.key(), payout_amount }); Ok(())
}
