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
}
