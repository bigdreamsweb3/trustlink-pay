use anchor_lang::prelude::*;

pub const TCAP_GLOBAL_CONFIG_SEED: &[u8] = b"tcap:global-config:v1";
pub const TCAP_ASSET_REGISTRY_SEED: &[u8] = b"tcap:asset-registry:v1";
pub const TCAP_ASSET_ENTRY_SEED: &[u8] = b"tcap:asset-entry:v1";
pub const TCAP_RESERVE_STATE_SEED: &[u8] = b"tcap:reserve-state:v1";
pub const TCAP_RESERVE_AUTHORITY_SEED: &[u8] = b"tcap:reserve-authority:v1";
pub const TCAP_FUTURE_VAULT_SEED: &[u8] = b"tcap:future-vault:v1";
pub const TCAP_NULLIFIER_REGISTRY_SEED: &[u8] = b"tcap:nullifier-registry:v1";
pub const TCAP_NULLIFIER_SHARD_SEED: &[u8] = b"tcap:nullifier-shard:v1";
pub const TCAP_NULLIFIER_SEED: &[u8] = b"tcap:nullifier:v1";
pub const TCAP_COMMITMENT_ROOT_SEED: &[u8] = b"tcap:commitment-root:v1";
pub const TCAP_TSN_AUTH_RECEIPT_SEED: &[u8] = b"tcap:tsn-auth-receipt:v1";
pub const TSN_TCAP_AUTHORITY_SEED: &[u8] = b"tsn:tcap-authorization:v1";

pub fn derive_reserve_authority(asset_entry: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TCAP_RESERVE_AUTHORITY_SEED, asset_entry.as_ref()],
        &crate::ID,
    )
}

pub fn derive_reserve_state(asset_entry: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[TCAP_RESERVE_STATE_SEED, asset_entry.as_ref()], &crate::ID)
}

pub fn derive_future_vault(asset_entry: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[TCAP_FUTURE_VAULT_SEED, asset_entry.as_ref()], &crate::ID)
}

pub fn derive_tsn_authorization_signer(
    approved_tsn_program: &Pubkey,
    authorization_digest: &[u8; 32],
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TSN_TCAP_AUTHORITY_SEED, authorization_digest],
        approved_tsn_program,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn tcap_reserve_authority_is_not_a_legacy_tsn_pda() {
        let asset_entry = Pubkey::new_unique();
        let tcap_authority = derive_reserve_authority(&asset_entry).0;
        let legacy_tsn_program =
            Pubkey::from_str("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V").unwrap();
        let legacy_derived = Pubkey::find_program_address(
            &[TCAP_RESERVE_AUTHORITY_SEED, asset_entry.as_ref()],
            &legacy_tsn_program,
        )
        .0;
        assert_ne!(tcap_authority, legacy_derived);
    }

    #[test]
    fn reserve_domains_are_distinct_and_tcap_owned() {
        let asset_entry = Pubkey::new_unique();
        let state = derive_reserve_state(&asset_entry).0;
        let authority = derive_reserve_authority(&asset_entry).0;
        let vault = derive_future_vault(&asset_entry).0;
        assert_ne!(state, authority);
        assert_ne!(state, vault);
        assert_ne!(authority, vault);
    }

    #[test]
    fn external_wallet_is_not_tsn_authorization_signer() {
        let tsn = Pubkey::new_unique();
        let signer = derive_tsn_authorization_signer(&tsn, &[7_u8; 32]).0;
        assert_ne!(signer, tsn);
        assert_ne!(signer, Pubkey::new_unique());
    }
}
