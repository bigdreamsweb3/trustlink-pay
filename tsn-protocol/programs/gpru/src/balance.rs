//! ElGamal balance arithmetic and first-credit encryption proof for GPRU V1.

use curve25519_dalek::{
    constants::RISTRETTO_BASEPOINT_POINT,
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
use sha3::{Digest, Sha3_512};

use crate::stealth_keys::elgamal_generator;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InitialBalanceProofV1 {
    pub generator_commitment: [u8; 32],
    pub key_commitment: [u8; 32],
    pub response: [u8; 32],
}

fn point(bytes: &[u8; 32]) -> Result<RistrettoPoint, ()> {
    CompressedRistretto(*bytes).decompress().ok_or(())
}

fn proof_challenge(
    public_key: &[u8; 32],
    amount: u64,
    ciphertext: &[u8; 64],
    generator_commitment: &[u8; 32],
    key_commitment: &[u8; 32],
) -> Scalar {
    let mut hasher = Sha3_512::new();
    hasher.update(b"TSN_GPRU_INITIAL_BALANCE_PROOF_V1\0");
    hasher.update(public_key);
    hasher.update(amount.to_le_bytes());
    hasher.update(ciphertext);
    hasher.update(generator_commitment);
    hasher.update(key_commitment);
    let wide: [u8; 64] = hasher.finalize().into();
    Scalar::from_bytes_mod_order_wide(&wide)
}

/// Encrypt the first public credit amount to the TIP-registered ElGamal key.
/// The proof lets GPRU verify the encrypted value equals `amount` without
/// learning the decryption key or accepting a forged ciphertext.
pub fn encrypt_initial_balance_v1(
    public_key: &[u8; 32],
    amount: u64,
    randomness: &[u8; 128],
) -> Result<([u8; 64], InitialBalanceProofV1), ()> {
    let public = point(public_key)?;
    if public == RistrettoPoint::default() || amount == 0 {
        return Err(());
    }
    let opening = Scalar::from_bytes_mod_order_wide(randomness[..64].try_into().map_err(|_| ())?);
    let nonce = Scalar::from_bytes_mod_order_wide(randomness[64..].try_into().map_err(|_| ())?);
    if opening == Scalar::zero() || nonce == Scalar::zero() {
        return Err(());
    }
    let h = elgamal_generator();
    let c = Scalar::from(amount) * RISTRETTO_BASEPOINT_POINT + opening * h;
    let d = opening * public;
    let ciphertext: [u8; 64] = [c.compress().to_bytes(), d.compress().to_bytes()]
        .concat()
        .try_into()
        .map_err(|_| ())?;
    let generator_commitment = (nonce * h).compress().to_bytes();
    let key_commitment = (nonce * public).compress().to_bytes();
    let challenge = proof_challenge(
        public_key,
        amount,
        &ciphertext,
        &generator_commitment,
        &key_commitment,
    );
    let proof = InitialBalanceProofV1 {
        generator_commitment,
        key_commitment,
        response: (nonce + challenge * opening).to_bytes(),
    };
    Ok((ciphertext, proof))
}

/// Verify a first-credit ciphertext is an encryption of exactly `amount`.
pub fn verify_initial_balance_v1(
    public_key: &[u8; 32],
    amount: u64,
    ciphertext: &[u8; 64],
    proof: &InitialBalanceProofV1,
) -> Result<(), ()> {
    if amount == 0 {
        return Err(());
    }
    let public = point(public_key)?;
    let c_bytes: [u8; 32] = ciphertext[..32].try_into().map_err(|_| ())?;
    let d_bytes: [u8; 32] = ciphertext[32..].try_into().map_err(|_| ())?;
    let c = point(&c_bytes)?;
    let d = point(&d_bytes)?;
    let t_h = point(&proof.generator_commitment)?;
    let t_p = point(&proof.key_commitment)?;
    let response = Option::<Scalar>::from(Scalar::from_canonical_bytes(proof.response)).ok_or(())?;
    if public == RistrettoPoint::default()
        || d == RistrettoPoint::default()
        || t_h == RistrettoPoint::default()
        || t_p == RistrettoPoint::default()
    {
        return Err(());
    }
    let h = elgamal_generator();
    let encrypted_opening = c - Scalar::from(amount) * RISTRETTO_BASEPOINT_POINT;
    let challenge = proof_challenge(
        public_key,
        amount,
        ciphertext,
        &proof.generator_commitment,
        &proof.key_commitment,
    );
    if response * h != t_h + challenge * encrypted_opening
        || response * public != t_p + challenge * d
    {
        return Err(());
    }
    Ok(())
}

/// Add a public credit amount to an existing ciphertext. The owner’s
/// decryption handle remains unchanged; only the Pedersen/ElGamal commitment
/// point advances by amount*G.
pub fn add_credit_v1(ciphertext: &[u8; 64], amount: u64) -> Result<[u8; 64], ()> {
    if amount == 0 {
        return Err(());
    }
    let c_bytes: [u8; 32] = ciphertext[..32].try_into().map_err(|_| ())?;
    let d_bytes: [u8; 32] = ciphertext[32..].try_into().map_err(|_| ())?;
    let c = point(&c_bytes)?;
    let d = point(&d_bytes)?;
    if d == RistrettoPoint::default() {
        return Err(());
    }
    Ok([
        ((c + Scalar::from(amount) * RISTRETTO_BASEPOINT_POINT)
            .compress()
            .to_bytes()),
        d.compress().to_bytes(),
    ]
    .concat()
    .try_into()
    .map_err(|_| ())?)
}
