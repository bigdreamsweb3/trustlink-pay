use solana_program::{hash::hashv, program_error::ProgramError};

/// Latest accepted encrypted balance for one GPRU asset scope.
///
/// This value contains no plaintext balance, TIN, TIP address, or wallet
/// identity. It is a wire/state model only; a GPRU program must own and update
/// it after checking proof contexts and the predecessor-to-successor
/// arithmetic relation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EncryptedBalanceStateV1 {
    pub token_id: u32,
    pub encryption_pubkey: [u8; 32],
    pub ciphertext: [u8; 64],
    pub pedersen_commitment: [u8; 32],
    pub sequence: u64,
    pub policy_commitment: [u8; 32],
    pub last_nullifier: [u8; 32],
    pub last_transition_digest: [u8; 32],
}

impl EncryptedBalanceStateV1 {
    pub fn digest(&self) -> [u8; 32] {
        hashv(&[
            b"TSN_GPRU_ENCRYPTED_BALANCE_STATE_V1",
            &self.token_id.to_le_bytes(),
            &self.encryption_pubkey,
            &self.ciphertext,
            &self.pedersen_commitment,
            &self.sequence.to_le_bytes(),
            &self.policy_commitment,
            &self.last_nullifier,
            &self.last_transition_digest,
        ])
        .to_bytes()
    }
}

/// Fields a successor transition must bind to the currently accepted state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SuccessorStateBindingV1 {
    pub previous_state_digest: [u8; 32],
    pub token_id: u32,
    pub encryption_pubkey: [u8; 32],
    pub ciphertext: [u8; 64],
    pub pedersen_commitment: [u8; 32],
    pub sequence: u64,
    pub policy_commitment: [u8; 32],
    pub nullifier: [u8; 32],
}

/// Validate state continuity before proof verification and state mutation.
/// This does not establish the arithmetic relation between ciphertexts; the
/// caller must separately verify the debit/credit relation before accepting.
pub fn validate_state_continuity(
    current: &EncryptedBalanceStateV1,
    successor: &SuccessorStateBindingV1,
) -> Result<(), ProgramError> {
    if successor.previous_state_digest != current.digest()
        || successor.sequence
            != current
                .sequence
                .checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?
        || successor.token_id != current.token_id
        || successor.encryption_pubkey != current.encryption_pubkey
        || successor.policy_commitment != current.policy_commitment
        || successor.nullifier == [0; 32]
        || successor.nullifier == current.last_nullifier
        || successor.ciphertext == [0; 64]
        || successor.pedersen_commitment == [0; 32]
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}
