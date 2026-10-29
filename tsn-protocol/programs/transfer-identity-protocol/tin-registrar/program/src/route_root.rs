use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};
use solana_program::{account_info::AccountInfo, program_error::ProgramError};

use crate::{error::Error, state::TipRouteMerkleRootV1};

fn field_bytes(value: Fr) -> Result<[u8; 32], ProgramError> {
    let bytes = value.into_bigint().to_bytes_be();
    if bytes.len() > 32 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut output = [0u8; 32];
    output[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(output)
}

fn field_from_bytes(value: &[u8; 32]) -> Fr {
    Fr::from_be_bytes_mod_order(value)
}

fn poseidon2(left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32], ProgramError> {
    let mut poseidon = Poseidon::<Fr>::new_circom(2).map_err(|_| ProgramError::InvalidInstructionData)?;
    let result = poseidon
        .hash(&[field_from_bytes(left), field_from_bytes(right)])
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    field_bytes(result)
}

fn route_leaf(
    lookup_commitment: &[u8; 32],
    gpru_key_commitment: &[u8; 32],
    policy_commitment: &[u8; 32],
) -> Result<[u8; 32], ProgramError> {
    let mut poseidon = Poseidon::<Fr>::new_circom(3).map_err(|_| ProgramError::InvalidInstructionData)?;
    let result = poseidon
        .hash(&[
            field_from_bytes(lookup_commitment),
            field_from_bytes(gpru_key_commitment),
            field_from_bytes(policy_commitment),
        ])
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    field_bytes(result)
}

fn empty_root() -> Result<[u8; 32], ProgramError> {
    let mut node = [0u8; 32];
    for _ in 0..TipRouteMerkleRootV1::DEPTH {
        node = poseidon2(&node, &node)?;
    }
    Ok(node)
}

pub fn append_route<'a>(
    account: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    program_id: &solana_program::pubkey::Pubkey,
    lookup_commitment: &[u8; 32],
    gpru_key_commitment: &[u8; 32],
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
        TipRouteMerkleRootV1 {
            version: TipRouteMerkleRootV1::VERSION,
            bump,
            root: empty_root()?,
            leaf_count: 0,
            frontier: [[0; 32]; TipRouteMerkleRootV1::DEPTH],
        }
    } else {
        crate::utils::assert_program_owned(account, program_id)?;
        crate::utils::load_borsh_with_zero_padding(account)?
    };

    if root.version != TipRouteMerkleRootV1::VERSION
        || root.bump != bump
        || root.leaf_count >= u32::MAX as u64
    {
        return Err(Error::InvalidInstruction.into());
    }
    let leaf_index = root.leaf_count as u32;
    let mut node = route_leaf(lookup_commitment, gpru_key_commitment, policy_commitment)?;
    let mut zero = [0u8; 32];
    for level in 0..TipRouteMerkleRootV1::DEPTH {
        if ((root.leaf_count >> level) & 1) == 0 {
            root.frontier[level] = node;
            node = poseidon2(&node, &zero)?;
        } else {
            node = poseidon2(&root.frontier[level], &node)?;
        }
        zero = poseidon2(&zero, &zero)?;
    }
    root.root = node;
    root.leaf_count = root.leaf_count.checked_add(1).ok_or(Error::Overflow)?;
    crate::utils::store_borsh(account, &root)?;
    Ok(leaf_index)
}
