use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{self, MintTo, ID as TOKEN_2022_PROGRAM_ID};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_program::program_option::COption;

declare_id!("E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h");

pub const FAUCET_VERSION_V1: u16 = 1;
pub const STABLE_TCAP_DECIMALS: u8 = 6;
pub const MIN_REQUEST_BASE_UNITS: u64 = 10_000;
pub const MAX_REQUEST_BASE_UNITS: u64 = 1_000_000_000_000;
pub const DEFAULT_COOLDOWN_SLOTS: u64 = 1;
pub const FAUCET_STATE_SEED: &[u8] = b"stable-tcap:faucet:v1";
pub const MINT_AUTHORITY_SEED: &[u8] = b"stable-tcap:mint-authority:v1";
pub const WALLET_STATE_SEED: &[u8] = b"stable-tcap:wallet:v1";
pub const REQUEST_RECEIPT_SEED: &[u8] = b"stable-tcap:request:v1";

#[program]
pub mod stable_tcap_faucet {
    use super::*;

    pub fn initialize_faucet_v1(ctx: Context<InitializeFaucetV1>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            TOKEN_2022_PROGRAM_ID,
            FaucetError::InvalidTokenProgram
        );
        require!(
            ctx.accounts.mint.decimals == STABLE_TCAP_DECIMALS,
            FaucetError::InvalidMintDecimals
        );
        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.mint_authority.key()),
            FaucetError::InvalidMintAuthority
        );

        let faucet = &mut ctx.accounts.faucet;
        faucet.version = FAUCET_VERSION_V1;
        faucet.admin = ctx.accounts.admin.key();
        faucet.mint = ctx.accounts.mint.key();
        faucet.token_program = ctx.accounts.token_program.key();
        faucet.minimum_request_amount = MIN_REQUEST_BASE_UNITS;
        faucet.maximum_request_amount = MAX_REQUEST_BASE_UNITS;
        faucet.cooldown_slots = DEFAULT_COOLDOWN_SLOTS;
        faucet.total_minted = 0;
        faucet.request_count = 0;
        faucet.paused = false;
        faucet.bump = ctx.bumps.faucet;
        faucet.mint_authority_bump = ctx.bumps.mint_authority;

        emit!(FaucetInitializedV1 {
            version: FAUCET_VERSION_V1,
            faucet: faucet.key(),
            mint: faucet.mint,
            mint_authority: ctx.accounts.mint_authority.key(),
            minimum_request_amount: faucet.minimum_request_amount,
            maximum_request_amount: faucet.maximum_request_amount,
            cooldown_slots: faucet.cooldown_slots,
        });
        Ok(())
    }

    pub fn request_tokens_v1(
        ctx: Context<RequestTokensV1>,
        request_id: [u8; 32],
        amount: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(request_id != [0; 32], FaucetError::InvalidRequestId);
        validate_request_amount(amount)?;

        let faucet_key = ctx.accounts.faucet.key();
        let faucet_mint = ctx.accounts.faucet.mint;
        let minimum_request_amount = ctx.accounts.faucet.minimum_request_amount;
        let maximum_request_amount = ctx.accounts.faucet.maximum_request_amount;
        let cooldown_slots = ctx.accounts.faucet.cooldown_slots;
        let mint_authority_bump = ctx.accounts.faucet.mint_authority_bump;
        let current_total_minted = ctx.accounts.faucet.total_minted;
        let current_request_count = ctx.accounts.faucet.request_count;

        require!(!ctx.accounts.faucet.paused, FaucetError::FaucetPaused);
        require!(
            amount >= minimum_request_amount,
            FaucetError::AmountBelowMinimum
        );
        require!(
            amount <= maximum_request_amount,
            FaucetError::AmountAboveMaximum
        );
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            TOKEN_2022_PROGRAM_ID,
            FaucetError::InvalidTokenProgram
        );
        require_keys_eq!(
            ctx.accounts.mint.key(),
            faucet_mint,
            FaucetError::InvalidMint
        );

        let clock = Clock::get()?;
        let wallet_state = &ctx.accounts.wallet_state;
        if wallet_state.version != 0 {
            require!(
                wallet_state.version == FAUCET_VERSION_V1
                    && wallet_state.wallet == ctx.accounts.requester.key()
                    && wallet_state.faucet == faucet_key,
                FaucetError::InvalidWalletState
            );
            require!(nonce == wallet_state.next_nonce, FaucetError::InvalidNonce);
            let earliest_slot = wallet_state
                .last_request_slot
                .checked_add(cooldown_slots)
                .ok_or(FaucetError::ArithmeticOverflow)?;
            require!(clock.slot >= earliest_slot, FaucetError::CooldownActive);
        } else {
            require!(nonce == 0, FaucetError::InvalidNonce);
        }

        let next_nonce = nonce
            .checked_add(1)
            .ok_or(FaucetError::ArithmeticOverflow)?;
        let next_total_minted = current_total_minted
            .checked_add(amount)
            .ok_or(FaucetError::ArithmeticOverflow)?;
        let next_request_count = current_request_count
            .checked_add(1)
            .ok_or(FaucetError::ArithmeticOverflow)?;

        let authority_bump = [mint_authority_bump];
        let signer_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &authority_bump];
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;

        let wallet_state = &mut ctx.accounts.wallet_state;
        wallet_state.version = FAUCET_VERSION_V1;
        wallet_state.faucet = faucet_key;
        wallet_state.wallet = ctx.accounts.requester.key();
        wallet_state.next_nonce = next_nonce;
        wallet_state.last_request_slot = clock.slot;
        wallet_state.total_minted = wallet_state
            .total_minted
            .checked_add(amount)
            .ok_or(FaucetError::ArithmeticOverflow)?;
        wallet_state.bump = ctx.bumps.wallet_state;

        let receipt = &mut ctx.accounts.receipt;
        receipt.version = FAUCET_VERSION_V1;
        receipt.faucet = faucet_key;
        receipt.wallet = ctx.accounts.requester.key();
        receipt.request_id = request_id;
        receipt.amount = amount;
        receipt.nonce = nonce;
        receipt.executed_slot = clock.slot;
        receipt.status = FaucetRequestStatusV1::Minted;
        receipt.bump = ctx.bumps.receipt;

        let faucet = &mut ctx.accounts.faucet;
        faucet.total_minted = next_total_minted;
        faucet.request_count = next_request_count;

        emit!(StableTcapMintedV1 {
            version: FAUCET_VERSION_V1,
            faucet: faucet.key(),
            mint: faucet.mint,
            wallet: ctx.accounts.requester.key(),
            recipient_token_account: ctx.accounts.recipient_token_account.key(),
            receipt: receipt.key(),
            request_id,
            amount,
            nonce,
            executed_slot: clock.slot,
        });
        Ok(())
    }

    pub fn set_faucet_paused_v1(ctx: Context<SetFaucetPausedV1>, paused: bool) -> Result<()> {
        ctx.accounts.faucet.paused = paused;
        emit!(FaucetPauseChangedV1 {
            version: FAUCET_VERSION_V1,
            faucet: ctx.accounts.faucet.key(),
            paused,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeFaucetV1<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = FaucetStateV1::SPACE,
        seeds = [FAUCET_STATE_SEED],
        bump
    )]
    pub faucet: Account<'info, FaucetStateV1>,
    #[account(
        constraint = *mint.to_account_info().owner == token_program.key() @ FaucetError::InvalidTokenProgram
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA checked by seeds and used only as Token-2022 mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: [u8; 32])]
pub struct RequestTokensV1<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    #[account(
        mut,
        seeds = [FAUCET_STATE_SEED],
        bump = faucet.bump,
        constraint = faucet.version == FAUCET_VERSION_V1 @ FaucetError::InvalidFaucet,
        constraint = faucet.token_program == token_program.key() @ FaucetError::InvalidTokenProgram
    )]
    pub faucet: Account<'info, FaucetStateV1>,
    #[account(
        init_if_needed,
        payer = requester,
        space = FaucetWalletStateV1::SPACE,
        seeds = [WALLET_STATE_SEED, requester.key().as_ref()],
        bump
    )]
    pub wallet_state: Account<'info, FaucetWalletStateV1>,
    #[account(
        init,
        payer = requester,
        space = FaucetRequestReceiptV1::SPACE,
        seeds = [REQUEST_RECEIPT_SEED, requester.key().as_ref(), request_id.as_ref()],
        bump
    )]
    pub receipt: Account<'info, FaucetRequestReceiptV1>,
    #[account(mut, address = faucet.mint @ FaucetError::InvalidMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = requester,
        associated_token::mint = mint,
        associated_token::authority = requester,
        associated_token::token_program = token_program
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA checked by seeds and used only to sign the Token-2022 CPI.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = faucet.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFaucetPausedV1<'info> {
    #[account(address = faucet.admin @ FaucetError::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [FAUCET_STATE_SEED], bump = faucet.bump)]
    pub faucet: Account<'info, FaucetStateV1>,
}

