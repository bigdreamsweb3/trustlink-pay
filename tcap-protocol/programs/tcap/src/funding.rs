use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::error::TcapError;
use crate::instructions::DepositWithFundingCommitmentArgsV1;
use crate::instructions::DepositWithFundingCommitmentArgsV2;
use crate::state::TcapAssetIdV1;

pub const TCAP_FUNDING_DOMAIN_LABEL_V1: &[u8] = b"tcap:funding-domain:v1";
pub const TCAP_FUNDING_AUTH_LABEL_V1: &[u8] = b"tcap:funding-auth:v1";
pub const TCAP_FUNDING_COMMITMENT_LABEL_V1: &[u8] = b"TCAP_FUNDING_CLAIM_V1";
pub const TCAP_FUNDING_EMPTY_ROOT_LABEL_V1: &[u8] = b"tcap:funding-empty-root:v1";
pub const TCAP_FUNDING_ROOT_TRANSITION_LABEL_V1: &[u8] = b"tcap:funding-root-step:v1";
pub const TCAP_FUNDING_DOMAIN_LABEL_V2: &[u8] = b"tcap:funding-domain:v2";
pub const TCAP_FUNDING_AUTH_LABEL_V2: &[u8] = b"tcap:funding-auth:v2";
pub const TCAP_FUNDING_COMMITMENT_LABEL_V2: &[u8] = b"TCAP_FUNDING_CLAIM_V2";
pub const TCAP_FUNDING_DOMAIN_LABEL_V3: &[u8] = b"tcap:funding-domain:v3";
pub const TCAP_FUNDING_AUTH_LABEL_V3: &[u8] = b"tcap:funding-auth:v3";
pub const TCAP_FUNDING_COMMITMENT_LABEL_V3: &[u8] = b"TCAP_FUNDING_CLAIM_V3";

pub fn funding_domain_separator(
    protocol_version: u16,
    domain_version: u16,
    asset_commitment: &[u8; 32],
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_DOMAIN_LABEL_V1,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        &domain_version.to_le_bytes(),
        asset_commitment,
    ])
    .to_bytes()
}

pub fn depositor_authorization_commitment(
    protocol_version: u16,
    depositor: &Pubkey,
    funding_identifier: &[u8; 32],
    authorization_nonce: u64,
    expires_at_slot: u64,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_AUTH_LABEL_V1,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        depositor.as_ref(),
        funding_identifier,
        &authorization_nonce.to_le_bytes(),
        &expires_at_slot.to_le_bytes(),
    ])
    .to_bytes()
}

pub fn funding_domain_separator_v2(
    protocol_version: u16,
    domain_version: u16,
    asset_commitment: &[u8; 32],
    governance_policy: &Pubkey,
    extension_policy: &Pubkey,
    policy_version: u16,
    extension_config_hash: &[u8; 32],
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_DOMAIN_LABEL_V2,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        &domain_version.to_le_bytes(),
        asset_commitment,
        governance_policy.as_ref(),
        extension_policy.as_ref(),
        &policy_version.to_le_bytes(),
        extension_config_hash,
    ])
    .to_bytes()
}

pub fn depositor_authorization_commitment_v2(
    protocol_version: u16,
    depositor: &Pubkey,
    asset_entry: &Pubkey,
    funding_identifier: &[u8; 32],
    authorization_nonce: u64,
    expires_at_slot: u64,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_AUTH_LABEL_V2,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        depositor.as_ref(),
        asset_entry.as_ref(),
        funding_identifier,
        &authorization_nonce.to_le_bytes(),
        &expires_at_slot.to_le_bytes(),
    ])
    .to_bytes()
}

pub fn funding_commitment_v2(
    protocol_version: u16,
    registry: &Pubkey,
    reserve_state: &Pubkey,
    asset: &TcapAssetIdV1,
    governance_policy: &Pubkey,
    extension_policy: &Pubkey,
    policy_version: u16,
    extension_config_hash: &[u8; 32],
    depositor_authorization: &[u8; 32],
    args: &DepositWithFundingCommitmentArgsV2,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_COMMITMENT_LABEL_V2,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        registry.as_ref(),
        reserve_state.as_ref(),
        asset.token_program.as_ref(),
        asset.mint.as_ref(),
        &asset.registry_version.to_le_bytes(),
        &asset.asset_commitment,
        governance_policy.as_ref(),
        extension_policy.as_ref(),
        &policy_version.to_le_bytes(),
        extension_config_hash,
        &args.amount.to_le_bytes(),
        &[args.settlement_mode],
        &args.destination_commitment,
        depositor_authorization,
        &args.funding_identifier,
        &args.authorization_nonce.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.fee_authorization_commitment,
        &args.randomness_commitment,
        &args.domain_separator,
    ])
    .to_bytes()
}

