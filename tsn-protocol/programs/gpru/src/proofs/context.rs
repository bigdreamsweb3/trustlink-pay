use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};
use solana_zk_token_sdk::{
    instruction::{
        ciphertext_commitment_equality::CiphertextCommitmentEqualityProofContext,
        range_proof::RangeProofContext,
        ProofType,
    },
    zk_token_elgamal::pod::ElGamalCiphertext,
    zk_token_proof_program,
    zk_token_proof_state::ProofContextState,
};

/// Public fields the GPRU transition must match against the encrypted
/// successor and the owner-derived encryption key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SuccessorCiphertextBinding {
    pub encryption_pubkey: [u8; 32],
    pub ciphertext: [u8; 64],
    pub pedersen_commitment: [u8; 32],
}

/// Check that Solana's native proof program produced both contexts for the
/// same successor value. The equality proof binds the expected ElGamal key and
/// ciphertext to a Pedersen commitment; the range proof establishes that this
/// commitment is an unsigned 64-bit value.
///
/// This does not prove that the successor is the result of applying a debit or
/// credit to a particular predecessor. That relation must be verified by the
/// GPRU transition implementation before it updates the latest balance state.
pub fn validate_successor_ciphertext_proofs(
    equality_context_account: &AccountInfo<'_>,
    range_context_account: &AccountInfo<'_>,
    expected_context_authority: &Pubkey,
    expected: &SuccessorCiphertextBinding,
) -> Result<(), ProgramError> {
    validate_context_account_owner(equality_context_account)?;
    validate_context_account_owner(range_context_account)?;

    let equality_data = equality_context_account.try_borrow_data()?;
    let equality = ProofContextState::<CiphertextCommitmentEqualityProofContext>::try_from_bytes(
        &equality_data,
    )
    .map_err(|_| ProgramError::InvalidAccountData)?;
    if equality.context_state_authority != *expected_context_authority
        || equality.proof_type
            != ProofType::CiphertextCommitmentEquality.into()
        || equality.proof_context.pubkey.0 != expected.encryption_pubkey
        || equality.proof_context.ciphertext.0 != expected.ciphertext
        || equality.proof_context.commitment.0 != expected.pedersen_commitment
    {
        return Err(ProgramError::InvalidAccountData);
    }

    let range_data = range_context_account.try_borrow_data()?;
    let range = ProofContextState::<RangeProofContext>::try_from_bytes(&range_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    if range.context_state_authority != *expected_context_authority
        || range.proof_type != ProofType::RangeProofU64.into()
        || range.proof_context.commitment.0 != expected.pedersen_commitment
    {
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(())
}

fn validate_context_account_owner(account: &AccountInfo<'_>) -> Result<(), ProgramError> {
    if account.owner != &zk_token_proof_program::id() {
        return Err(ProgramError::IllegalOwner);
    }
    Ok(())
}

/// Validate a serialized ElGamal ciphertext before using it as a GPRU state
/// binding. This is only a fixed-width format check; callers must also invoke
/// `validate_successor_ciphertext_proofs` with the same ciphertext bytes.
pub fn ciphertext_from_bytes(bytes: &[u8]) -> Result<ElGamalCiphertext, ProgramError> {
    let raw: [u8; 64] = bytes
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(ElGamalCiphertext(raw))
}
