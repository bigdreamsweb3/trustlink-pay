# Transfer Identity Number System (TINS)

TINS is a privacy-preserving transfer identity system on Solana.

TINS lets a user create:

- a chosen identity name
- a permanent 10-digit Transfer Identity Number
- a master privacy public key used to derive a fresh receiver path for every payment

TINS allows people to send value using a simple number identity while keeping the visible receiving wallet out of the public payment path.

Funds are not meant to move directly from sender to the receiver's visible wallet. They first move into escrow, and later settlement logic can be handled separately by the system.

## Why This Architecture

TINS is not starting from an untested on-chain pattern.

Solana already has established registry-style identity patterns through the Solana Name Service ecosystem. TrustLink Pay is using that style of architecture because it gives this project a strong technical foundation:

- account-based identity registration is already familiar on Solana
- PDA-driven registry patterns are already battle-tested in the ecosystem
- modular registrar-style program structure is easier to audit and extend

The SNS reference is here for architectural confidence, not because TINS is trying to be another domain product.

What TINS changes is the identity model and payment behavior:

- from names and domains to permanent transfer numbers
- from direct wallet resolution to privacy-preserving escrow routing
- from public receiving wallets to program-mediated receiving flows

## Vision

TINS is designed to make Solana transfers feel closer to bank transfers:

- the sender uses a short numeric identity instead of a long wallet address
- the registry reveals the recipient name and TIN, not the recipient wallet
- incoming funds do not land directly in the main wallet
- every payment routes into a program-controlled escrow flow for privacy
- later automated settlement can happen in a separate system-triggered transaction rather than inside the sender's transfer

This is the foundation for a larger TrustLink Pay privacy banking layer on Solana.

## What Changes From SNS

SNS is built around:

- domain registration
- domain ownership and reverse lookup
- direct resolution from name to wallet-linked account data

TINS changes that model to:

- number identity registration
- immutable 10-digit identity numbers
- registry lookup by TIN
- escrow-first receiving instead of direct wallet settlement
- privacy-oriented per-payment receiving paths

In short:

- SNS: `name.sol -> wallet`
- TINS: `name + 10-digit TIN -> registry -> unique escrow receiving path`

## Documentation Map

The main README gives the high-level direction of TINS. Detailed implementation stages are tracked in dedicated documents so contributors can follow how TrustLink Pay evolves the SNS-style foundation step by step.

- [Phase 1 Scope](<C:\Users\codepara\Desktop\trust-link\transfer-identity-number-system-(TINS)\docs\phase-1-scope.md>)
- [TINS Change Log vs SNS](<C:\Users\codepara\Desktop\trust-link\transfer-identity-number-system-(TINS)\docs\tins-change-log.md>)

Future phases should be documented the same way:

- `docs/phase-2-*.md`
- `docs/phase-3-*.md`

## Privacy Model

TINS is being built to reduce balance exposure and transfer traceability.

The problem with direct wallet payments is simple:

- once someone knows one of your wallets, they can inspect balances and transaction history
- repeated direct transfers make it easier to link wallets together
- large incoming transfers can reveal patterns about source wallets and fund movement

TINS addresses that by routing transfers through program-derived accounts instead of exposing a single public receiving wallet as the stable destination.

Phase 1 introduces the first layer of that design:

- public identifier: name + TIN
- receiving mechanism: unique program-mediated escrow path
- wallet privacy: main receiving wallet is not the public payment endpoint

Later phases will strengthen privacy further by separating escrow receipt from wallet settlement through delayed, crank-driven processing.

## Core Accounts For The New Direction

The long-term architecture may evolve, but the current direction centers on these accounts:

### Registry PDA

Seed direction:

- `["registry", tin]`

Stores:

- identity name
- 10-digit TIN
- master privacy public key
- creation metadata
- future preference flags such as auto-claim behavior

### Escrow PDA

Seed direction:

- derived per payment using recipient privacy data, nonce, and mint context

Stores:

- recipient registry reference
- payment-specific receiving data
- amount and asset context
- state required for claim or settlement flow

### Vault PDA

Holds the actual transferred assets for a payment until the receiver initializes a claim flow with their main key and directs settlement to a destination wallet.

### Future Crank / Settlement Layer

This is not part of the first milestone, but it is part of the intended direction:

- auto-claim should not happen in the sender's transaction
- auto-claimable escrows can be processed later by a crank service
- the protocol can use a fee payer for the settlement transaction
- settlement cost can be recovered from the transferred asset under protocol rules

## TINS Flow Evolution

As TINS evolves, the SNS domain-specific processors will be replaced or renamed to TINS-specific flows such as:

- identity creation
- TIN generation
- registry lookup
- escrow creation
- payment settlement

## Development Roadmap

### Step 1

Evolve the SNS-style identity model into a TINS registry model:

- replace domain language with TIN language
- replace domain registration flow with identity-name plus number generation
- replace wallet-style public resolution with registry-based lookup

### Step 2

Implement escrow-first transfer routing:

- lookup by TIN
- derive a unique payment receiving path
- move funds into a payment PDA instead of the user's visible main wallet

### Step 3

Deploy and test the minimal working flow:

- create TINS identity
- resolve a TIN
- send funds to escrow
- verify that the wallet is not used as the public destination

### Later Phases

After the basic model is live and verified, additional features can be introduced incrementally:

- auto-claim logic
- crank-driven delayed settlement
- PIN-gated authorization
- per-payment child key derivation
- privacy-preserving settlement rules
- trust score and reputation systems
- smart-contract vault controls

## Project Goal Right Now

The project's goal right now is to build a TINS program that will:

- create permanent number identities on Solana
- let users receive transfers through a short numeric identifier
- keep the main wallet out of the public receiving path
- route funds through escrow as the default privacy layer
- make wallet-targeting and balance exposure much harder for attackers and unwanted observers
- let users keep value in escrow where spending requires the intended authorization flow
- prepare the foundation for later PIN recovery, recovery-wallet mapping, and social recovery features

## Build Notes

The codebase still contains SNS-derived files and naming in some places. That is expected at this stage. TrustLink Pay is using that proven architectural foundation, then refactoring it toward the TINS model in a controlled, step-by-step way.
