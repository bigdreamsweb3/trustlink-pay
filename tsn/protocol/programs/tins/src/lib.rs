//! TINS - TrustLink Identity Number System
//! 
//! On-chain identity program that provides:
//! - Secure, non-sequential TIN generation (HMAC-based)
//! - Privacy keys (derived from main wallet)
//! - Display names for anti-scam verification
//! - Rate limiting to prevent enumeration attacks

pub mod contexts;
pub mod error;
pub mod instructions;
pub mod state;

use contexts::*;
use instructions::*;
use state::*;

// Program ID - replace with actual deployed ID
declare_id!("TINS111111111111111111111111111111111111");

#[program]
pub mod tins {
    use super::*;

    /// Initialize global config (called once by authority)
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_recipient: Pubkey,
        registration_fee: u64,
    ) -> Result<()> {
        instructions::initialize_config(ctx, fee_recipient, registration_fee)
    }

    /// Register new TIN with secure generation
    pub fn register_tin(
        ctx: Context<RegisterTin>,
        args: RegisterTinArgs,
    ) -> Result<()> {
        instructions::register_tin(ctx, args)
    }

    /// Update display name
    pub fn update_display_name(
        ctx: Context<UpdateDisplayName>,
        new_name: String,
    ) -> Result<()> {
        instructions::update_display_name(ctx, new_name)
    }

    /// Freeze or unfreeze identity
    pub fn set_frozen(
        ctx: Context<SetFrozen>,
        frozen: bool,
    ) -> Result<()> {
        instructions::set_frozen(ctx, frozen)
    }

    /// Verify linked identity (phone/social)
    pub fn verify_linked_identity(
        ctx: Context<VerifyLinkedIdentity>,
    ) -> Result<()> {
        instructions::verify_linked_identity(ctx)
    }
}