# TSN SDK

The TSN SDK is the application interface to the Transfer Settlement Network.

## What Is This?

Apps and services use this SDK to interact with TSN.

The SDK should be the place where TSN transaction construction, PDA derivation, authorization helpers, quote helpers, and settlement calls live.

## Why It Exists

Frontend apps should not need to understand TSN internals.

They should call SDK methods instead of manually building instructions or deriving program accounts.

## Responsibilities

- Resolve TSN routes.
- Build TSN transactions and instructions.
- Derive TSN PDAs.
- Create payment authorization payloads.
- Submit mempool work.
- Read settlement status.
- Support TIP resolution where TSN needs identity context.
- Expose safe helpers for Cranker and backend services.

## Important Rules

- Do not move TSN transaction-building logic into React components.
- Do not expose private settlement payloads in logs.
- Keep browser-safe and server-only APIs clearly separated.
- Rebuild the SDK after changing source files.

## Development

```bash
npm --prefix tsn-sdk install
npm --prefix tsn-sdk run build
```

## Related Docs

- `docs/TSN-COMMITMENT-SETTLEMENT.md`
- `docs/INTEGRATION.md`
- `docs/CRANKER.md`

## Live GPRU/TCap balance path

The SDK exports GPRU derivation and authorization helpers only. GPRU never
holds funds. TCap owns the credit tip and the owner-encrypted snapshot; a
private read fetches the current commitment once, loads one encrypted envelope,
and verifies the sequence/hash locally. No PRU enumeration or balance planner
is part of the public SDK.

TIP/TIN registry awareness: the live route stores only privacy-root,
relationship, and policy commitments. GPRU is authorization/routing only;
TCap encrypted snapshots are the private balance record. No PRU array or
receiving-wallet inventory is created for the live route.

## Recurring Mandates (Planned, Disabled)

The SDK includes a disabled foundation for recurring mandate contracts and verified provider validation.

- Recurring mandates are currently blocked by feature flags and fail closed by default.
- No production payment path should consume or execute recurring mandates in this repository.
- TSN_TEST_PROVIDER is only permitted on Devnet and is rejected on mainnet-beta.
- Recurring mandate state must reference only commitments, not subscriber TINs, wallet addresses, or ZK-PRU secrets.
- Verified providers must be ACTIVE, recurring enabled, and support the requested token mint.
- A mock Devnet-only provider fixture exists for tests and development only.

This folder is intentionally isolated from the main TSN payment execution path:

- `src/recurring` contains mandate serialization and validation helpers.
- The recurring feature remains disabled by default.
- No token transfer or delegate approval logic is implemented in this foundation.
