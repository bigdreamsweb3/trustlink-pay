# Foundations, assumptions and protocol thesis

**Status: CURRENT for the inspected responsibilities; EXPERIMENTAL for end-to-end confidential settlement readiness.** TSN coordinates settlement work across application clients, verification services, submission workers and Solana programs. Its implementation separates the act of asking to pay from proof that a token deposit or a confidential balance transition actually executed.

## The settlement problem

A human-facing recipient identity is not a token account, a signed message is not a transfer, and an HTTP success is not chain confirmation. Conventional application backends often collapse these distinctions into a single payment record. TSN's inspected contracts separate them so that a worker cannot treat an accepted request as permission to invent a recipient, alter a funding transaction, or manufacture settlement evidence.

The present native credit path starts with a sender-approved payment intent and an independently wallet-signed TCAP reserve deposit. After confirmation of that deposit, Node constructs a hidden-head transition for the recipient's authenticated TIP route. Mother authorizes the exact transition; TCAP verifies its asset, accounting, root and GPRU proof requirements before advancing state. The off-chain services coordinate this sequence, while Solana applies the authorized program instructions.

This architecture is identity-first because the canonical payment message names a TIN. It is privacy-aware because identity envelopes, hidden state paths and owner action records have distinct protected boundaries. Neither term promises universal anonymity, production readiness, arbitrary cross-chain liquidity or successful execution of every exported API.

## The six distinct contracts

**Identity** identifies the intended recipient and the current authorized route. TIP owns that registry; the issuer and Node hold protected lookup material. **Authorization** records what the owner, sender or Mother approved. A wallet signature is specific to its message or transaction bytes. **Funding** moves assets into a reserve and creates pending liability. **Execution** applies a program instruction after its checks. **Settlement** applies the authorized private recipient state change; native aggregate liability accounting is separate complete epoch work. **Finality** depends on chain confirmation and the chosen commitment level, rather than the service's work status alone.

Funding, individual credit and aggregate accounting have separate transaction boundaries. Credit atomically advances the shared head/nullifier root and blinded epoch transcript after proof verification, leaving public reserve liabilities unchanged. Node prepares every ordered opening for a complete 2–64-credit epoch; TCAP/GPRU verify the aggregate before one pending-to-settled reclassification. These atomic boundaries do not span earlier HTTP requests or confirmed deposits; a singleton carries forward. See [ADR-005](decisions/ADR-005-private-amount-and-adaptive-pools.md).

## Assumptions that must remain explicit

Solana supplies transaction execution, account ownership and signature enforcement. The configured deployment and account graph must match the SDK and service serializers. Mother authority remains a trusted authorization boundary in the inspected credit instruction; this source does not establish a permissionless or consensus-based Node authorization mechanism.

Witness snapshots are untrusted input. A snapshot is useful only when its recomputed roots equal the roots selected from chain. Proving artifacts must match the circuit source and the installed verifier. A valid proof does not establish that the owner can retrieve every historical Memo, that an RPC returned complete history, or that every encrypted plaintext field matches the action without owner-side validation.

Operators protect signing keys and service credentials. Owners protect wallet authorization and private recovery/scan material. An application must supply accurate service endpoints and display the exact payment terms. Recovery must preserve signatures: a Cranker cannot refresh an expired owner-signed blockhash without new wallet approval.

## What is known about design history

The repository explicitly retires [ZK-PRU](../ZK-PRU-RETIRED.md) and labels earlier per-TIN tip and epoch-slot narratives as historical for the current native credit path. Those earlier concepts explain explored boundaries, but historical labels do not mean all corresponding program entrypoints were deleted. The inspected TSNP and TCAP libraries still expose several epoch, debit, exit and one-time-tip instruction families.

No complete contemporary record of every alternative evaluated, the original protocol thesis date, or every failed experiment was found. The [decision records](decisions/README.md) therefore distinguish reconstructed implementation decisions from original approvals. The independent research repository contains published papers with superseded terminology; publication status proves the existence of a document, not adoption or deployment of its architecture.

## Source and related records

Read [architecture terminology](../../.codex/architecture-terminology.md), [SDK request contracts](../../tsn-protocol/sdks/tsn-sdk/src/contracts.ts), [Node settlement preparation](../../tsn-protocol/services/tsn-node/server.py), [TSNP credit authorization](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs), and [TCAP atomic credit](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs). The [invariant record](invariants.md) describes what these boundaries imply for maintenance.
