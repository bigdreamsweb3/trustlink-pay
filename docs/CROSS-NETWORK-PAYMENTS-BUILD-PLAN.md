# Cross-Network Payments Build Plan

## Goal

Build a readable, auditable cross-network payment path that behaves like correspondent-bank settlement:

```text
Solana authorization and source custody
        -> Sepolia commitment publication
        -> Attestcoin proof
        -> Creditcoin destination settlement
```

The first release must not claim that funds move through Ethereum, that Attestcoin is a custodian, or that writability is available.

## Build order

### 1. Freeze the payment contract

Define one canonical `TSN_CROSS_CHAIN_SETTLEMENT_V1` payload before implementing any chain adapter. It should bind at minimum:

- Version and domain separator.
- TSN and commitment-contract identifiers.
- Solana Mother Escrow and accepted-intent references.
- Epoch and intent identifiers.
- Asset identifier, token program, decimals, and amount.
- Source funding or reservation proof reference.
- Recipient and Creditcoin destination.
- Replay nonce and destination nullifier.
- Expiry and settlement status.

The serialized bytes and hash must be identical for the signer, Sepolia contract, Attestcoin worker, Creditcoin contract, tests, and explorer output.

### 2. Make source funding independently provable

Before calling an obligation funded, link the accepted intent to a specific Epoch Treasury reservation or use an equivalent source-side funding commitment. The proof must identify the same asset, amount, epoch, intent, and nullifier used in the cross-domain commitment.

This prevents a signed authorization from being mistaken for evidence that liquidity exists.

### 3. Register the cross-domain signer under governance

Create a purpose-isolated secp256k1 signer for the Sepolia commitment contract. Register its public identity, activation state, version, and rotation nonce through a governance-controlled Solana account or versioned configuration surface.

The signer must not be the Node, Receiver, Cranker, or existing Ed25519 permit signer. Key rotation must invalidate the old signer for new commitments while preserving verifiable historical receipts.

### 4. Build the Sepolia commitment contract

The contract should:

- Store the governed signer or signer identifier.
- Verify the secp256k1 signature over the canonical payload.
- Enforce domain separation and contract address binding.
- Enforce a nonce or nullifier uniqueness rule.
- Reject expired commitments.
- Emit a complete `SettlementCommitted` event.
- Expose the event and receipt data needed by the Attestcoin proof workflow.

The relay should be a submitter only. The contract must not authorize a settlement based on `msg.sender` alone.

### 5. Build the Attestcoin readability worker

The worker should:

1. Query the Sepolia commitment transaction or event.
2. Request or construct the Attestcoin proof.
3. Verify the proof metadata and source transaction success.
4. Preserve the original event fields without normalization that can alter bytes.
5. Deliver the proof to the Creditcoin settlement contract.
6. Store the proof reference and destination receipt for reconciliation.

The worker should report separate statuses for missing event, pending finality, invalid proof, rejected destination transaction, and completed settlement.

### 6. Build the Creditcoin settlement contract

The destination contract should verify the Attestcoin proof, then independently check the event payload against its expected settlement schema. It must consume the destination nullifier before paying and must reject:

- Invalid or non-final proofs.
- Wrong commitment contract.
- Wrong signer or signer version.
- Wrong source or destination domain.
- Wrong mint, asset, decimals, amount, recipient, epoch, intent, or expiry.
- Reused nonce or nullifier.
- Unfunded or unavailable destination liquidity.

Settlement should be an explicit state transition such as `Pending → Proven → Settled`, with terminal rejection and expiry states.

### 7. Add reconciliation and exception handling

Maintain a cross-network receipt keyed by the canonical commitment and destination nullifier. Reconciliation must match:

- Solana accepted-intent receipt.
- Source funding/reservation receipt.
- Sepolia commitment transaction and event.
- Attestcoin proof identifier.
- Creditcoin settlement receipt.

Support operational states for delayed proof, expired authorization, insufficient destination liquidity, duplicate submission, source cancellation, and destination rejection. Do not silently retry a state-changing action without checking whether the previous transaction succeeded.

## Key ownership

