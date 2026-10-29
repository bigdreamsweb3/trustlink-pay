//! Groth16 contract for private TIN-head updates.
//!
//! A proof has six public inputs, in this fixed order:
//! 0. TCAP shared root before the action
//! 1. TCAP shared root after the action
//! 2. encrypted Memo commitment
//! 3. action authorization commitment
//! 4. one-time nullifier
//! 5. TIP shared route-membership root
//!
//! The circuit witness contains the hidden route membership, TIN/asset leaf,
//! predecessor sequence and memo, sparse-map paths, and the nullifier
//! non-membership path. The circuit source is in `circuits/hidden_head_v1`.
//! This verifier does not claim to validate encrypted-balance arithmetic.

use anchor_lang::prelude::*;
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use groth16_solana::{groth16::{Groth16Verifier, Groth16Verifyingkey}};
use light_poseidon::{Poseidon, PoseidonHasher};
use solana_program::{
    hash::{hash, hashv},
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::{
    HiddenHeadProofArgsV1, InitializeHiddenHeadVerifierArgsV1,
    InitializeHiddenHeadVerifierV1, VerifyHiddenHeadTransitionV1,
};

pub const GPRU_HIDDEN_HEAD_VERIFIER_SEED: &[u8] = b"gpru:hidden-head-verifier:v1";
pub const TIP_ROUTE_ROOT_SEED: &[u8] = b"tip:route-merkle-root:v1";
pub const TIP_PROGRAM_ID: Pubkey = pubkey!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
pub const TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
pub const HIDDEN_HEAD_PUBLIC_INPUTS: usize = 6;
pub const ACTION_KIND_CREDIT_V1: u8 = 1;
pub const ACTION_KIND_DEBIT_V1: u8 = 2;
pub const ACTION_KIND_EXIT_V1: u8 = 3;
const BN254_SCALAR_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

#[account]
pub struct GpruHiddenHeadVerifierV1 {
    pub version: u16,
    pub authority: Pubkey,
    pub circuit_commitment: [u8; 32],
    pub verifying_key_commitment: [u8; 32],
    pub enabled: bool,
    pub bump: u8,
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
    /// Groth16 IC points for the constant term plus six public inputs.
    pub ic: [[u8; 64]; HIDDEN_HEAD_PUBLIC_INPUTS + 1],
}

impl GpruHiddenHeadVerifierV1 {
    pub const VERSION: u16 = 1;
    pub const SPACE: usize = 8 + 2 + 32 + 32 + 32 + 1 + 1 + 64 + 128 * 3 + 64 * (HIDDEN_HEAD_PUBLIC_INPUTS + 1);
}

#[error_code]
pub enum HiddenHeadError {
    #[msg("The Groth16 verifier is not configured for the hidden-head V1 circuit")]
    VerifierUnavailable,
    #[msg("The supplied Groth16 verifying key commitment is invalid")]
    InvalidVerifyingKey,
    #[msg("The supplied circuit commitment is invalid")]
    InvalidCircuit,
    #[msg("The proof does not bind the canonical shared TCAP and TIP roots")]
    InvalidPublicInputs,
    #[msg("The supplied account is not the canonical TIP route-membership root")]
    InvalidTipRouteRoot,
    #[msg("The supplied account is not the canonical TCAP shared root")]
    InvalidTcapRoot,
    #[msg("The Groth16 proof failed verification")]
    InvalidProof,
    #[msg("The supplied authority does not control the TSN Mother Escrow")]
    InvalidAuthority,
}

pub fn circuit_commitment_v1() -> [u8; 32] {
    hashv(&[
        b"TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0",
        include_bytes!("../circuits/hidden_head_v1/main.circom"),
        b"circomlib-poseidon-bn254-v1",
    ]).to_bytes()
}

pub fn verifying_key_commitment_v1(args: &InitializeHiddenHeadVerifierArgsV1) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(64 + 128 * 3 + 64 * (HIDDEN_HEAD_PUBLIC_INPUTS + 1));
    bytes.extend_from_slice(&args.alpha_g1);
    bytes.extend_from_slice(&args.beta_g2);
    bytes.extend_from_slice(&args.gamma_g2);
    bytes.extend_from_slice(&args.delta_g2);
    for point in &args.ic {
        bytes.extend_from_slice(point);
    }
    hashv(&[b"TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0", &bytes]).to_bytes()
}

