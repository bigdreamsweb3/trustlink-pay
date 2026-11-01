//! One-time ElGamal receiving keys for GPRU transaction DNA.
//!
//! The TIP route publishes a stable scan public key `P = s^-1 H`. For each
//! DNA, the Node samples an ephemeral scalar `r`, publishes `E = rH`, and
//! derives `S = rP`. The owner derives the same `S = s^-1 E`. Both derive
//! `t = H(domain || DNA || S)` and the one-time public key `P_dna = tP`;
//! the owner-only secret is `s_dna = s / t`.
//!
//! The scalar and point operations use Solana 1.18.26's Ristretto group and
//! ElGamal generator. The stable route key is only a scan key; callers must
//! encrypt transaction data to the returned one-time public key.

#[cfg(not(target_os = "solana"))]
use curve25519_dalek::{
    constants::RISTRETTO_BASEPOINT_COMPRESSED,
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
#[cfg(not(target_os = "solana"))]
use sha3::{Digest, Sha3_512};

/// Solana's ElGamal/Pedersen `H` generator, defined by the zk-token SDK as
/// `hash_from_bytes::<Sha3_512>(RISTRETTO_BASEPOINT_COMPRESSED.as_bytes())`.
/// Recreate that definition here so the SBF verifier does not pull in the
/// host-oriented zk-token SDK dependency graph.
#[cfg(not(target_os = "solana"))]
pub(crate) fn elgamal_generator() -> RistrettoPoint {
    RistrettoPoint::hash_from_bytes::<Sha3_512>(RISTRETTO_BASEPOINT_COMPRESSED.as_bytes())
}

pub const DNA_ELGAMAL_KEY_VERSION_V1: u8 = 1;
const DNA_KEY_TWEAK_DOMAIN: &[u8] = b"TSN_GPRU_DNA_ELGAMAL_TWEAK_V1\0";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NodeDerivedDnaKeyV1 {
    pub ephemeral_public_key: [u8; 32],
    pub one_time_public_key: [u8; 32],
    pub proof: DnaKeyDerivationProofV1,
}

/// Public Chaum-Pedersen proof that the ephemeral key and shared scan point
/// use the same Node-held scalar. This does not reveal that scalar or the
/// owner's scan secret.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DnaKeyDerivationProofV1 {
    pub shared_point: [u8; 32],
    pub generator_commitment: [u8; 32],
    pub scan_commitment: [u8; 32],
    pub response: [u8; 32],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OwnerDerivedDnaKeyV1 {
    pub one_time_secret_key: [u8; 32],
    pub one_time_public_key: [u8; 32],
}

#[cfg(not(target_os = "solana"))]
fn decode_point(bytes: &[u8; 32]) -> Result<RistrettoPoint, ()> {
    CompressedRistretto(*bytes).decompress().ok_or(())
}

#[cfg(not(target_os = "solana"))]
fn tweak_scalar(dna: &[u8; 32], shared_point: &RistrettoPoint) -> Result<Scalar, ()> {
    let mut hasher = Sha3_512::new();
    hasher.update(DNA_KEY_TWEAK_DOMAIN);
    hasher.update(dna);
    hasher.update(shared_point.compress().as_bytes());
    let wide: [u8; 64] = hasher.finalize().into();
    let tweak = Scalar::from_bytes_mod_order_wide(&wide);
    if tweak == Scalar::zero() {
        return Err(());
    }
    Ok(tweak)
}

#[cfg(not(target_os = "solana"))]
fn proof_challenge(
    scan_public_key: &[u8; 32],
    dna: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    one_time_public_key: &[u8; 32],
    proof: &DnaKeyDerivationProofV1,
) -> Scalar {
    let mut hasher = Sha3_512::new();
    hasher.update(b"TSN_GPRU_DNA_ELGAMAL_DLEQ_PROOF_V1\0");
    hasher.update(dna);
    hasher.update(scan_public_key);
    hasher.update(ephemeral_public_key);
    hasher.update(one_time_public_key);
    hasher.update(proof.shared_point);
    hasher.update(proof.generator_commitment);
    hasher.update(proof.scan_commitment);
    let wide: [u8; 64] = hasher.finalize().into();
    Scalar::from_bytes_mod_order_wide(&wide)
}

/// Derive a one-time receiving public key from the public TIP scan key.
/// `randomness` contains independent 64-byte OS-CSPRNG samples for the
/// ephemeral scalar and DLEQ proof nonce. It must be fresh for every DNA.
#[cfg(not(target_os = "solana"))]
pub fn derive_node_dna_key_v1(
    scan_public_key: &[u8; 32],
    dna: &[u8; 32],
    randomness: &[u8; 128],
) -> Result<NodeDerivedDnaKeyV1, ()> {
    let scan_point = decode_point(scan_public_key)?;
    if scan_point == RistrettoPoint::default() {
        return Err(());
    }

    let ephemeral_scalar =
        Scalar::from_bytes_mod_order_wide(randomness[..64].try_into().map_err(|_| ())?);
    if ephemeral_scalar == Scalar::zero() {
        return Err(());
    }

    let generator = elgamal_generator();
    let ephemeral_point = ephemeral_scalar * generator;
    let shared_point = ephemeral_scalar * scan_point;
    let tweak = tweak_scalar(dna, &shared_point)?;
    let one_time_point = tweak * scan_point;
    if one_time_point == RistrettoPoint::default() {
        return Err(());
    }

    let ephemeral_public_key = ephemeral_point.compress().to_bytes();
    let one_time_public_key = one_time_point.compress().to_bytes();
    let proof_nonce =
        Scalar::from_bytes_mod_order_wide(randomness[64..].try_into().map_err(|_| ())?);
    if proof_nonce == Scalar::zero() {
        return Err(());
    }
    let mut proof = DnaKeyDerivationProofV1 {
        shared_point: shared_point.compress().to_bytes(),
        generator_commitment: (proof_nonce * generator).compress().to_bytes(),
        scan_commitment: (proof_nonce * scan_point).compress().to_bytes(),
        response: [0; 32],
    };
    let challenge = proof_challenge(
        scan_public_key,
        dna,
        &ephemeral_public_key,
        &one_time_public_key,
        &proof,
    );
    proof.response = (proof_nonce + challenge * ephemeral_scalar).to_bytes();

    Ok(NodeDerivedDnaKeyV1 {
        ephemeral_public_key,
        one_time_public_key,
        proof,
    })
}

/// Create a separate ephemeral Diffie-Hellman shared point for encrypting a
/// GPRU transaction record to the registered scan key. This deliberately uses
/// fresh randomness and does not expose the shared point in the DNA proof.
#[cfg(not(target_os = "solana"))]
pub fn derive_node_record_shared_point_v1(
    scan_public_key: &[u8; 32],
    randomness: &[u8; 64],
) -> Result<([u8; 32], [u8; 32]), ()> {
    let scan_point = decode_point(scan_public_key)?;
    if scan_point == RistrettoPoint::default() {
        return Err(());
    }
    let scalar = Scalar::from_bytes_mod_order_wide(randomness);
    if scalar == Scalar::zero() {
        return Err(());
    }
    let generator = elgamal_generator();
    let ephemeral_public_key = (scalar * generator).compress().to_bytes();
    let shared_point = (scalar * scan_point).compress().to_bytes();
    Ok((ephemeral_public_key, shared_point))
}

/// Verify the public derivation proof and recompute the DNA-specific key.
/// This function is suitable for the GPRU on-chain instruction; it never
/// requires the Node's ephemeral scalar or the owner's scan secret.
#[cfg(not(target_os = "solana"))]
pub fn verify_node_dna_key_proof_v1(
    scan_public_key: &[u8; 32],
    dna: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    one_time_public_key: &[u8; 32],
    proof: &DnaKeyDerivationProofV1,
) -> Result<(), ()> {
    let generator = elgamal_generator();
    let scan_point = decode_point(scan_public_key)?;
    let ephemeral_point = decode_point(ephemeral_public_key)?;
    let one_time_point = decode_point(one_time_public_key)?;
    let shared_point = decode_point(&proof.shared_point)?;
    let generator_commitment = decode_point(&proof.generator_commitment)?;
    let scan_commitment = decode_point(&proof.scan_commitment)?;
    let response = Option::<Scalar>::from(Scalar::from_canonical_bytes(proof.response)).ok_or(())?;
    if scan_point == RistrettoPoint::default()
        || ephemeral_point == RistrettoPoint::default()
        || one_time_point == RistrettoPoint::default()
        || shared_point == RistrettoPoint::default()
        || generator_commitment == RistrettoPoint::default()
        || scan_commitment == RistrettoPoint::default()
    {
        return Err(());
    }

    let challenge = proof_challenge(
        scan_public_key,
        dna,
        ephemeral_public_key,
        one_time_public_key,
        proof,
    );
    if response * generator != generator_commitment + challenge * ephemeral_point
        || response * scan_point != scan_commitment + challenge * shared_point
    {
        return Err(());
    }

    let tweak = tweak_scalar(dna, &shared_point)?;
    if tweak * scan_point != one_time_point {
        return Err(());
    }
    Ok(())
}

/// SBF verifier for the same Chaum-Pedersen relation, using Solana's Ristretto
/// syscalls so the on-chain artifact does not compile Dalek's unused large
/// lookup-table constructors.
#[cfg(target_os = "solana")]
pub fn verify_node_dna_key_proof_v1(
    scan_public_key: &[u8; 32],
    dna: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    one_time_public_key: &[u8; 32],
    proof: &DnaKeyDerivationProofV1,
) -> Result<(), ()> {
    use sha3::{Digest, Sha3_512};

    const RISTRETTO_CURVE_ID: u64 = 1;
    const GROUP_MUL: u64 = 2;
    const GENERATOR_H: [u8; 32] = [
        0x8c, 0x92, 0x40, 0xb4, 0x56, 0xa9, 0xe6, 0xdc,
        0x65, 0xc3, 0x77, 0xa1, 0x04, 0x8d, 0x74, 0x5f,
        0x94, 0xa0, 0x8c, 0xdb, 0x7f, 0x44, 0xcb, 0xcd,
        0x7b, 0x46, 0xf3, 0x40, 0x48, 0x87, 0x11, 0x34,
    ];
    const SCALAR_ORDER: [u64; 4] = [
        0x5812_631a_5cf5_d3ed,
        0x14de_f9de_a2f7_9cd6,
        0,
        0x1000_0000_0000_0000,
    ];

    fn scalar_is_canonical(bytes: &[u8; 32]) -> bool {
        let mut limbs = [0u64; 4];
        for (index, chunk) in bytes.chunks_exact(8).enumerate() {
            limbs[index] = u64::from_le_bytes(chunk.try_into().expect("8-byte scalar limb"));
        }
        for index in (0..4).rev() {
            if limbs[index] < SCALAR_ORDER[index] { return true; }
            if limbs[index] > SCALAR_ORDER[index] { return false; }
        }
        false
    }

    fn reduce_wide_scalar(wide: &[u8; 64]) -> [u8; 32] {
        let mut remainder = [0u64; 4];
        for bit_index in (0..512).rev() {
            let input_bit = ((wide[bit_index / 8] >> (bit_index % 8)) & 1) as u64;
            let mut carry = input_bit;
            for limb in &mut remainder {
                let next_carry = *limb >> 63;
                *limb = (*limb << 1) | carry;
                carry = next_carry;
            }

            let mut greater_or_equal = true;
            for index in (0..4).rev() {
                if remainder[index] < SCALAR_ORDER[index] {
                    greater_or_equal = false;
                    break;
                }
                if remainder[index] > SCALAR_ORDER[index] {
                    break;
                }
            }
            if greater_or_equal {
                let mut borrow = false;
                for index in 0..4 {
                    let (difference, first_borrow) = remainder[index].overflowing_sub(SCALAR_ORDER[index]);
                    let (difference, second_borrow) = difference.overflowing_sub(borrow as u64);
                    remainder[index] = difference;
                    borrow = first_borrow || second_borrow;
                }
            }
        }

        let mut bytes = [0u8; 32];
        for (index, limb) in remainder.iter().enumerate() {
            bytes[index * 8..(index + 1) * 8].copy_from_slice(&limb.to_le_bytes());
        }
        bytes
    }

    fn hash_to_scalar(hasher: Sha3_512) -> [u8; 32] {
        let wide: [u8; 64] = hasher.finalize().into();
        reduce_wide_scalar(&wide)
    }

    fn valid_point(point: &[u8; 32]) -> bool {
        if point == &[0; 32] { return false; }
        unsafe {
            let mut valid = 0u8;
            solana_program::syscalls::sol_curve_validate_point(
                RISTRETTO_CURVE_ID,
                point.as_ptr(),
                &mut valid,
            ) == 0
        }
    }

    fn multiply(scalar: &[u8; 32], point: &[u8; 32]) -> Result<[u8; 32], ()> {
        if !scalar_is_canonical(scalar) || !valid_point(point) { return Err(()); }
        let mut output = [0u8; 32];
        let result = unsafe {
            solana_program::syscalls::sol_curve_group_op(
                RISTRETTO_CURVE_ID,
                GROUP_MUL,
                scalar.as_ptr(),
                point.as_ptr(),
                output.as_mut_ptr(),
            )
        };
        if result == 0 { Ok(output) } else { Err(()) }
    }

    fn add(left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32], ()> {
        if !valid_point(left) || !valid_point(right) { return Err(()); }
        let mut output = [0u8; 32];
        let result = unsafe {
            solana_program::syscalls::sol_curve_group_op(
                RISTRETTO_CURVE_ID,
                0,
                left.as_ptr(),
                right.as_ptr(),
                output.as_mut_ptr(),
            )
        };
        if result == 0 { Ok(output) } else { Err(()) }
    }

    if ![
        scan_public_key,
        ephemeral_public_key,
        one_time_public_key,
        &proof.shared_point,
        &proof.generator_commitment,
        &proof.scan_commitment,
    ].iter().all(|point| valid_point(point))
        || !scalar_is_canonical(&proof.response)
    {
        return Err(());
    }

    let mut challenge_hasher = Sha3_512::new();
    challenge_hasher.update(b"TSN_GPRU_DNA_ELGAMAL_DLEQ_PROOF_V1\0");
    challenge_hasher.update(dna);
    challenge_hasher.update(scan_public_key);
    challenge_hasher.update(ephemeral_public_key);
    challenge_hasher.update(one_time_public_key);
    challenge_hasher.update(proof.shared_point);
    challenge_hasher.update(proof.generator_commitment);
    challenge_hasher.update(proof.scan_commitment);
    let challenge = hash_to_scalar(challenge_hasher);

    let response_generator = multiply(&proof.response, &GENERATOR_H)?;
    let challenge_ephemeral = multiply(&challenge, ephemeral_public_key)?;
    if response_generator != add(&proof.generator_commitment, &challenge_ephemeral)? {
        return Err(());
    }

    let response_scan = multiply(&proof.response, scan_public_key)?;
    let challenge_shared = multiply(&challenge, &proof.shared_point)?;
    if response_scan != add(&proof.scan_commitment, &challenge_shared)? {
        return Err(());
    }

    let mut tweak_hasher = Sha3_512::new();
    tweak_hasher.update(DNA_KEY_TWEAK_DOMAIN);
    tweak_hasher.update(dna);
    tweak_hasher.update(proof.shared_point);
    let tweak = hash_to_scalar(tweak_hasher);
    if tweak == [0; 32] || multiply(&tweak, scan_public_key)? != *one_time_public_key {
        return Err(());
    }

    Ok(())
}

/// Recover the matching one-time secret using the owner's base ElGamal secret.
#[cfg(not(target_os = "solana"))]
pub fn derive_owner_dna_key_v1(
    scan_secret_key: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    dna: &[u8; 32],
) -> Result<OwnerDerivedDnaKeyV1, ()> {
    let scan_secret =
        Option::<Scalar>::from(Scalar::from_canonical_bytes(*scan_secret_key)).ok_or(())?;
    if scan_secret == Scalar::zero() {
        return Err(());
    }
    let ephemeral_point = decode_point(ephemeral_public_key)?;
    if ephemeral_point == RistrettoPoint::default() {
        return Err(());
    }

    let shared_point = scan_secret.invert() * ephemeral_point;
    let tweak = tweak_scalar(dna, &shared_point)?;
    let one_time_secret = scan_secret * tweak.invert();
    if one_time_secret == Scalar::zero() {
        return Err(());
    }
    let one_time_public = one_time_secret.invert() * elgamal_generator();

    Ok(OwnerDerivedDnaKeyV1 {
        one_time_secret_key: one_time_secret.to_bytes(),
        one_time_public_key: one_time_public.compress().to_bytes(),
    })
}
