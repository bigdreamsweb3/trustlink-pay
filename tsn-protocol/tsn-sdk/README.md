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

## TSN V1 PRU deterministic settlement helpers

The SDK exports `@trustlink/tsn-sdk/pru` and root exports for the TSN V1 PRU model:

- token-agnostic PRU derivation from `master_seed + TIN + index`;
- every TIN receives 30 PRUs by default, regardless of token;
- replayable deterministic receive allocation per token;
- unified 3-state TIN balance: `AVAILABLE + SETTLED - PENDING`;
- randomized spend signing plus deterministic spend/sweep planning;
- lazy ATA creation planning with protocol subsidy before activation fees.

```ts
import { derivePruSet, allocatePrusDeterministically } from "@trustlink/tsn-sdk/pru";

const pruSet = derivePruSet({ masterSeed, tinId });
const distribution = allocatePrusDeterministically({ txId, tinId, tokenMint, pruSet, amount });
```

The SDK is a validation and construction layer, not the sole authority of truth. Outputs are replayed against TSN on-chain commitments and TIP registry state.

TIP registry awareness: TIP does not store PRU arrays. Every TIN receives exactly 30 token-agnostic PRUs, and TIP stores the PRU configuration commitment produced by the TSN mempool and cranker layer.

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

