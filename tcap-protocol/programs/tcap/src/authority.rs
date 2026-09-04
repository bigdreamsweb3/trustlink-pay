use anchor_lang::prelude::*;

pub const TCAP_GLOBAL_CONFIG_SEED: &[u8] = b"tcap:global-config:v1";
pub const TCAP_ASSET_REGISTRY_SEED: &[u8] = b"tcap:asset-registry:v1";
pub const TCAP_ASSET_ENTRY_SEED: &[u8] = b"tcap:asset-entry:v1";
pub const TCAP_ASSET_STATE_SEED: &[u8] = b"tcap:asset-state:v1";
pub const TCAP_RESERVE_STATE_SEED: &[u8] = b"tcap:reserve-state:v1";
pub const TCAP_RESERVE_AUTHORITY_SEED: &[u8] = b"tcap:reserve-authority:v1";
pub const TCAP_FUTURE_VAULT_SEED: &[u8] = b"tcap:future-vault:v1";
pub const TCAP_NULLIFIER_REGISTRY_SEED: &[u8] = b"tcap:nullifier-registry:v1";
pub const TCAP_NULLIFIER_SHARD_SEED: &[u8] = b"tcap:nullifier-shard:v1";
pub const TCAP_NULLIFIER_SEED: &[u8] = b"tcap:nullifier:v1";
pub const TCAP_COMMITMENT_ROOT_SEED: &[u8] = b"tcap:commitment-root:v1";
/// Domain-separated seed for the privacy-preserving TINS tip state PDA.
pub const TCAP_TIN_TIP_V1_SEED: &[u8] = b"tcap:tin-tip:v1";
pub const TCAP_TSN_AUTH_RECEIPT_SEED: &[u8] = b"tcap:tsn-auth-receipt:v1";
pub const TCAP_FUNDING_ROOT_SEED: &[u8] = b"tcap:funding-root:v1";
pub const TCAP_FUNDING_CLAIM_SEED: &[u8] = b"tcap:funding-claim:v1";
pub const TCAP_FUNDING_NONCE_SEED: &[u8] = b"tcap:funding-nonce:v1";
pub const TCAP_ASSET_GOVERNANCE_POLICY_SEED: &[u8] = b"tcap:asset-governance:v2";
pub const TCAP_ASSET_EXTENSION_POLICY_SEED: &[u8] = b"tcap:extension-policy:v2";
pub const TSN_TCAP_AUTHORITY_SEED: &[u8] = b"tsn:tcap-authorization:v1";
pub const TCAP_LIQUIDITY_POOL_SEED: &[u8] = b"tcap:liquidity-pool:v1";
pub const TCAP_EXIT_RECEIPT_SEED: &[u8] = b"tcap:exit-receipt:v1";
pub const TCAP_TIP_LIABILITY_V2_SEED: &[u8] = b"tcap:tip-liability:v2";

pub fn derive_reserve_authority(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TCAP_RESERVE_AUTHORITY_SEED, asset_state.as_ref()],
        &crate::ID,
    )
}

pub fn derive_reserve_state(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[TCAP_RESERVE_STATE_SEED, asset_state.as_ref()], &crate::ID)
}

pub fn derive_future_vault(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[TCAP_FUTURE_VAULT_SEED, asset_state.as_ref()], &crate::ID)
}

pub fn derive_funding_root(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[TCAP_FUNDING_ROOT_SEED, asset_state.as_ref()], &crate::ID)
}

/// Derives the TCAP tip-state PDA from a blinded TINS privacy-receiving-root
/// commitment. The underlying TINS identity and receiving root never appear in
/// the PDA seeds or account state.
pub fn derive_tcap_tin_tip_v1(
    blinded_tins_privacy_receiving_root_commitment: &[u8; 32],
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            TCAP_TIN_TIP_V1_SEED,
            blinded_tins_privacy_receiving_root_commitment,
        ],
        &crate::ID,
    )
}

pub fn derive_funding_claim(asset_state: &Pubkey, funding_identifier: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            TCAP_FUNDING_CLAIM_SEED,
            asset_state.as_ref(),
            funding_identifier,
        ],
        &crate::ID,
    )
}

pub fn derive_funding_authorization_nonce(
    asset_state: &Pubkey,
    depositor: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            TCAP_FUNDING_NONCE_SEED,
            asset_state.as_ref(),
            depositor.as_ref(),
        ],
        &crate::ID,
    )
}

pub fn derive_asset_governance_policy(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TCAP_ASSET_GOVERNANCE_POLICY_SEED, asset_state.as_ref()],
        &crate::ID,
    )
}

pub fn derive_asset_extension_policy(asset_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TCAP_ASSET_EXTENSION_POLICY_SEED, asset_state.as_ref()],
        &crate::ID,
    )
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

pub fn derive_tcap_tip_liability_v2(tin_tip: &Pubkey, asset_entry: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TCAP_TIP_LIABILITY_V2_SEED, tin_tip.as_ref(), asset_entry.as_ref()],
        &crate::ID,
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
        let funding_root = derive_funding_root(&asset_entry).0;
        assert_ne!(state, authority);
        assert_ne!(state, vault);
        assert_ne!(authority, vault);
        assert_ne!(funding_root, state);
        assert_ne!(funding_root, authority);
        assert_ne!(funding_root, vault);
    }

    #[test]
    fn funding_claim_and_nonce_domains_are_distinct() {
        let asset_entry = Pubkey::new_unique();
        let depositor = Pubkey::new_unique();
        let value = [9_u8; 32];
        assert_ne!(
            derive_funding_claim(&asset_entry, &value).0,
            derive_funding_authorization_nonce(&asset_entry, &depositor).0
        );
    }

    #[test]
    fn tin_tip_pda_is_root_scoped_and_domain_separated() {
        let root_a = [1_u8; 32];
        let root_b = [2_u8; 32];
        let tip_a = derive_tcap_tin_tip_v1(&root_a).0;
        assert_ne!(tip_a, derive_tcap_tin_tip_v1(&root_b).0);
        assert_ne!(
            tip_a,
            derive_funding_root(&Pubkey::new_from_array(root_a)).0
        );
    }

    #[test]
    fn governed_asset_policy_domains_are_distinct() {
        let asset_entry = Pubkey::new_unique();
        assert_ne!(
            derive_asset_governance_policy(&asset_entry).0,
            derive_asset_extension_policy(&asset_entry).0
        );
        assert_ne!(
            derive_asset_governance_policy(&asset_entry).0,
            derive_reserve_state(&asset_entry).0
        );
    }

    #[test]
    fn funding_nonce_is_scoped_by_asset_and_depositor() {
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let depositor_a = Pubkey::new_unique();
        let depositor_b = Pubkey::new_unique();

        let nonce_a = derive_funding_authorization_nonce(&asset_a, &depositor_a).0;
        assert_ne!(
            nonce_a,
            derive_funding_authorization_nonce(&asset_a, &depositor_b).0
        );
        assert_ne!(
            nonce_a,
            derive_funding_authorization_nonce(&asset_b, &depositor_a).0
        );
    }

    #[test]
    fn external_wallet_is_not_tsn_authorization_signer() {
        let tsn = Pubkey::new_unique();
        let signer = derive_tsn_authorization_signer(&tsn, &[7_u8; 32]).0;
        assert_ne!(signer, tsn);
        assert_ne!(signer, Pubkey::new_unique());
    }
}
