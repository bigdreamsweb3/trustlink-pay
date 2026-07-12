use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::tsn::constants::{TSN_PRU_SPEND_GUARD_DOMAIN_TAG, TSN_TRUSTLINK_INTENT_DOMAIN_TAG};

pub fn compute_cranker_dna(mother_escrow: &Pubkey, operator: &Pubkey, protocol_seed: &[u8; 32]) -> [u8; 32] {
    hashv(&[
        b"tsn_dna",
        mother_escrow.as_ref(),
        operator.as_ref(),
        protocol_seed,
    ])
    .to_bytes()
}

pub fn compute_tsn_domain(tsn_vault_pubkey: &Pubkey) -> [u8; 32] {
    hashv(&[
        TSN_TRUSTLINK_INTENT_DOMAIN_TAG,
        tsn_vault_pubkey.as_ref(),
    ])
    .to_bytes()
}

pub fn compute_pru_spend_auth_hash(tin: u64, pru_index: u16, main_wallet_pubkey: &Pubkey) -> [u8; 32] {
    hashv(&[
        tin.to_le_bytes().as_ref(),
        pru_index.to_le_bytes().as_ref(),
        main_wallet_pubkey.as_ref(),
        TSN_PRU_SPEND_GUARD_DOMAIN_TAG,
    ])
    .to_bytes()
}
