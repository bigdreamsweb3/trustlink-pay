# Phase 1 Scope

Phase 1 is the first controlled upgrade from an SNS-style registrar architecture into the Transfer Identity Number System.

The goal of this phase is not to ship the entire long-term privacy bank design at once. The goal is to prove the first working TINS flow on-chain:

- a user can create a TINS identity
- the program can generate and register a permanent 10-digit transfer number
- other users or apps can resolve that number through the registry
- incoming funds route into escrow instead of landing directly in the visible main wallet

## Why Phase 1 Exists

SNS-style systems already prove that on-chain identity registries can work well on Solana.

TrustLink Pay is improving that model for payment privacy and bank-account-style usability:

- domains are replaced with permanent transfer numbers
- direct wallet destination exposure is replaced with escrow-first routing
- static receiving addresses are replaced with privacy-oriented receiving paths

Phase 1 is the minimum product milestone that shows this transition is real and testable.

## Phase 1 Deliverables

### 1. Registration

The first deliverable is TINS identity creation.

Expected behavior:

1. A user chooses an identity name.
2. The program generates a unique 10-digit TIN.
3. The generated TIN becomes the permanent identity number for that account.
4. A registry PDA stores the identity record.
5. The registry links the TIN to a master privacy public key and related metadata.

Important constraints:

- the 10-digit TIN must remain permanent once created
- the name may later become editable only if explicitly supported, but the number must remain stable
- the registry should be designed around number identity, not domain ownership

### 2. Lookup

The second deliverable is registry resolution by TIN.

Expected behavior:

1. A sender or integrated app submits a TIN.
2. The program resolves the registry entry for that TIN.
3. The lookup returns the public identity context needed for the payment flow.
4. The system exposes the name and TIN identity without using the main wallet as the public receiving endpoint.

The purpose of this step is to make the transfer experience feel closer to using an account number than a blockchain address.

### 3. Receiving Flow

The third deliverable is escrow-first receiving.

Expected behavior:

1. A sender initiates a transfer using the recipient's TIN.
2. The registry entry is used to derive a payment-specific receiving path.
3. The transfer is routed into a PDA-based escrow or vault account.
4. The recipient's visible wallet does not receive funds directly in the way a standard resolver-based system would.

This is the first privacy layer of TINS.

In Phase 1, funds stopping in escrow is the important behavior. Automatic settlement to a wallet is not part of the initial sender transaction.

## Accounts In Scope

Phase 1 should focus on the minimum accounts required to prove the new flow.

### Registry PDA

Purpose:

- stores the TINS identity record
- acts as the source of truth for name and number resolution

Minimum stored fields:

- identity name
- permanent 10-digit TIN
- master privacy public key
- creation metadata needed by the program

### Escrow PDA

Purpose:

- stores payment-specific receiving state
- supports routing funds away from the visible main wallet

Minimum stored fields:

- recipient registry reference
- amount and payment state
- payment-specific derivation context

### Vault PDA

Purpose:

- holds the actual transferred asset for that payment flow

## What Is Not Yet In Scope

To keep implementation focused, these items should be treated as later phases unless they are required to make Phase 1 functional:

- auto-claim logic
- crank-driven delayed settlement
- PIN verification
- trust score
- smart-contract vault spending controls
- advanced recovery mechanisms
- full reputation and social proof systems

## Success Criteria

Phase 1 is complete when the team can demonstrate the following end-to-end flow:

1. Create a TINS identity with a chosen name.
2. Generate and store a permanent 10-digit TIN.
3. Resolve the TIN through the registry.
4. Send funds using the TIN.
5. Confirm that funds move into escrow or vault state rather than directly into the user's visible receiving wallet.

## Notes For Contributors

This repository follows the modular SNS-style layout on purpose.

Instruction logic should remain separated by responsibility so the codebase stays easy to review during the migration from naming registrar behavior to transfer identity behavior.

As new milestones are completed, they should be documented in separate phase documents so anyone reading the repository can follow the exact journey from SNS-style architecture to the full TINS system.
