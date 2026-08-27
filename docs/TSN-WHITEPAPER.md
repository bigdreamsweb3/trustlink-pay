# Transfer Settlement Network (TSN)

## A protocol for identity-aware settlement and private balance accounting

### Abstract

The Transfer Settlement Network (TSN) is an intent-based protocol for stablecoin settlement. It separates payment identity, authorization, routing, settlement liability, and private accounting so that an automated submitter can execute an authorized payment without custody of the owner's keys or disclosure of the recipient's balance.

The current settlement domain is Solana. This paper also specifies the planned extension to additional settlement domains, beginning with Creditcoin through Attestcoin-style cryptographic verification. The extension is a protocol boundary, not a claim that TSN is multi-chain today.

## 1. Protocol model

A payment is a state transition authorized by the sender, not an instruction assembled by a relay. The owner device resolves a recipient TIN, binds the privacy-receiving relationship and policy, and signs an intent containing the asset, amount, validity window, replay material, and settlement commitments. Every later transition is bound to those signed values.

The current route is:

```text
TIN → privacy-receiving root → GPRU → TSN Epoch Treasury
    → AcceptedIntent → ConfidentialSettlement → TCAP tip credit
    → encrypted private balance snapshot → owner private read
```

TIN is a payment identity. GPRU is scoped, non-custodial authorization and routing; it never holds a balance. TSN coordinates settlement liability. TCAP (Transfer Confidential Asset Protocol) records private balance transitions as commitments and encrypted snapshots.

## 2. Participants and authority

The owner device holds the privacy-receiving root, signing material and snapshot key. The Receiver accepts authenticated, redacted work. The Node verifies signatures, policy, commitments, sequence and expiry. Mother and TSN authorize the ConfidentialSettlement transition. The Epoch Treasury records funded liability. A Cranker submits the exact authorized transaction and pays execution fees; it cannot alter the amount, asset, recipient, commitments, policy, sequence or nullifier. TCAP verifies the receipt and advances the recipient tip.

No coordination role grants a spending key or unilateral authority to redirect value.

## 3. Solana settlement domain

The current domain executes these transitions:

1. The device resolves the recipient TIN and signs the canonical payment intent.
2. The Receiver stores authenticated redacted work; the Node verifies it.
3. The Cranker submits one transaction containing `tsn_fund_epoch_treasury` and `tsn_accept_intent`.
4. Solana records the Epoch Treasury liability and the canonical `AcceptedIntent` root atomically.
5. Mother/TSN authorizes a complete `ConfidentialSettlement` receipt.
6. The Cranker submits the exact `credit_tcap_tin_tip_v1` transaction.
7. TCAP checks the receipt, predecessor commitment, successor commitment, sequence, policy, scope, validity window and one-time nullifier.
8. The resulting commitment addresses an encrypted snapshot that the owner device verifies and decrypts locally.

Funding and AcceptedIntent acceptance are atomic: if either instruction fails, the transaction reverts. Settlement authorization and TCAP credit are separate later transitions and must consume the same accepted-intent bindings.

## 4. State and commitments

An AcceptedIntent binds the epoch, payment commitment, amount, token, recipient tip root, policy, settlement commitments, replay nonce and validity window. Its canonical root is the identifier used by later authorization; a caller cannot replace it with an unrelated root.

A TCAP tip stores a predecessor commitment and sequence, not a plaintext TIN, private balance or device secret. A credit advances one predecessor to one successor:

```text
previous_commitment = tip.current_commitment
new_commitment      = successor(previous_commitment, authorized transition)
new_sequence        = tip.sequence + 1
```

The snapshot store holds encrypted balance state keyed by the resulting commitment. Plaintext roots, seeds, snapshot keys and balances remain with the owner device.

## 5. Security invariants

The protocol requires device authorization over canonical fields, one-time nullifiers, monotonic sequences, validity windows, exact policy and GPRU scope, and predecessor/successor commitment continuity. Treasury funding and intent acceptance are atomic. Receiver, Node and Cranker may be unavailable, but they cannot rewrite an accepted authorization or spend from it. Confidential debit and exit are proof-gated until conservation, destination-binding and liquidity proofs are enabled.

Public state exposes only evidence required for verification: commitments, token identifiers, policy references, sequence values, nullifiers and validity data. TIN is bound to the receiving root through a one-way relationship and is not a public key for a TCAP balance.

## 6. Settlement domains and attestations

A settlement domain is a blockchain-specific execution environment with its own assets, finality and transaction rules. TSN keeps identity and intent semantics stable while a domain adapter maps a verified authorization into that environment.

Attestation is TSN's cross-domain connection mechanism. An attestation binds source and destination domains, settlement identifier, assets, amount, accepted intent, recipient, sequence or nonce, validity window and the settlement commitment. The destination verifies the cryptographic source fact before executing its own transaction. A transaction hash, API response or operator statement is not sufficient.

## 7. Planned Creditcoin domain

**PLANNED — BUIDL CTC 2026 prototype.** The first additional domain is Creditcoin, reached through an Attestcoin/USC verification boundary:

```text
Solana TSN fact → Attestcoin/USC verification → Creditcoin verification
               → Creditcoin settlement → recipient
```

The destination must reject an attestation whose domain, asset, amount, recipient, settlement identifier, finality or validity window does not match the source authorization. This planned adapter does not replace TSN authorization or TCAP accounting, and it is not presented as a live multi-chain capability.

## 8. Threat model

Security depends on source and destination consensus, cryptographic signatures, attestation verification, TSN authorization rules and the correctness of each domain adapter. Liveness depends on Receiver, Node, Cranker and destination liquidity. A failure may delay or revert a transition; it must not create value, bypass a nullifier, or redirect an authorized payment.

ZK-PRU was an earlier experiment and is retired. It is not part of the receiving, balance or spending architecture described here.

## References

- [Creditcoin Attestcoin Protocol](https://docs.creditcoin.org/attestcoin-protocol)
- [Creditcoin Attestation](https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/attestation)
- [Creditcoin Testnet](https://docs.creditcoin.org/environments/testnet)
- [Solana Documentation](https://solana.com/docs)
