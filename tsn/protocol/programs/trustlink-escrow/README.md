# TrustLink Escrow Program

Anchor-based Solana escrow program for TrustLink payments sent to WhatsApp identities.

## Security model

- Funds are held in SPL token vault accounts controlled by PDA authority.
- There is no instruction that lets the deployer or a treasury withdraw funds.
- Payments are immutable after creation:
  - sender cannot change
  - amount cannot change
  - token mint cannot change
  - receiver phone hash cannot change
- Claim can only happen while the payment is `Pending`.
- Claim and refund paths are mutually exclusive through permanent status changes.

## Important trust boundary

TrustLink verifies WhatsApp/OTP identity off-chain.

The on-chain program therefore uses a `claim_verifier` signer recorded in the config PDA.
That verifier can authorize claim execution, but it still cannot withdraw escrow funds arbitrarily because:

- there is no admin-withdraw instruction
- funds can only move to:
  - the receiver token account through `claim_payment`
  - the sender refund token account through `cancel_payment` or `expire_payment`

## Deployer safety

After deployment, revoke the upgrade authority.

If upgrade authority is not revoked, the deployer could still replace the program code later.

For TrustLink to be fully non-custodial in practice:

1. deploy program
2. initialize config once with the verifier pubkey
3. revoke upgrade authority permanently

## Instructions

- `initialize_config`
- `create_payment`
- `claim_payment`
- `cancel_payment`
- `expire_payment`

## PDA layout

- `config`: `["config"]`
- `payment_account`: `["payment", payment_id]`
- `vault_authority`: `["vault_authority", payment_id]`

## Accounts

### EscrowConfig

- `claim_verifier`
- `bump`
- `initialized_at`

### PaymentAccount

- `payment_id`
- `sender_pubkey`
- `receiver_phone_hash`
- `token_mint`
- `amount`
- `created_at`
- `expiry_ts`
- `status`
- `payment_bump`
- `vault_authority_bump`

## Test coverage scaffold

The Anchor test suite includes the intended lifecycle checks for:

- config initialization
- payment creation and vault funding
- successful claim
- double-claim prevention
- cancel after expiry
- expire and refund
