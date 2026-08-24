use anchor_lang::prelude::*;

#[error_code]
pub enum TcapError {
    #[msg("The configured TSN program is invalid")]
    InvalidTsnProgram,
    #[msg("The authority is not permitted to perform this operation")]
    InvalidAuthority,
    #[msg("The supplied account is not the canonical TCAP PDA")]
    InvalidPda,
    #[msg("TCAP is paused")]
    ProtocolPaused,
    #[msg("The asset is paused or deprecated")]
    AssetUnavailable,
    #[msg("The asset mint owner does not match its token program")]
    InvalidTokenProgram,
    #[msg("The supplied commitment must not be empty")]
    EmptyCommitment,
    #[msg("The reserve relationship is not canonical")]
    InvalidReserve,
    #[msg("The TSN authorization signer is invalid")]
    InvalidTsnAuthorizationSigner,
    #[msg("The TSN epoch record owner or layout is invalid")]
    InvalidTsnEpochRecord,
    #[msg("The TSN epoch root does not match the authorization")]
    WrongEpochRoot,
    #[msg("The TCAP root does not match the authorization")]
    WrongTcapRoot,
    #[msg("The authorization is outside its valid slot window")]
    AuthorizationExpired,
    #[msg("The authorization is not for this asset")]
    WrongAsset,
    #[msg("Proof-dependent transitions remain disabled in Phase 3")]
    ProofVerifierDisabled,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("The deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("The reserve vault is not initialized")]
    ReserveVaultUnavailable,
    #[msg("The source token account is not controlled by the depositor")]
    InvalidDepositSource,
    #[msg("The funding settlement mode is unsupported")]
    InvalidSettlementMode,
    #[msg("The funding authorization has expired")]
    FundingAuthorizationExpired,
    #[msg("The funding domain separator is invalid")]
    InvalidFundingDomain,
    #[msg("The supplied funding commitment does not match the authorized fields")]
    FundingCommitmentMismatch,
    #[msg("The funding root relationship is invalid")]
    InvalidFundingRoot,
    #[msg("The reserve cannot cover its pending funding liabilities")]
    InsolventPendingFunding,
    #[msg("The public funding authorization nonce is stale or skipped")]
    InvalidFundingAuthorizationNonce,
    #[msg("The asset approval state does not permit this operation")]
    AssetNotApproved,
    #[msg("The asset operational state does not permit this operation")]
    InvalidAssetOperationalStatus,
    #[msg("A deprecated asset cannot be reactivated without a governed migration")]
    DeprecatedAssetImmutable,
    #[msg("The required reserve state has not been initialized")]
    ReserveNotInitialized,
    #[msg("The canonical reserve vault has not been initialized")]
    VaultNotInitialized,
    #[msg("The mint contains a Token-2022 extension that TCAP does not support")]
    UnsupportedTokenExtension,
    #[msg("The mint extension configuration no longer matches the governed policy")]
    ExtensionPolicyMismatch,
    #[msg("The mint decimals do not match the governed asset configuration")]
    InvalidMintDecimals,
    #[msg("The current TCAP deployment does not implement settlement for this asset")]
    SettlementNotImplemented,
    #[msg("The governed asset policy relationship is invalid")]
    InvalidAssetPolicy,
    #[msg("The mint authority does not match the governed configuration")]
    InvalidMintAuthority,
    #[msg("The mint freeze authority does not match the governed configuration")]
    InvalidFreezeAuthority,
    #[msg("This legacy asset instruction is disabled by the irreversible V2 migration gate")]
    LegacyInstructionDisabled,
    #[msg("The requested minimum instruction version is invalid or would move backwards")]
    InvalidInstructionVersion,
    #[msg("The token transfer did not produce the exact governed reserve-vault balance change")]
    UnexpectedTokenBalanceDelta,
    #[msg("The requested mint profile does not match the governed extension policy")]
    InvalidMintProfile,
    #[msg("The tip transition sequence is invalid")]
    InvalidTipSequence,
    #[msg("The tip commitment does not match the authorized transition")]
    TipCommitmentMismatch,
    #[msg("The tip is frozen")]
    TipFrozen,
    #[msg("The transition nullifier has already been consumed")]
    NullifierAlreadyConsumed,
    #[msg("The transition authorization is not scoped to this tip")]
    InvalidTipAuthorization,
    #[msg("The GPRU authorization scope is empty or mismatched")]
    InvalidGpruScope,
    #[msg("A proof payload is required for confidential debit or exit")]
    ProofPayloadRequired,
    #[msg("Confidential debit/exit proof system not enabled")]
    ProofSystemNotEnabled,
    #[msg("The registered conversion rate is invalid")]
    InvalidRateVersion,
}