pub fn funding_domain_separator_v3(
    protocol_version: u16,
    domain_version: u16,
    asset_commitment: &[u8; 32],
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_DOMAIN_LABEL_V3,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        &domain_version.to_le_bytes(),
        asset_commitment,
    ])
    .to_bytes()
}

pub fn depositor_authorization_commitment_v3(
    protocol_version: u16,
    depositor: &Pubkey,
    asset_state: &Pubkey,
    funding_identifier: &[u8; 32],
    authorization_nonce: u64,
    expires_at_slot: u64,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_AUTH_LABEL_V3,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        depositor.as_ref(),
        asset_state.as_ref(),
        funding_identifier,
        &authorization_nonce.to_le_bytes(),
        &expires_at_slot.to_le_bytes(),
    ])
    .to_bytes()
}

pub fn funding_commitment_v3(
    protocol_version: u16,
    reserve_state: &Pubkey,
    token_program: &Pubkey,
    mint: &Pubkey,
    asset_commitment: &[u8; 32],
    depositor_authorization: &[u8; 32],
    args: &DepositWithFundingCommitmentArgsV2,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_COMMITMENT_LABEL_V3,
        crate::ID.as_ref(),
        &protocol_version.to_le_bytes(),
        reserve_state.as_ref(),
        token_program.as_ref(),
        mint.as_ref(),
        asset_commitment,
        &args.amount.to_le_bytes(),
        &[args.settlement_mode],
        &args.destination_commitment,
        depositor_authorization,
        &args.funding_identifier,
        &args.authorization_nonce.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.fee_authorization_commitment,
        &args.randomness_commitment,
        &args.domain_separator,
    ])
    .to_bytes()
}

pub fn funding_commitment(
    protocol_version: u16,
    registry: &Pubkey,
    reserve_state: &Pubkey,
    asset: &TcapAssetIdV1,
    depositor_authorization: &[u8; 32],
    args: &DepositWithFundingCommitmentArgsV1,
) -> [u8; 32] {
    funding_commitment_for_program(
        &crate::ID,
        protocol_version,
        registry,
        reserve_state,
        asset,
        depositor_authorization,
        args,
    )
}

pub fn funding_commitment_for_program(
    program_id: &Pubkey,
    protocol_version: u16,
    registry: &Pubkey,
    reserve_state: &Pubkey,
    asset: &TcapAssetIdV1,
    depositor_authorization: &[u8; 32],
    args: &DepositWithFundingCommitmentArgsV1,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_COMMITMENT_LABEL_V1,
        program_id.as_ref(),
        &protocol_version.to_le_bytes(),
        registry.as_ref(),
        reserve_state.as_ref(),
        asset.token_program.as_ref(),
        asset.mint.as_ref(),
        &asset.registry_version.to_le_bytes(),
        &asset.asset_commitment,
        &args.amount.to_le_bytes(),
        &[args.settlement_mode],
        &args.destination_commitment,
        depositor_authorization,
        &args.funding_identifier,
        &args.authorization_nonce.to_le_bytes(),
        &args.expires_at_slot.to_le_bytes(),
        &args.fee_authorization_commitment,
        &args.salt,
        &args.domain_separator,
    ])
    .to_bytes()
}

pub fn validate_and_advance_funding_nonce(current: u64, provided: u64) -> Result<u64> {
    require!(
        current == provided,
        TcapError::InvalidFundingAuthorizationNonce
    );
    current
        .checked_add(1)
        .ok_or_else(|| error!(TcapError::ArithmeticOverflow))
}

pub fn next_reserve_funding_accounting(
    actual_assets: u64,
    pending_liabilities: u64,
    amount: u64,
) -> Result<(u64, u64)> {
    let next_actual = actual_assets
        .checked_add(amount)
        .ok_or_else(|| error!(TcapError::ArithmeticOverflow))?;
    let next_pending = pending_liabilities
        .checked_add(amount)
        .ok_or_else(|| error!(TcapError::ArithmeticOverflow))?;
    require!(
        next_actual >= next_pending,
        TcapError::InsolventPendingFunding
    );
    Ok((next_actual, next_pending))
}

pub fn next_funding_sequence(current: u64) -> Result<u64> {
    current
        .checked_add(1)
        .ok_or_else(|| error!(TcapError::ArithmeticOverflow))
}

