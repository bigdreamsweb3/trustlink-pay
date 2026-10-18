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
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
use sha3::{Digest, Sha3_512};
use solana_zk_token_sdk::encryption::pedersen::H as ELGAMAL_GENERATOR;

pub const DNA_ELGAMAL_KEY_VERSION_V1: u8 = 1;
const DNA_KEY_TWEAK_DOMAIN: &[u8] = b"TSN_GPRU_DNA_ELGAMAL_TWEAK_V1\0";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NodeDerivedDnaKeyV1 {
    pub ephemeral_public_key: [u8; 32],
    pub one_time_public_key: [u8; 32],
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

/// Derive a one-time receiving public key from the public TIP scan key.
/// `randomness` must come from an OS CSPRNG and be freshly generated per DNA.
pub fn derive_node_dna_key_v1(
    scan_public_key: &[u8; 32],
    dna: &[u8; 32],
    randomness: &[u8; 64],
) -> Result<NodeDerivedDnaKeyV1, ()> {
    let scan_point = decode_point(scan_public_key)?;
    if scan_point == RistrettoPoint::default() {
        return Err(());
    }

    let ephemeral_scalar = Scalar::from_bytes_mod_order_wide(randomness);
    if ephemeral_scalar == Scalar::zero() {
        return Err(());
    }

    let generator = *ELGAMAL_GENERATOR;
    let ephemeral_point = ephemeral_scalar * generator;
    let shared_point = ephemeral_scalar * scan_point;
    let tweak = tweak_scalar(dna, &shared_point)?;
    let one_time_point = tweak * scan_point;
    if one_time_point == RistrettoPoint::default() {
        return Err(());
    }

    Ok(NodeDerivedDnaKeyV1 {
        ephemeral_public_key: ephemeral_point.compress().to_bytes(),
        one_time_public_key: one_time_point.compress().to_bytes(),
    })
}

/// Recover the matching one-time secret using the owner's base ElGamal secret.
pub fn derive_owner_dna_key_v1(
    scan_secret_key: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    dna: &[u8; 32],
) -> Result<OwnerDerivedDnaKeyV1, ()> {
    let scan_secret = Option::<Scalar>::from(Scalar::from_canonical_bytes(*scan_secret_key))
        .ok_or(())?;
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
    let one_time_public = one_time_secret.invert() * *ELGAMAL_GENERATOR;

    Ok(OwnerDerivedDnaKeyV1 {
        one_time_secret_key: one_time_secret.to_bytes(),
        one_time_public_key: one_time_public.compress().to_bytes(),
    })
}
