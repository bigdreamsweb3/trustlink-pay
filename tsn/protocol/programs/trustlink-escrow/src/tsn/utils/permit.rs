use anchor_lang::{
    prelude::*,
    solana_program::{
        ed25519_program,
        sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
    },
};

use crate::tsn::errors::TsnError;

pub const PRIVATE_PAYOUT_DOMAIN: &[u8] = b"TSN_PRIVATE_PAYOUT_V1";
pub const PRIVATE_RECOVERY_DOMAIN: &[u8] = b"TSN_PRIVATE_RECOVERY_V1";

pub fn private_payout_message(
    program_id: &Pubkey,
    mother_escrow: &Pubkey,
    operator: &Pubkey,
    payout_nullifier: &[u8; 32],
    cranker_vault: &Pubkey,
    recipient_token_account: &Pubkey,
    token_mint: &Pubkey,
    payout_amount: u64,
    claim_fee_amount: u64,
    expires_at_ts: i64,
) -> Vec<u8> {
    [
        PRIVATE_PAYOUT_DOMAIN,
        program_id.as_ref(),
        mother_escrow.as_ref(),
        operator.as_ref(),
        payout_nullifier,
        cranker_vault.as_ref(),
        recipient_token_account.as_ref(),
        token_mint.as_ref(),
        &payout_amount.to_le_bytes(),
        &claim_fee_amount.to_le_bytes(),
        &expires_at_ts.to_le_bytes(),
    ]
    .concat()
}

pub fn private_recovery_message(
    program_id: &Pubkey,
    mother_escrow: &Pubkey,
    operator: &Pubkey,
    recovery_nullifier: &[u8; 32],
    escrow_token_account: &Pubkey,
    settlement_cranker_vault: &Pubkey,
    settlement_vault_token_account: &Pubkey,
    token_mint: &Pubkey,
    recovery_amount: u64,
    expires_at_ts: i64,
) -> Vec<u8> {
    [
        PRIVATE_RECOVERY_DOMAIN,
        program_id.as_ref(),
        mother_escrow.as_ref(),
        operator.as_ref(),
        recovery_nullifier,
        escrow_token_account.as_ref(),
        settlement_cranker_vault.as_ref(),
        settlement_vault_token_account.as_ref(),
        token_mint.as_ref(),
        &recovery_amount.to_le_bytes(),
        &expires_at_ts.to_le_bytes(),
    ]
    .concat()
}

pub fn verify_ed25519_permit(
    instructions_sysvar: &AccountInfo,
    permit_signer: &Pubkey,
    signature: &[u8; 64],
    message: &[u8],
) -> Result<()> {
    let current = load_current_index_checked(instructions_sysvar)? as usize;
    require!(current >= 1, TsnError::MissingPermitVerification);
    let instruction = load_instruction_at_checked(current - 1, instructions_sysvar)?;
    require!(
        ed25519_program::check_id(&instruction.program_id),
        TsnError::MissingPermitVerification
    );
    require!(
        instruction.accounts.is_empty(),
        TsnError::InvalidPermitVerification
    );

    let data = instruction.data;
    require!(data.len() >= 16, TsnError::InvalidPermitVerification);
    require!(data[0] == 1, TsnError::InvalidPermitVerification);

    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let signature_instruction_index = u16::from_le_bytes([data[4], data[5]]);
    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let public_key_instruction_index = u16::from_le_bytes([data[8], data[9]]);
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    let message_instruction_index = u16::from_le_bytes([data[14], data[15]]);

    require!(
        signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == u16::MAX,
        TsnError::InvalidPermitVerification
    );
    require!(
        data.len() >= signature_offset + 64
            && data.len() >= public_key_offset + 32
            && data.len() >= message_offset + message_size,
        TsnError::InvalidPermitVerification
    );
    require!(
        &data[signature_offset..signature_offset + 64] == signature,
        TsnError::InvalidPermitVerification
    );
    require!(
        data[public_key_offset..public_key_offset + 32] == permit_signer.to_bytes(),
        TsnError::InvalidPermitVerification
    );
    require!(
        &data[message_offset..message_offset + message_size] == message,
        TsnError::InvalidPermitVerification
    );
    Ok(())
}
