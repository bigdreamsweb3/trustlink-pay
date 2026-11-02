use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use solana_program::{
    account_info::AccountInfo,
    poseidon::{hashv as poseidon_hashv, Endianness, Parameters},
    program_error::ProgramError,
};

use crate::{error::Error, state::TipRouteMerkleRootV1};
use crate::route_zero_hashes::ROUTE_ZERO_HASHES_V1;

fn field_bytes(value: Fr) -> Result<[u8; 32], ProgramError> {
    let bytes = value.into_bigint().to_bytes_be();
    if bytes.len() > 32 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut output = [0u8; 32];
    output[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(output)
}

fn canonical_field_bytes(value: &[u8; 32]) -> Result<[u8; 32], ProgramError> {
    field_bytes(Fr::from_be_bytes_mod_order(value))
}

fn poseidon2(left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32], ProgramError> {
    // Preserve the previous Circom behavior: inputs were reduced modulo Fr
    // before hashing. Solana's Poseidon syscall requires canonical field bytes.
    let left = canonical_field_bytes(left)?;
    let right = canonical_field_bytes(right)?;
    let inputs: [&[u8]; 2] = [&left, &right];
    poseidon_hashv(Parameters::Bn254X5, Endianness::BigEndian, &inputs)
        .map(|hash| hash.to_bytes())
        .map_err(|_| ProgramError::InvalidInstructionData)
}

fn route_leaf(
    lookup_commitment: &[u8; 32],
    gpru_key_commitment: &[u8; 32],
    balance_scan_public_key_x: &[u8; 32],
    balance_scan_public_key_y: &[u8; 32],
    policy_commitment: &[u8; 32],
) -> Result<[u8; 32], ProgramError> {
    let lookup_commitment = canonical_field_bytes(lookup_commitment)?;
    let gpru_key_commitment = canonical_field_bytes(gpru_key_commitment)?;
    let balance_scan_public_key_x = canonical_field_bytes(balance_scan_public_key_x)?;
    let balance_scan_public_key_y = canonical_field_bytes(balance_scan_public_key_y)?;
    let policy_commitment = canonical_field_bytes(policy_commitment)?;
    let inputs: [&[u8]; 5] = [
        &lookup_commitment,
        &gpru_key_commitment,
        &balance_scan_public_key_x,
        &balance_scan_public_key_y,
        &policy_commitment,
    ];
    poseidon_hashv(Parameters::Bn254X5, Endianness::BigEndian, &inputs)
        .map(|hash| hash.to_bytes())
        .map_err(|_| ProgramError::InvalidInstructionData)
}

fn load_route_root(account: &AccountInfo) -> Result<Box<TipRouteMerkleRootV1>, ProgramError> {
    // The generated Borsh decoder for the 32-node frontier crosses an SBF
    // stack boundary. Read the same fixed Borsh layout into heap-backed state
    // without materializing the nested array decoder's temporary copies.
    let data = account.try_borrow_data()?;
    if data.len() < TipRouteMerkleRootV1::LEN
        || data[TipRouteMerkleRootV1::LEN..].iter().any(|byte| *byte != 0)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut leaf_count = [0; 8];
    leaf_count.copy_from_slice(&data[34..42]);
    let mut root = Box::new(TipRouteMerkleRootV1 {
        version: data[0],
        bump: data[1],
        root: [0; 32],
        leaf_count: u64::from_le_bytes(leaf_count),
        frontier: [[0; 32]; TipRouteMerkleRootV1::DEPTH],
    });
    root.root.copy_from_slice(&data[2..34]);
    for (node, bytes) in root.frontier.iter_mut()
        .zip(data[42..TipRouteMerkleRootV1::LEN].chunks_exact(32))
    {
        node.copy_from_slice(bytes);
    }
    Ok(root)
}

pub fn append_route<'a>(
    account: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    program_id: &solana_program::pubkey::Pubkey,
    lookup_commitment: &[u8; 32],
    gpru_key_commitment: &[u8; 32],
    balance_scan_public_key_x: &[u8; 32],
    balance_scan_public_key_y: &[u8; 32],
    policy_commitment: &[u8; 32],
) -> Result<u32, ProgramError> {
    let (expected, bump) = crate::tip_route_root_pda(program_id);
    if account.key != &expected {
        return Err(Error::InvalidPda.into());
    }

    let mut root = if account.data_is_empty() {
        let bump_seed = [bump];
        let seeds: [&[u8]; 2] = [crate::seeds::TIP_ROUTE_ROOT_V1, &bump_seed];
        crate::cpi::create_pda_account(
            payer,
            account,
            system_program,
            program_id,
            TipRouteMerkleRootV1::LEN,
            0,
            &seeds,
        )?;
        Box::new(TipRouteMerkleRootV1 {
            version: TipRouteMerkleRootV1::VERSION,
            bump,
            root: ROUTE_ZERO_HASHES_V1[TipRouteMerkleRootV1::DEPTH],
            leaf_count: 0,
            frontier: [[0; 32]; TipRouteMerkleRootV1::DEPTH],
        })
    } else {
        crate::utils::assert_program_owned(account, program_id)?;
        load_route_root(account)?
    };

    if root.version != TipRouteMerkleRootV1::VERSION
        || root.bump != bump
        || root.leaf_count >= u32::MAX as u64
    {
        return Err(Error::InvalidInstruction.into());
    }
    let leaf_index = root.leaf_count as u32;
    let mut node = route_leaf(
        lookup_commitment,
        gpru_key_commitment,
        balance_scan_public_key_x,
        balance_scan_public_key_y,
        policy_commitment,
    )?;
    for level in 0..TipRouteMerkleRootV1::DEPTH {
        let zero = &ROUTE_ZERO_HASHES_V1[level];
        if ((root.leaf_count >> level) & 1) == 0 {
            root.frontier[level] = node;
            node = poseidon2(&node, zero)?;
        } else {
            node = poseidon2(&root.frontier[level], &node)?;
        }
    }
    root.root = node;
    root.leaf_count = root.leaf_count.checked_add(1).ok_or(Error::Overflow)?;
    crate::utils::store_borsh(account, &root)?;
    Ok(leaf_index)
}