pub fn initialize_verifier(
    ctx: Context<InitializeHiddenHeadVerifierV1>,
    args: InitializeHiddenHeadVerifierArgsV1,
) -> Result<()> {
    validate_mother_authority(&ctx.accounts.mother_escrow, &ctx.accounts.authority)?;
    require!(args.circuit_commitment == circuit_commitment_v1(), HiddenHeadError::InvalidCircuit);
    require!(args.verifying_key_commitment == verifying_key_commitment_v1(&args), HiddenHeadError::InvalidVerifyingKey);
    require!(args.ic.iter().all(|point| point.iter().any(|byte| *byte != 0)), HiddenHeadError::InvalidVerifyingKey);

    let verifier = &mut ctx.accounts.verifier;
    verifier.version = GpruHiddenHeadVerifierV1::VERSION;
    verifier.authority = ctx.accounts.authority.key();
    verifier.circuit_commitment = args.circuit_commitment;
    verifier.verifying_key_commitment = args.verifying_key_commitment;
    verifier.enabled = true;
    verifier.bump = ctx.bumps.verifier;
    verifier.alpha_g1 = args.alpha_g1;
    verifier.beta_g2 = args.beta_g2;
    verifier.gamma_g2 = args.gamma_g2;
    verifier.delta_g2 = args.delta_g2;
    verifier.ic = args.ic;
    Ok(())
}

pub fn verify_transition(
    ctx: Context<VerifyHiddenHeadTransitionV1>,
    args: HiddenHeadProofArgsV1,
) -> Result<()> {
    let verifier = &ctx.accounts.verifier;
    require!(
        verifier.version == GpruHiddenHeadVerifierV1::VERSION
            && verifier.enabled
            && verifier.circuit_commitment == circuit_commitment_v1(),
        HiddenHeadError::VerifierUnavailable
    );
    require!(
        args.public_inputs.iter().all(|input| input.iter().any(|byte| *byte != 0)),
        HiddenHeadError::InvalidPublicInputs
    );
    require!(
        args.public_inputs.iter().all(|input| is_canonical_bn254_scalar(input)),
        HiddenHeadError::InvalidPublicInputs
    );
    require!(
        matches!(args.action_kind, ACTION_KIND_CREDIT_V1 | ACTION_KIND_DEBIT_V1 | ACTION_KIND_EXIT_V1),
        HiddenHeadError::InvalidPublicInputs
    );
    require!(args.token_id > 0 && args.amount > 0 && args.authorization_commitment != [0; 32], HiddenHeadError::InvalidPublicInputs);
    require!(is_canonical_bn254_scalar(&args.authorization_commitment), HiddenHeadError::InvalidPublicInputs);
    let mut action_hasher = Poseidon::<Fr>::new_circom(5)
        .map_err(|_| error!(HiddenHeadError::InvalidPublicInputs))?;
    let expected_action_commitment = action_hasher
        .hash(&[
            Fr::from(args.action_kind as u64),
            Fr::from(args.token_id as u64),
            Fr::from(args.amount),
            Fr::from_be_bytes_mod_order(&args.authorization_commitment),
            Fr::from_be_bytes_mod_order(&args.public_inputs[4]),
        ])
        .map_err(|_| error!(HiddenHeadError::InvalidPublicInputs))?;
    let expected_action_bytes = field_bytes(expected_action_commitment);
    require!(args.public_inputs[3] == expected_action_bytes, HiddenHeadError::InvalidPublicInputs);

    let memo_commitment = validate_memo_instruction(&ctx.accounts.instructions)?;
    require!(
        args.public_inputs[2] == sha256_to_bn254_scalar(memo_commitment),
        HiddenHeadError::InvalidPublicInputs
    );

    let current_tcap_root = validate_tcap_root(&ctx.accounts.tcap_commitment_root)?;
    let tip_route_root = validate_tip_route_root(&ctx.accounts.tip_route_root)?;
    require!(args.public_inputs[0] == current_tcap_root, HiddenHeadError::InvalidPublicInputs);
    require!(args.public_inputs[5] == tip_route_root, HiddenHeadError::InvalidPublicInputs);
    require!(args.public_inputs[1] != current_tcap_root, HiddenHeadError::InvalidPublicInputs);
    require!(args.public_inputs[2] != [0; 32] && args.public_inputs[3] != [0; 32] && args.public_inputs[4] != [0; 32], HiddenHeadError::InvalidPublicInputs);

    let vk = Groth16Verifyingkey {
        nr_pubinputs: HIDDEN_HEAD_PUBLIC_INPUTS,
        vk_alpha_g1: verifier.alpha_g1,
        vk_beta_g2: verifier.beta_g2,
        vk_gamme_g2: verifier.gamma_g2,
        vk_delta_g2: verifier.delta_g2,
        vk_ic: &verifier.ic,
    };
    let mut proof_verifier = Groth16Verifier::<HIDDEN_HEAD_PUBLIC_INPUTS>::new(
        &args.proof_a,
        &args.proof_b,
        &args.proof_c,
        &args.public_inputs,
        &vk,
    ).map_err(|_| error!(HiddenHeadError::InvalidProof))?;
    proof_verifier.verify().map_err(|_| error!(HiddenHeadError::InvalidProof))?;
    msg!("GPRU hidden-head Groth16 proof verified");
    Ok(())
}

