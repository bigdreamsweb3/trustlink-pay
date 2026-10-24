//! Anchor instruction types and verification helper for GPRU V1.

use anchor_lang::prelude::*;
use solana_program::hash::hashv;

use crate::stealth_keys::{verify_node_dna_key_proof_v1, DnaKeyDerivationProofV1};

const TIP_PROGRAM_ID: Pubkey = pubkey!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
const TIN_V1_SEED: &[u8] = b"tin-v1";
const TIN_V1_ACCOUNT_VERSION: u8 = 1;
const ACTIVE_TIN_STATUS: u8 = 1;
const TIP_ROUTE_VERSION_V1: u8 = 1;
const GPRU_ELGAMAL_KEY_VERSION_V1: u8 = 1;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct DnaKeyProofV1 {
    pub shared_point: [u8; 32],
    pub generator_commitment: [u8; 32],
    pub scan_commitment: [u8; 32],
    pub response: [u8; 32],
}

#[error_code]
pub enum GpruProgramError {
    #[msg("The GPRU DNA key derivation proof is invalid")]
    InvalidDnaKeyProof,
    #[msg("The supplied account is not an active, canonical TIP registry account")]
    InvalidTipRegistry,
    #[msg("The TIP registry GPRU scan key commitment is invalid")]
    InvalidTipGpruKey,
}

struct TinDataCursor<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> TinDataCursor<'a> {
    fn take(&mut self, len: usize) -> Result<&'a [u8]> {
        let end = self
            .offset
            .checked_add(len)
            .ok_or(GpruProgramError::InvalidTipRegistry)?;
        let value = self
            .data
            .get(self.offset..end)
            .ok_or(GpruProgramError::InvalidTipRegistry)?;
        self.offset = end;
        Ok(value)
    }

    fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(
            self.take(4)?
                .try_into()
                .map_err(|_| GpruProgramError::InvalidTipRegistry)?,
        ))
    }

    fn skip_vec(&mut self) -> Result<()> {
        let len = self.u32()? as usize;
        self.take(len)?;
        Ok(())
    }
}

/// Read and authenticate the stable GPRU scan key directly from TIP state.
/// The caller cannot substitute an arbitrary scan key for the route registered
/// in the account, and a differently encoded account cannot pass as TIN V1.
fn validate_tip_registry(tip_registry: &UncheckedAccount) -> Result<[u8; 32]> {
    require_keys_eq!(
        *tip_registry.owner,
        TIP_PROGRAM_ID,
        GpruProgramError::InvalidTipRegistry
    );

    let account_data = tip_registry.try_borrow_data()?;
    let mut cursor = TinDataCursor {
        data: &account_data,
        offset: 0,
    };
    let account_version = cursor.u8()?;
    let bump = cursor.u8()?;
    let status = cursor.u8()?;
    let reserved = cursor.take(5)?;
    let lookup_commitment: [u8; 32] = cursor
        .take(32)?
        .try_into()
        .map_err(|_| GpruProgramError::InvalidTipRegistry)?;
    cursor.take(32)?; // owner commitment
    cursor.skip_vec()?; // encrypted identity envelope
    cursor.skip_vec()?; // encrypted master-seed envelope
    cursor.take(8)?; // creation timestamp
    cursor.take(32)?; // encrypted metadata hash
    let route_version = u64::from_le_bytes(
        cursor
            .take(8)?
            .try_into()
            .map_err(|_| GpruProgramError::InvalidTipRegistry)?,
    );
    cursor.take(32)?; // route nonce
    let tip_route_version = cursor.u8()?;
    let key_version = cursor.u8()?;
    let scan_public_key: [u8; 32] = cursor
        .take(32)?
        .try_into()
        .map_err(|_| GpruProgramError::InvalidTipRegistry)?;
    let key_commitment: [u8; 32] = cursor
        .take(32)?
        .try_into()
        .map_err(|_| GpruProgramError::InvalidTipRegistry)?;
    let policy_commitment = cursor.take(32)?;

    let (expected_registry, expected_bump) =
        Pubkey::find_program_address(&[TIN_V1_SEED, &lookup_commitment], &TIP_PROGRAM_ID);
    require!(
        account_version == TIN_V1_ACCOUNT_VERSION
            && status == ACTIVE_TIN_STATUS
            && reserved == [0; 5]
            && lookup_commitment != [0; 32]
            && route_version != 0
            && tip_route_version == TIP_ROUTE_VERSION_V1
            && cursor.offset == account_data.len()
            && expected_bump == bump
            && expected_registry == tip_registry.key(),
        GpruProgramError::InvalidTipRegistry,
    );

    let expected_commitment = hashv(&[
        b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0",
        &[key_version],
        &scan_public_key,
    ])
    .to_bytes();
    require!(
        key_version == GPRU_ELGAMAL_KEY_VERSION_V1
            && scan_public_key != [0; 32]
            && key_commitment != [0; 32]
            && key_commitment == expected_commitment
            && policy_commitment != [0; 32],
        GpruProgramError::InvalidTipGpruKey,
    );

    Ok(scan_public_key)
}

pub fn verify_dna_key_proof_v1(
    tip_registry: &UncheckedAccount,
    dna: [u8; 32],
    ephemeral_public_key: [u8; 32],
    one_time_public_key: [u8; 32],
    proof: DnaKeyProofV1,
) -> Result<()> {
    let scan_public_key = validate_tip_registry(tip_registry)?;
    let proof = DnaKeyDerivationProofV1 {
        shared_point: proof.shared_point,
        generator_commitment: proof.generator_commitment,
        scan_commitment: proof.scan_commitment,
        response: proof.response,
    };

    verify_node_dna_key_proof_v1(
        &scan_public_key,
        &dna,
        &ephemeral_public_key,
        &one_time_public_key,
        &proof,
    )
    .map_err(|_| error!(GpruProgramError::InvalidDnaKeyProof))?;

    msg!("GPRU DNA ElGamal derivation proof verified");
    Ok(())
}