#[account]
pub struct FaucetStateV1 {
    pub version: u16,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub minimum_request_amount: u64,
    pub maximum_request_amount: u64,
    pub cooldown_slots: u64,
    pub total_minted: u64,
    pub request_count: u64,
    pub paused: bool,
    pub bump: u8,
    pub mint_authority_bump: u8,
}

impl FaucetStateV1 {
    pub const SPACE: usize = 8 + 2 + (32 * 3) + (8 * 5) + 1 + 1 + 1;
}

#[account]
pub struct FaucetWalletStateV1 {
    pub version: u16,
    pub faucet: Pubkey,
    pub wallet: Pubkey,
    pub next_nonce: u64,
    pub last_request_slot: u64,
    pub total_minted: u64,
    pub bump: u8,
}

impl FaucetWalletStateV1 {
    pub const SPACE: usize = 8 + 2 + (32 * 2) + (8 * 3) + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaucetRequestStatusV1 {
    Minted,
}

#[account]
pub struct FaucetRequestReceiptV1 {
    pub version: u16,
    pub faucet: Pubkey,
    pub wallet: Pubkey,
    pub request_id: [u8; 32],
    pub amount: u64,
    pub nonce: u64,
    pub executed_slot: u64,
    pub status: FaucetRequestStatusV1,
    pub bump: u8,
}

impl FaucetRequestReceiptV1 {
    pub const SPACE: usize = 8 + 2 + (32 * 3) + (8 * 3) + 1 + 1;
}

#[event]
pub struct FaucetInitializedV1 {
    pub version: u16,
    pub faucet: Pubkey,
    pub mint: Pubkey,
    pub mint_authority: Pubkey,
    pub minimum_request_amount: u64,
    pub maximum_request_amount: u64,
    pub cooldown_slots: u64,
}

#[event]
pub struct StableTcapMintedV1 {
    pub version: u16,
    pub faucet: Pubkey,
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub recipient_token_account: Pubkey,
    pub receipt: Pubkey,
    pub request_id: [u8; 32],
    pub amount: u64,
    pub nonce: u64,
    pub executed_slot: u64,
}

#[event]
pub struct FaucetPauseChangedV1 {
    pub version: u16,
    pub faucet: Pubkey,
    pub paused: bool,
}

#[error_code]
pub enum FaucetError {
    #[msg("The faucet request amount is below 0.01 STCAP.")]
    AmountBelowMinimum,
    #[msg("The faucet request amount exceeds 1,000,000 STCAP.")]
    AmountAboveMaximum,
    #[msg("The request identifier must not be empty.")]
    InvalidRequestId,
    #[msg("The request nonce is stale, duplicated, or skipped.")]
    InvalidNonce,
    #[msg("The wallet faucet state is invalid.")]
    InvalidWalletState,
    #[msg("The faucet cooldown has not elapsed.")]
    CooldownActive,
    #[msg("The faucet is paused.")]
    FaucetPaused,
    #[msg("The faucet state is invalid.")]
    InvalidFaucet,
    #[msg("The Stable-TCAP mint is invalid.")]
    InvalidMint,
    #[msg("The Stable-TCAP mint authority is invalid.")]
    InvalidMintAuthority,
    #[msg("The token program must be Token-2022.")]
    InvalidTokenProgram,
    #[msg("Stable-TCAP must use six decimals.")]
    InvalidMintDecimals,
    #[msg("Only the faucet administrator may perform this action.")]
    InvalidAdmin,
    #[msg("An arithmetic operation overflowed.")]
    ArithmeticOverflow,
}

fn validate_request_amount(amount: u64) -> Result<()> {
    require!(
        amount >= MIN_REQUEST_BASE_UNITS,
        FaucetError::AmountBelowMinimum
    );
    require!(
        amount <= MAX_REQUEST_BASE_UNITS,
        FaucetError::AmountAboveMaximum
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_limits_are_exact() {
        assert_eq!(MIN_REQUEST_BASE_UNITS, 10_000);
        assert_eq!(MAX_REQUEST_BASE_UNITS, 1_000_000_000_000);
        assert!(validate_request_amount(MIN_REQUEST_BASE_UNITS).is_ok());
        assert!(validate_request_amount(MAX_REQUEST_BASE_UNITS).is_ok());
        assert!(validate_request_amount(0).is_err());
        assert!(validate_request_amount(MIN_REQUEST_BASE_UNITS - 1).is_err());
        assert!(validate_request_amount(MAX_REQUEST_BASE_UNITS + 1).is_err());
    }

    #[test]
    fn account_allocations_cover_serialized_state() {
        let faucet = FaucetStateV1 {
            version: 1,
            admin: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            token_program: TOKEN_2022_PROGRAM_ID,
            minimum_request_amount: MIN_REQUEST_BASE_UNITS,
            maximum_request_amount: MAX_REQUEST_BASE_UNITS,
            cooldown_slots: 1,
            total_minted: 0,
            request_count: 0,
            paused: false,
            bump: 1,
            mint_authority_bump: 2,
        };
        let wallet = FaucetWalletStateV1 {
            version: 1,
            faucet: Pubkey::new_unique(),
            wallet: Pubkey::new_unique(),
            next_nonce: 0,
            last_request_slot: 0,
            total_minted: 0,
            bump: 1,
        };
        let receipt = FaucetRequestReceiptV1 {
            version: 1,
            faucet: Pubkey::new_unique(),
            wallet: Pubkey::new_unique(),
            request_id: [7; 32],
            amount: MIN_REQUEST_BASE_UNITS,
            nonce: 0,
            executed_slot: 1,
            status: FaucetRequestStatusV1::Minted,
            bump: 1,
        };
        assert!(8 + faucet.try_to_vec().unwrap().len() <= FaucetStateV1::SPACE);
        assert!(8 + wallet.try_to_vec().unwrap().len() <= FaucetWalletStateV1::SPACE);
        assert!(8 + receipt.try_to_vec().unwrap().len() <= FaucetRequestReceiptV1::SPACE);
    }

    #[test]
    fn faucet_domains_are_distinct() {
        assert_ne!(FAUCET_STATE_SEED, MINT_AUTHORITY_SEED);
        assert_ne!(WALLET_STATE_SEED, REQUEST_RECEIPT_SEED);
        let (authority, _) = Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], &crate::ID);
        let (state, _) = Pubkey::find_program_address(&[FAUCET_STATE_SEED], &crate::ID);
        assert_ne!(authority, state);
    }
}
