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

use curve25519_dalek::{
    constants::RISTRETTO_BASEPOINT_COMPRESSED,
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
use sha3::{Digest, Sha3_512};

/// Solana's ElGamal/Pedersen `H` generator, defined by the zk-token SDK as
/// `hash_from_bytes::<Sha3_512>(RISTRETTO_BASEPOINT_COMPRESSED.as_bytes())`.
/// Recreate that definition here so the SBF verifier does not pull in the
/// host-oriented zk-token SDK dependency graph.
fn elgamal_generator() -> RistrettoPoint {
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

fn decode_point(bytes: &[u8; 32]) -> Result<RistrettoPoint, ()> {
    CompressedRistretto(*bytes).decompress().ok_or(())
}

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

/// Verify the public derivation proof and recompute the DNA-specific key.
/// This function is suitable for the GPRU on-chain instruction; it never
/// requires the Node's ephemeral scalar or the owner's scan secret.
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

/// Recover the matching one-time secret using the owner's base ElGamal secret.
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
