//! Groth16 contract for private TIN-head updates.
//!
//! A proof has twelve public inputs, in this fixed order:
//! 0. TCAP shared root before the action
//! 1. TCAP shared root after the action
//! 2. encrypted Memo commitment
//! 3. action authorization commitment
//! 4. one-time nullifier
//! 5. TIP shared route-membership root
//! 6. successor root of the hidden per-TIN token portfolio
//! 7. successor Pedersen balance point X coordinate for the selected token
//! 8. successor Pedersen balance point Y coordinate for the selected token
//! 9. one-time encrypted blinding delta
//! 10. one-time delta-encryption ephemeral point X coordinate
//! 11. one-time delta-encryption ephemeral point Y coordinate
//!
//! The circuit witness contains the hidden route membership, TIN/asset leaf,
//! predecessor sequence and memo, sparse-map paths, and the nullifier
//! non-membership path. The circuit source is in `circuits/hidden_head_v1`.
//! The circuit verifies Pedersen commitment arithmetic; it does not treat
//! those commitments as ciphertexts. The circuit proves the Memo's one-time
//! BabyJubjub ciphertext encrypts the exact private Pedersen blinding delta;
//! the owner recovers that delta using the TIP-registered scan secret.

use anchor_lang::prelude::*;
use groth16_solana::{groth16::{Groth16Verifier, Groth16Verifyingkey}};
use solana_program::{
    hash::{hash, hashv},
    poseidon::{hashv as poseidon_hashv, Endianness, Parameters},
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::{
    HiddenHeadProofArgsV1, InitializeHiddenHeadVerifierArgsV1,
    InitializeHiddenHeadVerifierV1, VerifyHiddenHeadTransitionV1,
    ConfigureHiddenHeadVerifierV1, WriteHiddenHeadVerifierIcArgsV1,
};

pub const GPRU_HIDDEN_HEAD_VERIFIER_SEED: &[u8] = b"gpru:hidden-head-verifier:v1";
pub const TIP_ROUTE_ROOT_SEED: &[u8] = b"tip:route-merkle-root:v1";
pub const TIP_PROGRAM_ID: Pubkey = pubkey!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
pub const TCAP_PROGRAM_ID: Pubkey = pubkey!("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
pub const TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
pub const HIDDEN_HEAD_PUBLIC_INPUTS: usize = 12;
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
    /// Groth16 IC points for the constant term plus twelve public inputs.
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

pub fn verifying_key_commitment_v1(verifier: &GpruHiddenHeadVerifierV1) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(64 + 128 * 3 + 64 * (HIDDEN_HEAD_PUBLIC_INPUTS + 1));
    bytes.extend_from_slice(&verifier.alpha_g1);
    bytes.extend_from_slice(&verifier.beta_g2);
    bytes.extend_from_slice(&verifier.gamma_g2);
    bytes.extend_from_slice(&verifier.delta_g2);
    for point in &verifier.ic {
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
    require!(args.verifying_key_commitment != [0; 32], HiddenHeadError::InvalidVerifyingKey);

    let verifier = &mut ctx.accounts.verifier;
    verifier.version = GpruHiddenHeadVerifierV1::VERSION;
    verifier.authority = ctx.accounts.authority.key();
    verifier.circuit_commitment = args.circuit_commitment;
    verifier.verifying_key_commitment = args.verifying_key_commitment;
    // The complete twelve-input key cannot fit in a Solana packet. Keep the
    // existing account layout disabled until all IC chunks match its commitment.
    verifier.enabled = false;
    verifier.bump = ctx.bumps.verifier;
    verifier.alpha_g1 = args.alpha_g1;
    verifier.beta_g2 = args.beta_g2;
    verifier.gamma_g2 = args.gamma_g2;
    verifier.delta_g2 = args.delta_g2;
    verifier.ic = [[0; 64]; HIDDEN_HEAD_PUBLIC_INPUTS + 1];
    Ok(())
}

fn validate_configuration_authority(
    ctx: &Context<ConfigureHiddenHeadVerifierV1>,
) -> Result<()> {
    validate_mother_authority(&ctx.accounts.mother_escrow, &ctx.accounts.authority)?;
    require_keys_eq!(ctx.accounts.verifier.authority, ctx.accounts.authority.key(), HiddenHeadError::InvalidAuthority);
    Ok(())
}

pub fn write_verifier_ic(
    ctx: Context<ConfigureHiddenHeadVerifierV1>,
    args: WriteHiddenHeadVerifierIcArgsV1,
) -> Result<()> {
    validate_configuration_authority(&ctx)?;
    write_ic_points(&mut ctx.accounts.verifier, &args)
}

fn write_ic_points(verifier: &mut GpruHiddenHeadVerifierV1, args: &WriteHiddenHeadVerifierIcArgsV1) -> Result<()> {
    require!(!verifier.enabled, HiddenHeadError::InvalidVerifyingKey);
    let start = usize::from(args.start_index);
    require!(!args.points.is_empty() && args.points.len() <= 4, HiddenHeadError::InvalidVerifyingKey);
    require!(start + args.points.len() <= HIDDEN_HEAD_PUBLIC_INPUTS + 1, HiddenHeadError::InvalidVerifyingKey);
    require!(args.points.iter().all(|point| point.iter().any(|byte| *byte != 0)), HiddenHeadError::InvalidVerifyingKey);
    verifier.ic[start..start + args.points.len()].copy_from_slice(&args.points);
    Ok(())
}

pub fn enable_verifier(ctx: Context<ConfigureHiddenHeadVerifierV1>) -> Result<()> {
    validate_configuration_authority(&ctx)?;
    enable_complete_key(&mut ctx.accounts.verifier)
}

fn enable_complete_key(verifier: &mut GpruHiddenHeadVerifierV1) -> Result<()> {
    require!(!verifier.enabled, HiddenHeadError::InvalidVerifyingKey);
    require!(verifier.version == GpruHiddenHeadVerifierV1::VERSION, HiddenHeadError::VerifierUnavailable);
    require!(verifier.circuit_commitment == circuit_commitment_v1(), HiddenHeadError::InvalidCircuit);
    require!(verifier.ic.iter().all(|point| point.iter().any(|byte| *byte != 0)), HiddenHeadError::InvalidVerifyingKey);
    require!(verifier.verifying_key_commitment == verifying_key_commitment_v1(verifier), HiddenHeadError::InvalidVerifyingKey);
    verifier.enabled = true;
    Ok(())
}

#[cfg(test)]
mod verifier_setup_tests {
    use super::*;

    fn fixture() -> GpruHiddenHeadVerifierV1 {
        GpruHiddenHeadVerifierV1 {
            version: 1, authority: Pubkey::new_unique(), circuit_commitment: circuit_commitment_v1(),
            verifying_key_commitment: [0; 32], enabled: false, bump: 255,
            alpha_g1: [1; 64], beta_g2: [2; 128], gamma_g2: [3; 128], delta_g2: [4; 128],
            ic: [[5; 64]; HIDDEN_HEAD_PUBLIC_INPUTS + 1],
        }
    }

    #[test]
    fn key_remains_disabled_until_complete_and_commitment_checked() {
        let mut verifier = fixture();
        verifier.verifying_key_commitment = verifying_key_commitment_v1(&verifier);
        verifier.ic = [[0; 64]; HIDDEN_HEAD_PUBLIC_INPUTS + 1];
        assert!(enable_complete_key(&mut verifier).is_err());
        assert!(!verifier.enabled);
        for start in (0..HIDDEN_HEAD_PUBLIC_INPUTS + 1).step_by(4) {
            let count = (HIDDEN_HEAD_PUBLIC_INPUTS + 1 - start).min(4);
            write_ic_points(&mut verifier, &WriteHiddenHeadVerifierIcArgsV1 { start_index: start as u8, points: vec![[5; 64]; count] }).unwrap();
        }
        enable_complete_key(&mut verifier).unwrap();
        assert!(verifier.enabled);
        assert!(write_ic_points(&mut verifier, &WriteHiddenHeadVerifierIcArgsV1 { start_index: 0, points: vec![[6; 64]] }).is_err());
    }

    #[test]
    fn altered_key_or_circuit_cannot_be_enabled() {
        let mut verifier = fixture();
        verifier.verifying_key_commitment = verifying_key_commitment_v1(&verifier);
        verifier.ic[12][0] ^= 1;
        assert!(enable_complete_key(&mut verifier).is_err());
        assert!(!verifier.enabled);
        verifier.ic[12][0] ^= 1;
        verifier.circuit_commitment[0] ^= 1;
        assert!(enable_complete_key(&mut verifier).is_err());
    }

    #[test]
    fn invalid_chunks_are_rejected_without_partial_write() {
        let mut verifier = fixture();
        for (start_index, points) in [(0, vec![]), (0, vec![[5; 64]; 5]), (12, vec![[5; 64]; 2]), (0, vec![[0; 64]])] {
            let before = verifier.ic;
            assert!(write_ic_points(&mut verifier, &WriteHiddenHeadVerifierIcArgsV1 { start_index, points }).is_err());
            assert_eq!(verifier.ic, before);
        }
    }
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
        args.public_inputs[..6].iter().all(|input| input.iter().any(|byte| *byte != 0)),
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
    let action_kind = scalar_bytes_from_u64(args.action_kind as u64);
    let token_id = scalar_bytes_from_u64(args.token_id as u64);
    let amount = scalar_bytes_from_u64(args.amount);
    let action_inputs: [&[u8]; 5] = [
        &action_kind,
        &token_id,
        &amount,
        &args.authorization_commitment,
        &args.public_inputs[4],
    ];
    let expected_action_commitment = poseidon_hashv(
        Parameters::Bn254X5,
        Endianness::BigEndian,
        &action_inputs,
    )
        .map_err(|_| error!(HiddenHeadError::InvalidPublicInputs))?;
    let expected_action_bytes = expected_action_commitment.to_bytes();
    require!(args.public_inputs[3] == expected_action_bytes, HiddenHeadError::InvalidPublicInputs);

    let (memo_commitment, memo_binding) = validate_memo_instruction(&ctx.accounts.instructions)?;
    require!(
        args.public_inputs[2] == sha256_to_bn254_scalar(memo_commitment),
        HiddenHeadError::InvalidPublicInputs
    );
    require!(
        args.public_inputs[3] == memo_binding.3
            && args.public_inputs[6] == memo_binding.0
            && args.public_inputs[7] == memo_binding.1
            && args.public_inputs[8] == memo_binding.2
            && args.public_inputs[9] == memo_binding.4
            && args.public_inputs[10] == memo_binding.5
            && args.public_inputs[11] == memo_binding.6,
        HiddenHeadError::InvalidPublicInputs
    );

    let current_tcap_root = validate_tcap_root(&ctx.accounts.tcap_commitment_root)?;
    let tip_route_root = validate_tip_route_root(&ctx.accounts.tip_route_root)?;
    require!(args.public_inputs[0] == current_tcap_root, HiddenHeadError::InvalidPublicInputs);
    require!(args.public_inputs[5] == tip_route_root, HiddenHeadError::InvalidPublicInputs);
    require!(is_canonical_bn254_scalar(&args.public_inputs[0]), HiddenHeadError::InvalidPublicInputs);
    require!(is_canonical_bn254_scalar(&args.public_inputs[1]), HiddenHeadError::InvalidPublicInputs);
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

fn validate_memo_instruction(instructions: &UncheckedAccount) -> Result<([u8; 32], ([u8; 32], [u8; 32], [u8; 32], [u8; 32], [u8; 32], [u8; 32], [u8; 32]))> {
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
    const PREFIX: &[u8] = b"TSN_GPRU_HEAD_V1:";
    let data = memo.data.as_slice();
    require!(data.len() >= PREFIX.len() + 64 * 7 + 7, HiddenHeadError::InvalidPublicInputs);
    require!(&data[..PREFIX.len()] == PREFIX, HiddenHeadError::InvalidPublicInputs);
    let mut starts = [0usize; 7];
    let mut ends = [0usize; 7];
    starts[0] = PREFIX.len();
    for index in 0..7 {
        ends[index] = starts[index] + 64;
        if index < 6 {
            require!(data[ends[index]] == b':', HiddenHeadError::InvalidPublicInputs);
            starts[index + 1] = ends[index] + 1;
        }
    }
    let final_separator = ends[6];
    require!(data[final_separator] == b':', HiddenHeadError::InvalidPublicInputs);
    require!(data.len() > final_separator + 1, HiddenHeadError::InvalidPublicInputs);
    require!(data[final_separator + 1..].iter().all(|byte| {
        matches!(*byte, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-')
    }), HiddenHeadError::InvalidPublicInputs);
    let mut bindings = [[0u8; 32]; 7];
    for index in 0..7 {
        bindings[index] = decode_hex_32(&data[starts[index]..ends[index]])
            .ok_or(HiddenHeadError::InvalidPublicInputs)?;
        require!(is_canonical_bn254_scalar(&bindings[index]), HiddenHeadError::InvalidPublicInputs);
    }
    Ok((hash(data).to_bytes(), (bindings[0], bindings[1], bindings[2], bindings[3], bindings[4], bindings[5], bindings[6])))
}

fn decode_hex_32(value: &[u8]) -> Option<[u8; 32]> {
    if value.len() != 64 { return None; }
    let mut output = [0u8; 32];
    for index in 0..32 {
        let high = hex_nibble(value[index * 2])?;
        let low = hex_nibble(value[index * 2 + 1])?;
        output[index] = (high << 4) | low;
    }
    Some(output)
}

fn hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
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

fn scalar_bytes_from_u64(value: u64) -> [u8; 32] {
    let mut output = [0u8; 32];
    output[24..].copy_from_slice(&value.to_be_bytes());
    output
}
