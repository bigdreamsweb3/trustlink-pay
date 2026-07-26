# ZK-PRU (Zero-Knowledge Protected Receiving Unit)

## Overview

ZK-PRUs are privacy-preserving receiving accounts for stablecoin payments. Each TIN (Transfer Identity) can hold multiple ZK-PRUs, each with independent balances and lifecycle states.

## Encrypted Master Seed

- Master seed is a 32-byte CSPRNG value
- Encrypted with AES-256-GCM using user's main wallet signature + PIN
- Stored encrypted on-chain in the TIN account
- Decrypted **only** on the user's authorized device

## Authorized-Device-Only Decryption

```
User Device → SDK decrypts locally → Derives child keys → Signs scoped authorizations
```

The master seed is never sent to the backend, Cranker, or any server.

## Local Child-Key Derivation

```
TRUSTLINK_PRU_KEY_V1 | masterSeedHex | tinId | index → SHA-256 → Ed25519 signing key
```

Each PRU derives a unique Ed25519 keypair from the master seed, TIN ID, and index.

## Scoped Signatures

PRU spend authorizations are bound to:
- Specific PRU index
- Exact amount
- Unique nonce
- Expiration timestamp
- Domain-separated intent

## Active Receiving PRU

- One PRU per user/asset is designated as the active receiving PRU
- All incoming payments accumulate to this PRU
- When balance reaches the rotation target, a new PRU becomes active

## Receipt Accumulation

Small payments accumulate to the active receiving PRU:
- Default target: 1000 USDC
- Variance: 20% for privacy
- Automatic rotation when target reached

## Private Receiving Rotation

When the active PRU reaches its target:
1. Old PRU moves to "sealed" state (has balance, no longer receives)
2. New PRU from empty reserve becomes active
3. Empty reserve replenished from available PRU pool

## Large Receipt Routing

Receipts exceeding the large receipt threshold (default: 1000 USDC) are routed to a fresh PRU to prevent the active PRU from becoming a large single-spend target.

## One-Sufficient-PRU Spending

The planner prefers single-PRU payments:
1. Find one PRU that can fully fund the payment
2. Use multi-PRU only when no single PRU is sufficient
3. Wallet top-up as last resort

## Adaptive Tranche Spending

Three cases for spend extraction:

1. **Full consumption**: PRU balance ≤ payment amount → spend entire balance
2. **Large payment**: Payment ≥ standard tranche → direct payment, change retained
3. **Small payment**: Payment < standard tranche → extract trance, change to fresh PRU

## Fresh PRU Change Routing

Change outputs go to empty reserve PRUs, not back to the source. This:
- Prevents balance fragmentation
- Maintains clean PRU isolation
- Enables future spend efficiency

## Lifecycle States

| State | Description |
|-------|-------------|
| ACTIVE | Currently receiving payments |
| FUNDED | Has balance, can be spent from |
| SEALED | Has balance, rotated out of receiving |
| RETIRED | Zero balance, no longer active |
| EMPTY | Reserve PRU, available for change routing |

## Privacy Limitations

- Transaction amounts visible on-chain
- PRU indices visible on-chain
- Timing of rotations visible
- Total balance per PRU visible to node operator
