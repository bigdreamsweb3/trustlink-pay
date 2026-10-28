//! Anchor instruction types and verification helper for GPRU V1.

use anchor_lang::prelude::*;
use solana_program::hash::hashv;

use crate::stealth_keys::{verify_node_dna_key_proof_v1, DnaKeyDerivationProofV1};
use crate::{balance, ApplyCreditTransitionArgsV1, ApplyCreditTransitionV1};

const TIP_PROGRAM_ID: Pubkey = pubkey!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
const TCAP_PROGRAM_ID: Pubkey = pubkey!("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TIN_V1_SEED: &[u8] = b"tin-v1";
const TIN_V1_ACCOUNT_VERSION: u8 = 1;
const ACTIVE_TIN_STATUS: u8 = 1;
const TIP_ROUTE_VERSION_V1: u8 = 1;
const GPRU_ELGAMAL_KEY_VERSION_V1: u8 = 1;
const TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");

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
    #[msg("The balance transition is not authorized by the TSN settlement instruction")]
    InvalidTsnCaller,
    #[msg("The encrypted balance predecessor or sequence is invalid")]
    InvalidBalancePredecessor,
    #[msg("The encrypted balance transition is invalid")]
    InvalidBalanceTransition,
    #[msg("The first encrypted balance is not a valid encryption of the authorized amount")]
    InvalidInitialBalanceProof,
}

