# TrustLink

TrustLink is a phone-first payment app built on Solana. It lets people send and receive stablecoin payments using a familiar identity flow instead of copying long wallet addresses for every transaction.

The current project combines:

- a Solana escrow program in [backend/programs/trustlink-escrow/src/lib.rs](/C:/Users/codepara/Desktop/trust-link/backend/programs/trustlink-escrow/src/lib.rs)
- backend payment, wallet, and identity services in [backend/app](/C:/Users/codepara/Desktop/trust-link/backend/app)
- a mobile-style frontend in [frontend/src](/C:/Users/codepara/Desktop/trust-link/frontend/src)

## Product Direction

TrustLink is focused on making everyday crypto payments feel simpler and safer:

- send money using phone-based identity flows
- connect a wallet when receiving payments
- bind a main wallet to the account after first secure receipt
- optionally add a backup wallet later
- support account lock and recovery flows without forcing that setup during onboarding

## Repository Structure

- [backend](/C:/Users/codepara/Desktop/trust-link/backend): Anchor program, API routes, payment services, and Solana integration
- [frontend](/C:/Users/codepara/Desktop/trust-link/frontend): Next.js application and user experience flows
- [docs](/C:/Users/codepara/Desktop/trust-link/docs): project notes, design docs, and testing references

## Current Notes

- This repo uses a TrustLink-branded product and program flow.
- Older experiment branding has been removed from the documentation.
- The active work now lives directly under the TrustLink name.
