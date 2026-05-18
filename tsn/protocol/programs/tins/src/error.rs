use anchor_lang::error_code;

#[error_code]
pub enum TinsError {
    /// TIN generation rate limit exceeded
    #[msg("TIN rate limit exceeded")]
    RateLimitExceeded,
    
    /// Invalid TIN format (fails Luhn check)
    #[msg("Invalid TIN format")]
    InvalidTinFormat,
    
    /// Display name contains invalid characters
    #[msg("Invalid display name")]
    InvalidDisplayName,
    
    /// Display name too long (max 32 chars)
    #[msg("Display name too long")]
    DisplayNameTooLong,
    
    /// Account already exists
    #[msg("Identity already exists")]
    IdentityAlreadyExists,
    
    /// Account does not exist
    #[msg("Identity not found")]
    IdentityNotFound,
    
    /// Identity is frozen
    #[msg("Identity is frozen")]
    IdentityFrozen,
    
    /// Unauthorized - not the owner
    #[msg("Unauthorized")]
    Unauthorized,
    
    /// Invalid signature
    #[msg("Invalid signature")]
    InvalidSignature,
    
    /// Linked identity already in use
    #[msg("Linked identity already in use")]
    LinkedIdentityInUse,
    
    /// Entropy too small (min 32 bytes)
    #[msg("Insufficient entropy")]
    InsufficientEntropy,
    
    /// Program ID mismatch
    #[msg("Invalid program ID")]
    InvalidProgramId,
}