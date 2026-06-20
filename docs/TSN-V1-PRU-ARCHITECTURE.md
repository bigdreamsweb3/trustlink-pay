# TSN V1 — Deterministic PRU Privacy Settlement Network

Version: TSN V1 production architecture rewrite
Commit reference: current branch worktree

## Summary

TSN V1 replaces RPDA-style routing with deterministic PRU settlement. A TIN remains the root identity layer, while token-bound Privacy Receiving Units (PRUs) become the execution endpoints used by TSN. The Cranker is stateless: it receives transaction inputs, computes the same allocation every verifier can replay, and executes the result without storing routing state or introducing randomness.

## Core model

### TIN identity layer

A TIN stores only owner wallet mapping, privacy level, encryption metadata commitment, and PRU configuration commitment hash. TINS does not store PRU lists, balances, private keys, or derivation seeds.

TINS is aware of PRUs through commitments, not enumeration. During TIN creation, the SDK derives the token-bound PRU plan off-chain, computes a `pru_configuration_hash`, and submits that hash plus the privacy level to the TINS registry. That gives TSN and Crankers a replay target without making the full PRU set public on-chain.

### PRU execution endpoint

A PRU is:

```ts
{
  tin_id,
  token_mint,
  index,
  derived_public_key,
  encrypted_metadata,
  state
}
```

PRUs are pre-bound to one token mint, created as planned registry entries during TIN creation, derived off-chain only, and treated as TSN execution endpoints rather than user-facing wallets.

### Privacy levels

| Privacy level | PRUs per token | Meaning |
| --- | ---: | --- |
| Level 1 | 3 | Basic daily fragmentation |
| Level 2 | 10 | Higher entropy for normal app use |
| Level 3 | 30 | Merchant or heavy daily use |
| Level 4 | 100+ | Maximum configured entropy capacity |

The SDK currently exposes Level 4 as 100 deterministic PRUs and can be extended upward by protocol configuration without randomness.

## Deterministic settlement allocation

Receiving flow:

1. Cranker detects a TSN transaction.
2. Cranker receives `tx_id`, `TIN`, `token_mint`, and `PRU_set`.
3. Cranker computes `seed = hash(tx_id + TIN + token_mint)`.
4. Cranker computes `distribution = F(seed, PRU_set)`.
5. TSN splits funds exactly according to the deterministic output.

Rules:

- Same input always produces the same output.
- Total distributed amount equals the input amount.
- No stochastic behavior is allowed in settlement logic.
- Replay verification uses the SDK and on-chain commitment hashes, not SDK trust alone.

## PRU lifecycle

Each PRU moves through:

- `PLANNED`: exists in the registry commitment.
- `ACTIVE`: token account exists.
- `USED`: PRU has received funds.
- `SWEPT`: funds were consolidated back to the main TIN owner route.

## 3-state accounting

TSN balance states are:

- `AVAILABLE`
- `PENDING`
- `SETTLED`

Unified TIN balance is:

```text
TIN Balance = AVAILABLE + SETTLED - PENDING
```

The frontend and SDK must show only TINS-governed balance abstractions or masked representations. Raw wallet addresses and raw PRU balances are not public UI objects.

## Implementation notes

### TypeScript SDK

The TINS SDK accepts `privacyLevel`, `encryptedMetadataHash`, and `pruConfigurationHash` when creating a TIN. The TSN SDK adds `pru.ts` with deterministic helpers for:

- privacy tier PRU counts;
- off-chain PRU public key derivation using `master_seed + TIN + token_mint + index`;
- PRU configuration commitment hashing;
- deterministic receive allocation;
- unified 3-state TIN balance calculation;
- deterministic spend selection;
- sweep planning.

Example:

```ts
import {
  derivePruSet,
  allocatePrusDeterministically,
  computeTinBalance,
} from "@trustlink/tsn-sdk/pru";

const prus = derivePruSet({
  masterSeed,
  tinId: "1234567890",
  tokenMint: usdcMint,
  privacyLevel: 2,
  initialState: "ACTIVE",
});

const distribution = allocatePrusDeterministically({
  txId,
  tinId: "1234567890",
  tokenMint: usdcMint,
  pruSet: prus,
  amount: 100_000n,
});
```

### Rust / on-chain model

The TSN program defines protocol state for `TinIdentity`, `PruMetadata`, `PrivacyLevel`, `PruLifecycleState`, and `TsnBalanceState`. These structs store commitments and metadata only. They do not store private keys, derivation seeds, full PRU arrays, or balance state.

### Python Cranker daemon

The Python daemon should call the same deterministic function shape:

```bash
tsn-cranker compute-allocation --tx-id <TX_ID> --tin <TIN> --token-mint <MINT> --pru-set <FILE>
```

The daemon must not keep PRU routing state between jobs. Any local cache is advisory and must be rebuildable from TINS, TSN registry reads, and encrypted mempool payloads.

## Usage examples

### TIN creation

1. Derive PRUs off-chain per token mint and privacy level.
2. Compute the PRU configuration hash and encrypted metadata hash.
3. Create the TIN through TINS with the privacy level and hashes.
4. Store only TIN owner mapping, privacy level, encryption metadata hash, PRU metadata commitments, and PRU configuration hash.

### Receiving

1. Resolve the TIN.
2. Load token-bound PRU metadata.
3. Compute deterministic allocation.
4. Execute through TSN vaults with a gasless user path.

### Spending

1. SDK aggregates all PRU balance states for a token.
2. SDK computes unified TIN balance.
3. SDK deterministically selects PRUs by index order.
4. User signs with selected derived PRU keys.
5. TSN executes non-custodial transfer.

### Sweep

1. SDK builds a sweep plan from non-swept PRUs.
2. TSN execution layer transfers fragments to the main owner route.
3. Registry marks swept PRUs as `SWEPT` after successful consolidation.

## Security & privacy considerations

Hidden: derivation seed, private keys, full PRU arrays, phone numbers, raw wallet address graph, and balance state.
Exposed: owner commitment, privacy level, token-bound PRU metadata commitment, and replayable settlement distribution.
Reason: TSN should prove settlement integrity without turning the public ledger into a stalking index.

## Testing notes

Run:

```bash
npm --prefix tsn-sdk test
```

This builds the SDK and runs replay tests proving deterministic PRU derivation, allocation conservation, 3-state accounting, spend selection, and sweep planning.
