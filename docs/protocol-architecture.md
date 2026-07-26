# TrustLink Pay Protocol Architecture

## Overview

TrustLink Pay enables identity-first stablecoin payments on Solana. Users send USDC to phone numbers resolved through the Transfer Settlement Network (TSN) privacy-preserving settlement layer.

## Core Components

- **TrustLink Pay**: User-facing web application
- **TIN (Transfer Identity Protocol)**: Identity and routing layer on Solana
- **TSN SDK**: Canonical planner and authorization layer
- **TSN Node**: Python mempool backend for verification and reservation
- **Cranker**: Fee payment and transaction submission
- **TSN Program**: On-chain Solana program for settlement enforcement
- **TSN Escrow**: Temporarily holds funded payment assets

## Two-Stage Direct-Payment Lifecycle

### STATE 1: Intent and Funding

1. **Sender / Authorized Device** initiates payment
2. **TIN route resolution** resolves recipient identity
3. **TSN SDK** builds Execution Plan V2 locally
4. **SDK** decrypts master seed locally (authorized-device-only)
5. **SDK** derives PRU child keys locally
6. **SDK** signs scoped spend authorizations
7. **Main wallet** signs the full route commitment
8. **Frontend** submits signatures and public execution data only

### STATE 2: Mempool Claim and Settlement

9. **TSN Node** verifies authorization and reserves work
10. **Cranker** claims work and pays fees
11. **TSN Program** verifies authorization and delegate authority
12. **TSN Escrow** receives funded assets
13. **Claim settlement** releases assets to recipient route
14. **Receipts and state** are updated

## Supported Payment Modes

| Mode | Description |
|------|-------------|
| `wallet_only_v2` | Payment funded entirely from connected wallet |
| `zk_pru_only_v2` | Payment funded entirely from ZK-PRU balance |
| `mixed_zk_pru_wallet_v2` | Payment uses ZK-PRU first, wallet for remainder |

## Key Security Properties

- Master seed never leaves the user's device
- PRU private keys derived locally only
- Scoped spend signatures bound to specific amounts and nonces
- Restricted PDA delegate authority for on-chain execution
- Cranker never receives master seed or child private keys

## Settlement Flow

```
Sender Device → TSN SDK → TSN Node → Cranker → TSN Program → TSN Escrow → Recipient
     ↓              ↓          ↓          ↓           ↓              ↓            ↓
  Sign locally   Build plan  Verify    Pay fees   Enforce       Hold assets   Receive
```

## On-Chain Components

- **TSN Program** (`TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V`): Settlement enforcement
- **TIN Program** (`TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT`): Identity registry
- **TSN Escrow**: PDA-derived escrow accounts for funded payments

## Disabled Features

- **Recurring payments**: Foundation only, no production execution
- **TCAP**: Experimental, not part of current production ZK-PRU settlement
