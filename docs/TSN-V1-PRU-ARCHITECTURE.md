# TSN V1 — Deterministic PRU Privacy Settlement Network

Version: current TSN V1 architecture

## Summary

TSN V1 uses deterministic PRU settlement. A TIN is the root identity layer. Privacy Receiving Units (PRUs) are the execution endpoints used by TSN for all settlement. The Cranker receives transaction inputs, resolves the finalized PRU route for the destination TIN, computes the same route every verifier can replay, and executes the payout without using the owner's wallet as the settlement destination.

## Core Model

### TIN Identity Layer

A TIN stores only the identity PDA, SHA-256 owner pubkey commitment, encrypted TIN Master Seed blob, encryption metadata commitment, and PRU configuration commitment hash. The Transfer Identity registry does not store the raw owner wallet as an authority field, PRU lists, balances, private keys, or derivation seeds. Every TIN receives exactly 30 PRUs.

Transfer Identity is aware of PRUs through commitments only, never enumeration. During TIN creation, the mempool and cranker layer handle all PRU derivation, compute the `pru_configuration_hash`, and submit only that hash to the registry. This gives TSN and Crankers a verifiable replay target without exposing the full PRU set on-chain. The SDK and frontend have no visibility into how PRUs are generated or what they contain.

### PRU Execution Endpoint

A PRU is a token-agnostic receiving unit that can hold any supported token. It is an execution endpoint for TSN settlement, not a user-facing wallet.

Each PRU carries:

- the TIN it belongs to
- its index within the TIN's PRU set
- a derived public key
- encrypted metadata
- a lifecycle state

### PRU Lifecycle

A PRU is in one of two states:

**ACTIVE** — the PRU is ready to receive funds. Its token account exists on-chain.

**SWEPT** — funds have been consolidated from this PRU back to the main TIN owner route.

## Deterministic Settlement Allocation

When TSN receives a payment destined for a TIN, the mempool and cranker path resolves the recipient PRU deterministically:

1. Cranker detects an incoming TSN transaction.
2. The mempool reads the finalized PRU route for the destination TIN.
3. The mempool computes a settlement seed from the transaction ID, destination TIN, and token mint.
4. The mempool selects an active PRU from the route and signs the private payout permit for that PRU's token account.
5. The Cranker executes the payout to the selected PRU token account.

The same inputs always produce the same route. Gross escrowed amount equals the PRU payout plus the recipient fee. No randomness is permitted in settlement routing. Replay verification is done against the PRU configuration commitment and mempool route state, not against frontend state.

## Payment Fee Flow

Normal payment fees have two enforced portions:

- the sender fee, paid on top of the sent amount in the sender co-signed sponsored settlement
- the recipient fee, deducted from the escrowed settlement amount before the private payout permit is signed

The selected PRU receives the net amount after recipient fee deduction. The private payout instruction accrues the recipient fee in the Cranker vault fee accounting. The owner wallet is never used as the recipient settlement destination.

## TIN Balance Accounting

Every TIN balance exists in one of three states:

**AVAILABLE** — funds that are settled and ready to spend.

**PENDING** — funds in transit, not yet confirmed settled.

**SETTLED** — funds that have completed the settlement process.

The unified TIN balance shown to the user is AVAILABLE plus SETTLED minus PENDING.

The frontend and SDK must show only this unified balance abstraction. Raw PRU addresses, raw PRU balances, and individual PRU states are never exposed as UI objects.

## Fee Split for TIN Operations

Every TIN creation and upgrade operation carries a fee. No part of TIN operation fees goes to liquidity providers or TrustLink liquidity pools. TIN fees are distributed as follows:

- 30 percent to Cranker A, the Cranker that submits the first transaction
- 40 percent to Cranker B, the Cranker that submits the actual on-chain TIN mutation
- 10 percent to the Protocol Treasury
- 20 percent to the Reserve Pool for Cranker reimbursement rewards

## How TIN Creation Works

1. The user builds and signs a TIN creation intent off-chain. The owner wallet signs a plain message — not a transaction.
2. The signed intent is submitted directly to the TSN mempool. Nothing touches the chain at this point.
3. The mempool and cranker layer derive the 30 PRUs, generate the TIN Master Seed, compute the PRU configuration hash, and encrypt all private material. The frontend never sees any of this.
4. A verifier Cranker checks the owner signature, nonce, expiry, and commitment hashes.
5. A submitter Cranker records the fee commitment on-chain in Transaction 1.
6. The submitter Cranker submits the actual TIN creation in Transaction 2.
7. Transfer Identity stores only the identity PDA, SHA-256 owner pubkey commitment, encrypted TIN Master Seed blob, encryption metadata hash, and PRU configuration hash. The owner wallet is never stored as a readable authority field.

The owner wallet never appears as a signer, fee payer, or authority in any on-chain transaction. The Cranker signs and pays all chain transactions.

## How TIN Upgrade Works

TIN upgrade follows the exact same flow as TIN creation. The owner signs an upgrade intent. The intent goes to the TSN mempool. Cranker A submits the fee commitment. Cranker B submits the on-chain upgrade. The owner wallet never appears on-chain.

## How Receiving Works

1. The destination TIN is resolved from the payment.
2. The mempool loads the finalized PRU route that matches the TIN's PRU commitment.
3. The mempool selects the active PRU for the payment and token mint.
4. The Cranker executes settlement through the private payout permit to the PRU token account. The user path is gasless after the sender co-signs the payment authorization.

## How Spending Works

1. The SDK aggregates PRU balance states and computes the unified TIN balance.
2. The user constructs a spending intent and signs it.
3. The TSN cranker network executes the non-custodial transfer.
4. The owner wallet never directly submits anything to the chain.

## How Sweep Works

1. A sweep plan is built from all non-swept PRUs.
2. The TSN execution layer transfers consolidated funds to the main owner route.
3. The registry marks swept PRUs as SWEPT after successful consolidation.
4. The user chooses protected sweep (funds stay as vUSDC) or unprotected sweep (funds unwrap to USDC). This choice is made at sweep time and never exposed during normal receiving.

## Security and Privacy Guarantees

What is always hidden: derivation seeds, private keys, full PRU arrays, phone numbers, raw wallet address relationships, and individual balance states.

What is publicly visible: the one-way owner pubkey commitment, PRU metadata commitment, and replayable settlement commitments. Public mempool views use opaque TIN route identifiers instead of raw TIN numbers.

This boundary ensures TSN can prove settlement integrity to any verifier without turning the public ledger into a surveillance index for tracking user activity.
