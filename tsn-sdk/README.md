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
- Support TINS resolution where TSN needs identity context.
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

- deterministic PRU derivation from `master_seed + TIN + token_mint + index`;
- privacy level PRU counts: L1=3, L2=10, L3=30, L4=100;
- replayable allocation with no randomness;
- unified 3-state TIN balance: `AVAILABLE + SETTLED - PENDING`;
- deterministic spend selection and sweep planning.

```ts
import { derivePruSet, allocatePrusDeterministically } from "@trustlink/tsn-sdk/pru";

const pruSet = derivePruSet({ masterSeed, tinId, tokenMint, privacyLevel: 2 });
const distribution = allocatePrusDeterministically({ txId, tinId, tokenMint, pruSet, amount });
```

The SDK is a validation and construction layer, not the sole authority of truth. Outputs are replayed against TSN on-chain commitments and TINS registry state.

TINS registry awareness: TINS does not store PRU arrays. The TINS create flow receives the privacy level and PRU configuration commitment, while this TSN SDK derives the actual PRU set off-chain and replays it against that commitment.