fn validate_mother_authority(mother: &UncheckedAccount, authority: &Signer) -> Result<()> {
    let (expected_mother, _) = Pubkey::find_program_address(&[b"tsn_mother_escrow"], &TSN_PROGRAM_ID);
    require_keys_eq!(expected_mother, mother.key(), HiddenHeadError::InvalidAuthority);
    require_keys_eq!(*mother.owner, TSN_PROGRAM_ID, HiddenHeadError::InvalidAuthority);
    let data = mother.try_borrow_data()?;
    let discriminator = hashv(&[b"account:MotherEscrow"]).to_bytes();
    require!(data.len() >= 40 && data[..8] == discriminator[..8], HiddenHeadError::InvalidAuthority);
    require!(data[8..40] == authority.key().to_bytes(), HiddenHeadError::InvalidAuthority);
    Ok(())
}

fn validate_tcap_root(account: &UncheckedAccount) -> Result<[u8; 32]> {
    let (expected, _) = Pubkey::find_program_address(&[b"tcap:commitment-root:v1"], &TCAP_PROGRAM_ID);
    require_keys_eq!(expected, account.key(), HiddenHeadError::InvalidTcapRoot);
    require_keys_eq!(*account.owner, TCAP_PROGRAM_ID, HiddenHeadError::InvalidTcapRoot);
    let data = account.try_borrow_data()?;
    let discriminator = hashv(&[b"account:TcapCommitmentRootStateV1"]).to_bytes();
    require!(data.len() == 124 && data[..8] == discriminator[..8], HiddenHeadError::InvalidTcapRoot);
    require!(u16::from_le_bytes(data[8..10].try_into().unwrap()) == 1 && data[122] == 0, HiddenHeadError::InvalidTcapRoot);
    Ok(data[12..44].try_into().unwrap())
}

fn validate_tip_route_root(account: &UncheckedAccount) -> Result<[u8; 32]> {
    let (expected, bump) = Pubkey::find_program_address(&[TIP_ROUTE_ROOT_SEED], &TIP_PROGRAM_ID);
    require_keys_eq!(expected, account.key(), HiddenHeadError::InvalidTipRouteRoot);
    require_keys_eq!(*account.owner, TIP_PROGRAM_ID, HiddenHeadError::InvalidTipRouteRoot);
    let data = account.try_borrow_data()?;
    require!(data.len() >= 42 && data[0] == 1 && data[1] == bump, HiddenHeadError::InvalidTipRouteRoot);
    let root: [u8; 32] = data[2..34].try_into().unwrap();
    require!(root != [0; 32] && u64::from_le_bytes(data[34..42].try_into().unwrap()) > 0, HiddenHeadError::InvalidTipRouteRoot);
    require!(is_canonical_bn254_scalar(&root), HiddenHeadError::InvalidTipRouteRoot);
    Ok(root)
}

fn validate_memo_instruction(instructions: &UncheckedAccount) -> Result<[u8; 32]> {
    require_keys_eq!(
        instructions.key(),
        solana_program::sysvar::instructions::ID,
        HiddenHeadError::InvalidPublicInputs
    );
    let current = load_current_index_checked(&instructions.to_account_info())? as usize;
    let caller = load_instruction_at_checked(current, &instructions.to_account_info())?;
    require_keys_eq!(caller.program_id, TSN_PROGRAM_ID, HiddenHeadError::InvalidPublicInputs);
    let memo = load_instruction_at_checked(current.checked_add(1).ok_or(HiddenHeadError::InvalidPublicInputs)?, &instructions.to_account_info())?;
    let memo_program_id = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    require_keys_eq!(memo.program_id, memo_program_id, HiddenHeadError::InvalidPublicInputs);
    Ok(hash(&memo.data).to_bytes())
}

/// Convert an arbitrary SHA-256 digest into the canonical BN254 scalar
/// representation used by Circom and groth16-solana. The digest is at most
/// five moduli, so the bounded subtraction loop is deterministic on-chain.
fn sha256_to_bn254_scalar(mut value: [u8; 32]) -> [u8; 32] {
    while value >= BN254_SCALAR_MODULUS_BE {
        let mut borrow = 0u16;
        for index in (0..32).rev() {
            let minuend = value[index] as u16;
            let subtrahend = BN254_SCALAR_MODULUS_BE[index] as u16 + borrow;
            if minuend >= subtrahend {
                value[index] = (minuend - subtrahend) as u8;
                borrow = 0;
            } else {
                value[index] = (minuend + 256 - subtrahend) as u8;
                borrow = 1;
            }
        }
    }
    value
}

fn is_canonical_bn254_scalar(value: &[u8; 32]) -> bool {
    value < &BN254_SCALAR_MODULUS_BE
}

fn field_bytes(value: Fr) -> [u8; 32] {
    let bytes = value.into_bigint().to_bytes_be();
    let mut output = [0u8; 32];
    output[32 - bytes.len()..].copy_from_slice(&bytes);
    output
}
