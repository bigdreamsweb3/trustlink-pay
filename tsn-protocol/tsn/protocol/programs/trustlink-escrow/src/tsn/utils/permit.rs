use anchor_lang::{
    prelude::*,
    solana_program::{
        ed25519_program,
        sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
    },
};

use crate::tsn::errors::TsnError;
use solana_program::hash::hashv;

pub const PRU_ROOT_AUTH_DOMAIN: &[u8] = b"TSN_PRU_ROOT_AUTH_V1";
pub const PRU_CHILD_AUTH_DOMAIN: &[u8] = b"TSN_PRU_CHILD_AUTH_V1";
pub const PRIVATE_SLOT_SETTLEMENT_DOMAIN: &[u8] = b"TSN_PRIVATE_SLOT_SETTLEMENT_V1";
pub const PRIVATE_SLOT_REFUND_DOMAIN: &[u8] = b"TSN_PRIVATE_SLOT_REFUND_V1";

pub fn slot_settlement_message(
    program_id: &Pubkey, mother: &Pubkey, operator: &Pubkey, epoch_treasury: &Pubkey,
    epoch_ledger: &Pubkey, claim_slot: &Pubkey, slot: &[u8; 32], settlement_commitment: &[u8; 32],
    commitment_digest: &[u8; 32], random_nonce: &[u8; 32], nullifier: &[u8; 32], vault: &Pubkey,
    recipient: &Pubkey, mint: &Pubkey, amount: u64, fee: u64, lease_id: &[u8; 32], lease_version: u64,
    lease_expiry: i64, expires: i64,
) -> Vec<u8> {
    [PRIVATE_SLOT_SETTLEMENT_DOMAIN, program_id.as_ref(), mother.as_ref(), operator.as_ref(), epoch_treasury.as_ref(), epoch_ledger.as_ref(), claim_slot.as_ref(), slot, settlement_commitment, commitment_digest, random_nonce, nullifier, vault.as_ref(), recipient.as_ref(), mint.as_ref(), &amount.to_le_bytes(), &fee.to_le_bytes(), lease_id, &lease_version.to_le_bytes(), &lease_expiry.to_le_bytes(), &expires.to_le_bytes()].concat()
}

pub fn slot_refund_message(
    program_id: &Pubkey, mother: &Pubkey, operator: &Pubkey, epoch_treasury: &Pubkey,
    epoch_ledger: &Pubkey, claim_slot: &Pubkey, slot: &[u8; 32], lease_version: u64,
    commitment_digest: &[u8; 32], sender: &Pubkey, mint: &Pubkey, amount: u64,
    nullifier: &[u8; 32], expires: i64,
) -> Vec<u8> {
    [PRIVATE_SLOT_REFUND_DOMAIN, program_id.as_ref(), mother.as_ref(), operator.as_ref(), epoch_treasury.as_ref(), epoch_ledger.as_ref(), claim_slot.as_ref(), slot, &lease_version.to_le_bytes(), commitment_digest, sender.as_ref(), mint.as_ref(), &amount.to_le_bytes(), nullifier, &expires.to_le_bytes()].concat()
}


pub fn pru_root_authorization_message(
    program_id: &Pubkey,
    main_wallet: &Pubkey,
    tin: u64,
    pru_index: u16,
    nonce: u8,
    commitment_hash: &[u8; 32],
    amount: u64,
    sender_fee_amount: u64,
) -> Vec<u8> {
    [
        PRU_ROOT_AUTH_DOMAIN,
        program_id.as_ref(),
        main_wallet.as_ref(),
        &tin.to_le_bytes(),
        &pru_index.to_le_bytes(),
        &[nonce],
        commitment_hash,
        &amount.to_le_bytes(),
        &sender_fee_amount.to_le_bytes(),
    ]
    .concat()
}

pub fn pru_child_authorization_message(
    program_id: &Pubkey,
    pru_authority: &Pubkey,
    tin: u64,
    pru_index: u16,
    nonce: u8,
    commitment_hash: &[u8; 32],
    amount: u64,
    sender_fee_amount: u64,
) -> Vec<u8> {
    [
        PRU_CHILD_AUTH_DOMAIN,
        program_id.as_ref(),
        pru_authority.as_ref(),
        &tin.to_le_bytes(),
        &pru_index.to_le_bytes(),
        &[nonce],
        commitment_hash,
        &amount.to_le_bytes(),
        &sender_fee_amount.to_le_bytes(),
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
    verify_ed25519_permit_at(
        instructions_sysvar,
        current - 1,
        permit_signer,
        signature,
        message,
    )
}

pub fn verify_ed25519_permit_at(
    instructions_sysvar: &AccountInfo,
    index: usize,
    permit_signer: &Pubkey,
    signature: &[u8; 64],
    message: &[u8],
) -> Result<()> {
    let instruction = load_instruction_at_checked(index, instructions_sysvar)?;
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

/// Verify a canonical Ed25519 instruction without trusting signature bytes
/// supplied as instruction arguments. The Ed25519 program has already
/// performed cryptographic verification; this helper binds its message and
/// public key to the action being executed.
pub fn verify_ed25519_message_at(
    instructions_sysvar: &AccountInfo,
    index: usize,
    permit_signer: &Pubkey,
    message: &[u8],
) -> Result<()> {
    let instruction = load_instruction_at_checked(index, instructions_sysvar)?;
    require!(
        ed25519_program::check_id(&instruction.program_id),
        TsnError::MissingPermitVerification
    );
    require!(
        instruction.accounts.is_empty(),
        TsnError::InvalidPermitVerification
    );
    let data = instruction.data;
    require!(
        data.len() >= 16 && data[0] == 1,
        TsnError::InvalidPermitVerification
    );
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
        data[public_key_offset..public_key_offset + 32] == permit_signer.to_bytes(),
        TsnError::InvalidPermitVerification
    );
    require!(
        &data[message_offset..message_offset + message_size] == message,
        TsnError::InvalidPermitVerification
    );
    Ok(())
}
