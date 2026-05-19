use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

pub fn compute_cranker_dna(mother_escrow: &Pubkey, operator: &Pubkey, protocol_seed: &[u8; 32]) -> [u8; 32] {
    hashv(&[
        b"tsn_dna",
        mother_escrow.as_ref(),
        operator.as_ref(),
        protocol_seed,
    ])
    .to_bytes()
}