| Key | Responsibility | Must never be used for |
| --- | --- | --- |
| Mother authority | Solana protocol authorization and governance actions | Acting as a hidden EVM signer without explicit binding |
| TCAP governance authority | TCAP configuration and asset governance | Signing user settlement payloads |
| Ed25519 permit signer | Existing Solana private-settlement permits | EVM secp256k1 authorization |
| Cross-domain secp256k1 signer | Canonical Sepolia commitment authorization | Node, relay, or general-purpose wallet operations |
| Node key | Off-chain evidence and route authentication | Creating Solana or EVM settlement authority |
| Cranker/relay key | Transport and transaction submission | Choosing payment terms |
| Creditcoin liquidity authority | Destination liquidity management | Rewriting proven source commitments |

Private keys must be loaded from the existing provider conventions or a protected signer service. Logs may contain public keys, transaction signatures, commitment hashes, and account addresses, but never private key bytes or seed phrases.

## Minimum rejection test matrix

The first implementation is not complete until these cases are tested:

| Test | Expected result |
| --- | --- |
| Alter amount after signing | Sepolia contract rejects |
| Alter recipient after signing | Sepolia or Creditcoin rejects |
| Alter source domain | Destination rejects |
| Alter destination domain | Destination rejects |
| Wrong signer | Sepolia rejects |
| Expired commitment | Sepolia or Creditcoin rejects |
| Reused nonce | Sepolia rejects |
| Reused destination nullifier | Creditcoin rejects |
| Invalid Attestcoin proof | Creditcoin rejects |
| Proof for another contract | Creditcoin rejects |
| Missing source funding proof | Source authorization remains non-settleable |
| Relay submits twice | Second attempt is idempotent or rejected without duplicate payment |
| Destination liquidity unavailable | No credit; receipt records a retryable liquidity failure |
| Malicious Node evidence | On-chain authorization and settlement checks remain authoritative |
| Malicious Cranker or relay substitution | Exact commitment checks reject the mutation |

## Demo sequence

The judge-facing demo should use one asset, one amount, one recipient, and one completed receipt chain:

1. Show the Solana accepted intent and source-side funding evidence.
2. Show the canonical commitment hash and governed signer identity.
3. Publish the unchanged commitment to Sepolia.
4. Show the `SettlementCommitted` event.
5. Show the Attestcoin proof reference.
6. Submit the proof to Creditcoin and show destination settlement.
7. Replay the same nullifier and show rejection.
8. Change the recipient or amount and show field-equality rejection.
9. Explain that Creditcoin paid from destination liquidity and no stablecoin moved through Attestcoin.

## Delivery milestones

### Milestone A — source readiness

- Canonical payload specification.
- Explicit source funding link.
- Governance-controlled cross-domain signer registration and rotation.
- Fixtures and negative tests for source commitments.

### Milestone B — proof surface

- Sepolia commitment contract.
- Signature, domain, nonce, expiry, and event tests.
- Stateless relay or Cranker submission path.
- Explorer-readable event output.

### Milestone C — proof and destination settlement

- Attestcoin readability integration.
- Creditcoin settlement contract.
- Proof verification and field revalidation.
- Destination nullifier and liquidity accounting.

### Milestone D — operations and reconciliation

- Cross-network receipt store.
- Retry and exception state machine.
- Monitoring for stalled proofs, rejected transactions, and liquidity thresholds.
- Runbook for key rotation, pause, recovery, and reconciliation.

## Explicitly deferred

The following should remain outside the first build unless the external platforms provide stable, testable interfaces:

- Attestcoin writability.
- Direct Solana source-chain adapters.
- Atomic movement of funds between Solana and Creditcoin.
- Threshold or multisignature EVM signing.
- Automatic reversal across both chains.
- Generalized multi-asset routing.

## Success criteria

The first release is successful when a reviewer can independently verify that:

1. Solana authorized the source-side obligation.
2. The source-side funding or reservation is independently evidenced.
3. The governed secp256k1 signer authorized exactly one canonical commitment.
4. Sepolia recorded that commitment.
5. Attestcoin proved the recorded event.
6. Creditcoin revalidated the event and paid from destination liquidity.
7. Replay and field substitution were rejected.
8. The relay, Node, and Cranker could not redefine settlement terms.
