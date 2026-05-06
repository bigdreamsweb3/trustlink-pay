use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Transfer};

use crate::error::TrustLinkEscrowError;
use crate::state::{EscrowConfig, PaymentStatus, VAULT_AUTHORITY_SEED};
pub(crate) fn require_verifier(claim_verifier: &Signer, config: &Account<EscrowConfig>) -> Result<()> {
    require_keys_eq!(
        claim_verifier.key(),
        config.claim_verifier,
        TrustLinkEscrowError::InvalidClaimVerifier
    );
    Ok(())
}

pub(crate) fn require_claim_window(status: PaymentStatus, expiry_ts: i64, now: i64) -> Result<()> {
    match status {
        PaymentStatus::Locked => require!(expiry_ts >= now, TrustLinkEscrowError::PaymentExpired),
        PaymentStatus::Expired => require!(expiry_ts < now, TrustLinkEscrowError::PaymentNotExpired),
        _ => return err!(TrustLinkEscrowError::PaymentNotPending),
    }

    Ok(())
}

pub(crate) fn require_fee_config(bps: u16, max_ui_micros: u64) -> Result<()> {
    require!(bps <= 10_000, TrustLinkEscrowError::InvalidFeeConfig);
    let _ = max_ui_micros;
    Ok(())
}

pub(crate) fn ui_micros_to_base_units(ui_micros: u64, decimals: u8) -> Result<u64> {
    if decimals >= 6 {
        let multiplier = 10u128.pow((decimals - 6) as u32);
        let value = (ui_micros as u128)
            .checked_mul(multiplier)
            .ok_or(TrustLinkEscrowError::InvalidFeeConfig)?;
        u64::try_from(value).map_err(|_| TrustLinkEscrowError::InvalidFeeConfig.into())
    } else {
        Ok(ui_micros / 10u64.pow((6 - decimals) as u32))
    }
}

pub(crate) fn calculate_fee_amount(amount: u64, bps: u16, max_ui_micros: u64, decimals: u8) -> Result<u64> {
    if amount == 0 || bps == 0 {
        return Ok(0);
    }

    let raw_fee = ((amount as u128)
        .checked_mul(bps as u128)
        .ok_or(TrustLinkEscrowError::InvalidFeeConfig)?
        + 9_999)
        / 10_000;
    let max_fee = ui_micros_to_base_units(max_ui_micros, decimals)? as u128;
    let capped_fee = if max_fee > 0 { raw_fee.min(max_fee) } else { raw_fee };
    u64::try_from(capped_fee).map_err(|_| TrustLinkEscrowError::InvalidFeeConfig.into())
}

pub(crate) fn release_to_destination<'info>(
    payment_id: [u8; 32],
    amount: u64,
    fee_amount: u64,
    vault_authority_bump: u8,
    escrow_vault: AccountInfo<'info>,
    treasury_token_account: AccountInfo<'info>,
    destination_token_account: AccountInfo<'info>,
    close_destination: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
) -> Result<()> {
    let signer_bump = [vault_authority_bump];
    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, payment_id.as_ref(), &signer_bump];
    if fee_amount > 0 {
        token::transfer(
            CpiContext::new(
                token_program.clone(),
                Transfer {
                    from: escrow_vault.clone(),
                    to: treasury_token_account,
                    authority: vault_authority.clone(),
                },
            )
            .with_signer(&[signer_seeds]),
            fee_amount,
        )?;
    }
    let receiver_amount = amount
        .checked_sub(fee_amount)
        .ok_or(TrustLinkEscrowError::InvalidFeeAmount)?;
    if receiver_amount > 0 {
        token::transfer(
            CpiContext::new(
                token_program.clone(),
                Transfer {
                    from: escrow_vault.clone(),
                    to: destination_token_account,
                    authority: vault_authority.clone(),
                },
            )
            .with_signer(&[signer_seeds]),
            receiver_amount,
        )?;
    }
    token::close_account(
        CpiContext::new(
            token_program,
            CloseAccount {
                account: escrow_vault,
                destination: close_destination,
                authority: vault_authority,
            },
        )
        .with_signer(&[signer_seeds]),
    )?;
    Ok(())
}