struct TipRouteV1 {
    scan_public_key: [u8; 32],
    key_commitment: [u8; 32],
    policy_commitment: [u8; 32],
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
fn validate_tip_registry(tip_registry: &UncheckedAccount) -> Result<TipRouteV1> {
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
    let policy_commitment: [u8; 32] = cursor
        .take(32)?
        .try_into()
        .map_err(|_| GpruProgramError::InvalidTipRegistry)?;

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

    Ok(TipRouteV1 {
        scan_public_key,
        key_commitment,
        policy_commitment,
    })
}

pub fn verify_dna_key_proof_v1(
    tip_registry: &UncheckedAccount,
    dna: [u8; 32],
    ephemeral_public_key: [u8; 32],
    one_time_public_key: [u8; 32],
    proof: DnaKeyProofV1,
) -> Result<()> {
    let scan_public_key = validate_tip_registry(tip_registry)?.scan_public_key;
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

pub fn apply_credit_transition_v1(
    ctx: Context<ApplyCreditTransitionV1>,
    args: ApplyCreditTransitionArgsV1,
) -> Result<()> {
    require_keys_eq!(
        *ctx.accounts.instructions.key,
        solana_program::sysvar::instructions::ID,
        GpruProgramError::InvalidTsnCaller,
    );
    let current_index = solana_program::sysvar::instructions::load_current_index_checked(
        &ctx.accounts.instructions.to_account_info(),
    )?;
    let top_level = solana_program::sysvar::instructions::load_instruction_at_checked(
        current_index as usize,
        &ctx.accounts.instructions.to_account_info(),
    )?;
    require_keys_eq!(
        top_level.program_id,
        TSN_PROGRAM_ID,
        GpruProgramError::InvalidTsnCaller
    );
    require!(
        args.amount > 0 && args.token_id > 0 && args.sequence > 0,
        GpruProgramError::InvalidBalanceTransition
    );
    require!(
        args.policy_commitment != [0; 32]
            && args.previous_commitment != [0; 32]
            && args.new_commitment != [0; 32]
            && args.nullifier != [0; 32]
            && args.authorization_digest != [0; 32],
        GpruProgramError::InvalidBalanceTransition
    );

    let route = validate_tip_registry(&ctx.accounts.tip_registry)?;
    require!(
        args.policy_commitment == route.policy_commitment,
        GpruProgramError::InvalidTipGpruKey
    );
    require_keys_eq!(*ctx.accounts.tcap_tip.owner, TCAP_PROGRAM_ID, GpruProgramError::InvalidBalancePredecessor);
    let tip_data = ctx.accounts.tcap_tip.try_borrow_data()?;
    let expected_tip_discriminator = hashv(&[b"account:TCapTinTipV1"]).to_bytes();
    require!(tip_data.len() == 116 && tip_data[..8] == expected_tip_discriminator[..8], GpruProgramError::InvalidBalancePredecessor);
    let tip = &tip_data[8..];
    let version = u16::from_le_bytes(tip[0..2].try_into().map_err(|_| GpruProgramError::InvalidBalancePredecessor)?);
    let current_commitment: [u8; 32] = tip[2..34].try_into().map_err(|_| GpruProgramError::InvalidBalancePredecessor)?;
    let current_sequence = u64::from_le_bytes(tip[34..42].try_into().map_err(|_| GpruProgramError::InvalidBalancePredecessor)?);
    let current_policy: [u8; 32] = tip[42..74].try_into().map_err(|_| GpruProgramError::InvalidBalancePredecessor)?;
    let current_nullifier: [u8; 32] = tip[74..106].try_into().map_err(|_| GpruProgramError::InvalidBalancePredecessor)?;
    let frozen = tip[106] != 0;
    require!(version == 1 && !frozen && current_policy == args.policy_commitment && current_policy == route.policy_commitment, GpruProgramError::InvalidBalancePredecessor);
    let is_first = current_sequence == 0;
    let next_ciphertext = if is_first {
        require!(
            args.sequence == 1 && args.previous_commitment == route.key_commitment
                && current_commitment == route.key_commitment
                && args.previous_balance_ciphertext == [0; 64],
            GpruProgramError::InvalidBalancePredecessor
        );
        balance::verify_initial_balance_v1(
            &route.scan_public_key,
            args.amount,
            &args.balance_ciphertext,
            &balance::InitialBalanceProofV1 {
                generator_commitment: args.initial_proof.generator_commitment,
                key_commitment: args.initial_proof.key_commitment,
                response: args.initial_proof.response,
            },
        )
        .map_err(|_| error!(GpruProgramError::InvalidInitialBalanceProof))?;
        require!(args.initial_ciphertext == args.balance_ciphertext, GpruProgramError::InvalidBalanceTransition);
        args.balance_ciphertext
    } else {
        require!(
            args.sequence == current_sequence.checked_add(1).ok_or(GpruProgramError::InvalidBalanceTransition)?
                && args.previous_commitment == current_commitment
                && args.nullifier != current_nullifier,
            GpruProgramError::InvalidBalancePredecessor
        );
        let expected_predecessor = hashv(&[
            b"TSN_GPRU_ELGAMAL_BALANCE_HEAD_V1\0",
            &route.key_commitment,
            &args.token_id.to_le_bytes(),
            &args.previous_balance_ciphertext,
            &current_sequence.to_le_bytes(),
            &args.policy_commitment,
        ]).to_bytes();
        require!(expected_predecessor == args.previous_commitment, GpruProgramError::InvalidBalancePredecessor);
        require!(
            args.initial_ciphertext == [0; 64]
                && args.initial_proof.generator_commitment == [0; 32]
                && args.initial_proof.key_commitment == [0; 32]
                && args.initial_proof.response == [0; 32],
            GpruProgramError::InvalidBalanceTransition
        );
        let expected = balance::add_credit_v1(&args.previous_balance_ciphertext, args.amount)
            .map_err(|_| error!(GpruProgramError::InvalidBalanceTransition))?;
        require!(args.balance_ciphertext == expected, GpruProgramError::InvalidBalanceTransition);
        expected
    };
    let commitment = hashv(&[
        b"TSN_GPRU_ELGAMAL_BALANCE_HEAD_V1\0",
        &route.key_commitment,
        &args.token_id.to_le_bytes(),
        &next_ciphertext,
        &args.sequence.to_le_bytes(),
        &args.policy_commitment,
    ]).to_bytes();
    require!(
        commitment == args.new_commitment,
        GpruProgramError::InvalidBalanceTransition
    );
    msg!(
        "GPRU validated TCAP encrypted credit successor; sequence={}",
        args.sequence
    );
    Ok(())
}