pub fn empty_funding_root(domain_separator: &[u8; 32], asset_entry: &Pubkey) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_EMPTY_ROOT_LABEL_V1,
        crate::ID.as_ref(),
        domain_separator,
        asset_entry.as_ref(),
    ])
    .to_bytes()
}

pub fn next_funding_root(
    domain_separator: &[u8; 32],
    previous_root: &[u8; 32],
    commitment: &[u8; 32],
    sequence: u64,
) -> [u8; 32] {
    hashv(&[
        TCAP_FUNDING_ROOT_TRANSITION_LABEL_V1,
        crate::ID.as_ref(),
        domain_separator,
        previous_root,
        commitment,
        &sequence.to_le_bytes(),
    ])
    .to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::funding_state::{
        FundingAuthorizationNonceV1, FundingClaimStatusV1, FundingClaimV1, FundingRootV1,
        FundingSettlementModeV1,
    };
    use anchor_lang::{AccountSerialize, Discriminator};
    use anchor_spl::token::ID as SPL_TOKEN_PROGRAM_ID;

    fn args_v2() -> DepositWithFundingCommitmentArgsV2 {
        DepositWithFundingCommitmentArgsV2 {
            amount: 100,
            settlement_mode: 0,
            destination_commitment: [1; 32],
            funding_identifier: [2; 32],
            authorization_nonce: 0,
            expires_at_slot: 99,
            fee_authorization_commitment: [4; 32],
            randomness_commitment: [5; 32],
            domain_separator: [6; 32],
            expected_funding_commitment: [0; 32],
        }
    }

    fn args() -> DepositWithFundingCommitmentArgsV1 {
        DepositWithFundingCommitmentArgsV1 {
            amount: 100,
            settlement_mode: 0,
            destination_commitment: [1; 32],
            funding_identifier: [2; 32],
            authorization_nonce: 0,
            expires_at_slot: 99,
            fee_authorization_commitment: [4; 32],
            salt: [5; 32],
            domain_separator: [6; 32],
            expected_funding_commitment: [0; 32],
        }
    }

    fn asset() -> TcapAssetIdV1 {
        TcapAssetIdV1 {
            token_program: SPL_TOKEN_PROGRAM_ID,
            mint: Pubkey::new_from_array([12; 32]),
            registry_version: 7,
            asset_commitment: [13; 32],
        }
    }

    fn commitment_for(args: &DepositWithFundingCommitmentArgsV1) -> [u8; 32] {
        let depositor = Pubkey::new_from_array([14; 32]);
        let authorization = depositor_authorization_commitment(
            1,
            &depositor,
            &args.funding_identifier,
            args.authorization_nonce,
            args.expires_at_slot,
        );
        funding_commitment(
            1,
            &Pubkey::new_from_array([10; 32]),
            &Pubkey::new_from_array([11; 32]),
            &asset(),
            &authorization,
            args,
        )
    }

    #[test]
    fn canonical_commitment_test_vector_is_stable() {
        assert_eq!(
            commitment_for(&args()),
            [
                0xc4, 0xda, 0x0b, 0x62, 0x68, 0x28, 0xa8, 0xa7, 0xfd, 0x2d, 0xc4, 0x3c, 0xc2, 0xb3,
                0x2c, 0xb0, 0x5b, 0x7d, 0xa0, 0x4b, 0x89, 0x04, 0x1e, 0x1f, 0x56, 0x2b, 0x88, 0x5e,
                0x5e, 0xf1, 0x4c, 0x27,
            ]
        );
        assert_eq!(commitment_for(&args()), commitment_for(&args()));
    }

    #[test]
    fn commitment_changes_when_any_bound_field_changes() {
        let base = args();
        let expected = commitment_for(&base);
        let mutations = [
            DepositWithFundingCommitmentArgsV1 {
                amount: 101,
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                settlement_mode: 1,
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                destination_commitment: [8; 32],
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                funding_identifier: [8; 32],
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                authorization_nonce: 1,
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                expires_at_slot: 100,
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                fee_authorization_commitment: [8; 32],
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                salt: [8; 32],
                ..base
            },
            DepositWithFundingCommitmentArgsV1 {
                domain_separator: [8; 32],
                ..base
            },
        ];
        for mutation in mutations {
            assert_ne!(expected, commitment_for(&mutation));
        }
    }

    #[test]
    fn commitment_binds_program_registry_reserve_token_program_and_asset_identity() {
        let args = args();
        let depositor = Pubkey::new_from_array([14; 32]);
        let authorization = depositor_authorization_commitment(
            1,
            &depositor,
            &args.funding_identifier,
            args.authorization_nonce,
            args.expires_at_slot,
        );
        let registry = Pubkey::new_from_array([10; 32]);
        let reserve = Pubkey::new_from_array([11; 32]);
        let base = funding_commitment(1, &registry, &reserve, &asset(), &authorization, &args);
        assert_ne!(
            base,
            funding_commitment_for_program(
                &Pubkey::new_unique(),
                1,
                &registry,
                &reserve,
                &asset(),
                &authorization,
                &args,
            )
        );
        assert_ne!(
            base,
            funding_commitment(
                1,
                &Pubkey::new_unique(),
                &reserve,
                &asset(),
                &authorization,
                &args
            )
        );
        assert_ne!(
            base,
            funding_commitment(
                1,
                &registry,
                &Pubkey::new_unique(),
                &asset(),
                &authorization,
                &args
            )
        );
        let mut other_asset = asset();
        other_asset.token_program = Pubkey::new_unique();
        assert_ne!(
            base,
            funding_commitment(1, &registry, &reserve, &other_asset, &authorization, &args)
        );
        let mut other_asset = asset();
        other_asset.mint = Pubkey::new_unique();
        assert_ne!(
            base,
            funding_commitment(1, &registry, &reserve, &other_asset, &authorization, &args)
        );
        let mut other_asset = asset();
        other_asset.registry_version += 1;
        assert_ne!(
            base,
            funding_commitment(1, &registry, &reserve, &other_asset, &authorization, &args)
        );
        let mut other_asset = asset();
        other_asset.asset_commitment[0] ^= 1;
        assert_ne!(
            base,
            funding_commitment(1, &registry, &reserve, &other_asset, &authorization, &args)
        );
        let other_authorization = depositor_authorization_commitment(
            1,
            &Pubkey::new_unique(),
            &args.funding_identifier,
            args.authorization_nonce,
            args.expires_at_slot,
        );
        assert_ne!(
            base,
            funding_commitment(
                1,
                &registry,
                &reserve,
                &asset(),
                &other_authorization,
                &args
            )
        );
        assert_ne!(
            base,
            funding_commitment(1, &registry, &reserve, &asset(), &[99; 32], &args)
        );
    }

    #[test]
    fn v2_commitment_binds_governance_and_extension_policy() {
        let args = args_v2();
        let registry = Pubkey::new_from_array([10; 32]);
        let reserve = Pubkey::new_from_array([11; 32]);
        let entry = Pubkey::new_from_array([12; 32]);
        let governance = Pubkey::new_from_array([13; 32]);
        let extensions = Pubkey::new_from_array([14; 32]);
        let depositor = Pubkey::new_from_array([15; 32]);
        let config_hash = [16; 32];
        let authorization = depositor_authorization_commitment_v2(
            1,
            &depositor,
            &entry,
            &args.funding_identifier,
            args.authorization_nonce,
            args.expires_at_slot,
        );
        let base = funding_commitment_v2(
            1,
            &registry,
            &reserve,
            &asset(),
            &governance,
            &extensions,
            1,
            &config_hash,
            &authorization,
            &args,
        );
        assert_ne!(
            base,
            funding_commitment_v2(
                1,
                &registry,
                &reserve,
                &asset(),
                &Pubkey::new_unique(),
                &extensions,
                1,
                &config_hash,
                &authorization,
                &args,
            )
        );
        assert_ne!(
            base,
            funding_commitment_v2(
                1,
                &registry,
                &reserve,
                &asset(),
                &governance,
                &extensions,
                2,
                &config_hash,
                &authorization,
                &args,
            )
        );
        assert_ne!(
            base,
            funding_commitment_v2(
                1,
                &registry,
                &reserve,
                &asset(),
                &governance,
                &extensions,
                1,
                &[17; 32],
                &authorization,
                &args,
            )
        );
        let different_randomness = DepositWithFundingCommitmentArgsV2 {
            randomness_commitment: [18; 32],
            ..args
        };
        assert_ne!(
            base,
            funding_commitment_v2(
                1,
                &registry,
                &reserve,
                &asset(),
                &governance,
                &extensions,
                1,
                &config_hash,
                &authorization,
                &different_randomness,
            )
        );
    }

    #[test]
    fn fixed_width_field_order_is_not_ambiguous() {
        let base = args();
        let mut reordered = base;
        reordered.destination_commitment = base.fee_authorization_commitment;
        reordered.fee_authorization_commitment = base.destination_commitment;
        assert_ne!(commitment_for(&base), commitment_for(&reordered));
    }

    #[test]
    fn settlement_mode_and_nonce_policy_are_strict() {
        assert_eq!(
            FundingSettlementModeV1::try_from(0),
            Ok(FundingSettlementModeV1::ConfidentialOwner)
        );
        assert_eq!(
            FundingSettlementModeV1::try_from(1),
            Ok(FundingSettlementModeV1::PublicWallet)
        );
        assert!(FundingSettlementModeV1::try_from(2).is_err());
        assert_eq!(validate_and_advance_funding_nonce(0, 0).unwrap(), 1);
        assert_eq!(validate_and_advance_funding_nonce(1, 1).unwrap(), 2);
        assert!(validate_and_advance_funding_nonce(1, 0).is_err());
        assert!(validate_and_advance_funding_nonce(1, 2).is_err());
        assert!(validate_and_advance_funding_nonce(u64::MAX, u64::MAX).is_err());
        assert_eq!(next_funding_sequence(0).unwrap(), 1);
        assert!(next_funding_sequence(u64::MAX).is_err());
    }

    #[test]
    fn funding_accounting_preserves_backing_and_rejects_overflow() {
        assert_eq!(
            next_reserve_funding_accounting(0, 0, 100).unwrap(),
            (100, 100)
        );
        assert_eq!(
            next_reserve_funding_accounting(100, 100, 50).unwrap(),
            (150, 150)
        );
        assert_eq!(
            next_reserve_funding_accounting(200, 100, 50).unwrap(),
            (250, 150)
        );
        assert!(next_reserve_funding_accounting(u64::MAX, 0, 1).is_err());
        assert!(next_reserve_funding_accounting(u64::MAX, u64::MAX, 1).is_err());
        assert!(next_reserve_funding_accounting(5, 6, 0).is_err());
    }

    #[test]
    fn root_transition_is_ordered_and_bounded_state() {
        let domain = [21; 32];
        let asset_entry = Pubkey::new_unique();
        let empty = empty_funding_root(&domain, &asset_entry);
        let first = next_funding_root(&domain, &empty, &[22; 32], 1);
        let second = next_funding_root(&domain, &first, &[23; 32], 2);
        assert_ne!(empty, first);
        assert_ne!(first, second);
        assert_ne!(second, next_funding_root(&domain, &empty, &[23; 32], 2));
    }

    #[test]
    fn funding_account_allocations_match_serialized_layouts() {
        assert_eq!(
            FundingClaimV1::DISCRIMINATOR,
            [0xa1, 0x9f, 0x0c, 0xe3, 0xc6, 0x69, 0xbb, 0xd9]
        );
        assert_eq!(
            FundingRootV1::DISCRIMINATOR,
            [0x97, 0x20, 0xdb, 0x8f, 0x59, 0xce, 0xfb, 0xc5]
        );
        assert_eq!(
            FundingAuthorizationNonceV1::DISCRIMINATOR,
            [0xa4, 0x11, 0x65, 0xc7, 0x50, 0x3d, 0x67, 0x01]
        );

        let record = FundingClaimV1 {
            version: 1,
            protocol_version: 1,
            config: Pubkey::new_unique(),
            asset_entry: Pubkey::new_unique(),
            reserve_state: Pubkey::new_unique(),
            funding_identifier: [1; 32],
            funding_commitment: [2; 32],
            amount: 100,
            settlement_mode: FundingSettlementModeV1::ConfidentialOwner,
            destination_commitment: [3; 32],
            depositor_authorization_commitment: [4; 32],
            authorization_nonce: 0,
            expires_at_slot: 99,
            fee_authorization_commitment: [5; 32],
            domain_separator: [6; 32],
            funding_root_sequence: 1,
            status: FundingClaimStatusV1::Pending,
            bump: 255,
        };
        let root = FundingRootV1 {
            version: 1,
            protocol_version: 1,
            asset_entry: Pubkey::new_unique(),
            current_root: [1; 32],
            previous_root: [2; 32],
            sequence: 1,
            bump: 254,
        };
        let nonce = FundingAuthorizationNonceV1 {
            version: 1,
            asset_entry: Pubkey::new_unique(),
            depositor: Pubkey::new_unique(),
            next_nonce: 1,
            last_funding_claim: Pubkey::new_unique(),
            bump: 253,
        };
        for (expected, serialize) in [
            (FundingClaimV1::SPACE, serialize_account(&record)),
            (FundingRootV1::SPACE, serialize_account(&root)),
            (
                FundingAuthorizationNonceV1::SPACE,
                serialize_account(&nonce),
            ),
        ] {
            assert_eq!(serialize.len(), expected);
        }
    }

    fn serialize_account<T: AccountSerialize>(account: &T) -> Vec<u8> {
        let mut bytes = Vec::new();
        account.try_serialize(&mut bytes).unwrap();
        bytes
    }
}
