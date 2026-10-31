//! C ABI for the TSN Node's Python `ctypes` adapter.

use crate::stealth_keys::{derive_node_dna_key_v1, derive_node_record_shared_point_v1};
use core::ptr;

/// Derive an ephemeral public key and per-DNA ElGamal public key.
///
/// Returns 0 on success, 1 for invalid input/point, and 2 for null pointers.
/// The caller supplies 128 fresh CSPRNG bytes in `randomness`; the result
/// includes the 128-byte public Chaum-Pedersen proof.
#[no_mangle]
pub unsafe extern "C" fn tsn_gpru_derive_node_dna_key_v1(
    scan_public_key: *const u8,
    dna: *const u8,
    randomness: *const u8,
    ephemeral_public_key_out: *mut u8,
    one_time_public_key_out: *mut u8,
    proof_out: *mut u8,
) -> i32 {
    if scan_public_key.is_null()
        || dna.is_null()
        || randomness.is_null()
        || ephemeral_public_key_out.is_null()
        || one_time_public_key_out.is_null()
        || proof_out.is_null()
    {
        return 2;
    }

    let scan = core::slice::from_raw_parts(scan_public_key, 32);
    let dna_bytes = core::slice::from_raw_parts(dna, 32);
    let random_bytes = core::slice::from_raw_parts(randomness, 128);
    let scan: &[u8; 32] = match scan.try_into() {
        Ok(value) => value,
        Err(_) => return 1,
    };
    let dna_bytes: &[u8; 32] = match dna_bytes.try_into() {
        Ok(value) => value,
        Err(_) => return 1,
    };
    let random_bytes: &[u8; 128] = match random_bytes.try_into() {
        Ok(value) => value,
        Err(_) => return 1,
    };

    let derived = match derive_node_dna_key_v1(scan, dna_bytes, random_bytes) {
        Ok(value) => value,
        Err(_) => return 1,
    };

    ptr::copy_nonoverlapping(
        derived.ephemeral_public_key.as_ptr(),
        ephemeral_public_key_out,
        32,
    );
    ptr::copy_nonoverlapping(
        derived.one_time_public_key.as_ptr(),
        one_time_public_key_out,
        32,
    );
    let proof = [
        derived.proof.shared_point,
        derived.proof.generator_commitment,
        derived.proof.scan_commitment,
        derived.proof.response,
    ]
    .concat();
    ptr::copy_nonoverlapping(proof.as_ptr(), proof_out, proof.len());
    0
}

/// Derive a fresh ephemeral public key and private shared point for a DBrix
/// transaction-record envelope. The shared point must never be returned in
/// transaction data or logs.
#[no_mangle]
pub unsafe extern "C" fn tsn_gpru_derive_record_shared_point_v1(
    scan_public_key: *const u8,
    randomness: *const u8,
    ephemeral_public_key_out: *mut u8,
    shared_point_out: *mut u8,
) -> i32 {
    if scan_public_key.is_null()
        || randomness.is_null()
        || ephemeral_public_key_out.is_null()
        || shared_point_out.is_null()
    {
        return 2;
    }
    let scan: &[u8; 32] = match core::slice::from_raw_parts(scan_public_key, 32).try_into() {
        Ok(value) => value,
        Err(_) => return 1,
    };
    let random: &[u8; 64] = match core::slice::from_raw_parts(randomness, 64).try_into() {
        Ok(value) => value,
        Err(_) => return 1,
    };
    let (ephemeral, shared) = match derive_node_record_shared_point_v1(scan, random) {
        Ok(value) => value,
        Err(_) => return 1,
    };
    ptr::copy_nonoverlapping(ephemeral.as_ptr(), ephemeral_public_key_out, 32);
    ptr::copy_nonoverlapping(shared.as_ptr(), shared_point_out, 32);
    0
}

