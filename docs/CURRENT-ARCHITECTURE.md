# Current TrustLink architecture: TCAP (Transfer Confidential Asset Protocol)

This is the canonical description of the live TrustLink Pay receiving and
credit architecture. The production path is:

```text
TIN identity
  → privacy-receiving root
  → GPRU authorization/routing (never holds funds)
  → TSN Epoch Treasury coordination
  → Mother/TSN ConfidentialSettlement authorization
  → TCAP tip credit
  → encrypted private balance snapshot
  → owner private balance read
```

## End-to-end credit path

```mermaid
sequenceDiagram
    participant D as Authorized user device
    participant T as TIN identity layer
    participant R as Receiver
    participant N as TSN Node
    participant M as Mother / TSN program
    participant E as Epoch Treasury
    participant C as Cranker
    participant P as TCAP program
    participant S as Encrypted snapshot store

    D->>T: Resolve identity and privacy-receiving root relationship
    D->>D: Build and sign the payment intent and GPRU scope
    D->>R: Submit signed intent
    R->>N: Store redacted work and lease state
    N->>N: Verify signatures, policy, commitments, sequence and expiry
    N->>M: Prepare Mother-rooted ConfidentialSettlement authorization
    C->>E: Submit the exact authorized epoch funding work
    M->>P: Authorize the complete TCAP receipt through the TSN CPI
    C->>P: Submit the exact authorized credit transaction
    P->>P: Consume receipt and nullifier; advance the TCAP tip
    P->>S: Bind the resulting commitment to encrypted snapshot persistence
    D->>S: Fetch, verify and decrypt the matching snapshot locally
```

### Responsibility and privacy boundaries

- **TIN** is the human-facing payment identity. It binds identity ownership to
  a privacy-receiving root relationship and the TCAP route without becoming a
  token account or private key.
- **Privacy-receiving root** is the owner-controlled root relationship used to
  derive the blinded TCAP tip relationship. Plaintext roots and spendable
  secrets remain on the authorized device.
- **GPRU** is authorization and routing only. It carries scoped permissions,
  commitments, expiry and replay material; it never holds funds, balances or
  custody keys.
- **Receiver** is durable ingress, redacted work storage, leases and status.
  It does not receive plaintext roots or private balance snapshots.
- **TSN Node** verifies the signed intent and canonical fields, creates the
  authorized work record, and coordinates the Epoch Treasury and Mother
  authorization boundary.
- **Epoch Treasury** records aggregate funding and settlement liability. It is
  protocol-controlled accounting, not a user balance container.
- **Mother/TSN** creates the one-time `ConfidentialSettlement` authorization.
  The TSN CPI wrapper supplies every field required by TCAP and cannot be
  replaced by a GPRU signature alone.
- **Cranker** leases and submits the exact authorized transaction. It can pay
  fees and submit work, but cannot change amount, token, recipient binding,
  commitments, sequence, policy, nullifier or expiry.
- **TCAP** owns the tip, sequence, receipt and nullifier checks. A successful
  credit advances the tip from `previous_commitment` to `new_commitment`.
- **Encrypted snapshots** hold private balance state off-chain. The owner
  device verifies the tip commitment and sequence before decrypting a single
  commitment-keyed snapshot.

## Verified authorization contract

TSN and TCAP share one `ConfidentialSettlement` ABI. Its required fields are:
`epoch_id`, `intent_commitment`, `amount`, `settlement_commitment`,
`accepted_intent_root`, `previous_tcap_root`, `transition_type`,
`asset_commitment`, `authorization_digest`, `verifier_domain_version`,
`valid_after_slot`, `expires_at_slot`, `replay_nonce`, `tin_tip`,
`previous_commitment`, `new_commitment`, `sequence`, `token_id`,
`policy_commitment`, `gpru_scope_commitment`, and `nullifier`.

TSN creates an `AcceptedIntentV1` PDA and derives the root from the canonical
field sequence documented in the accept-intent instruction. The wrapper
requires that PDA, checks every bound field and consumes the intent after the
TCAP CPI succeeds. TCAP stores the same fields in its receipt and requires a
`ConfidentialSettlement` transition before credit can consume it. A caller
cannot supply an unrelated root or use a GPRU signature alone.

## What is visible and what is private

The chain stores program accounts, commitments, sequence values, token IDs,
policy commitments, scoped authorization commitments, nullifiers and validity
windows needed for enforcement. It does not store plaintext receiving roots,
private balance values, master seeds or snapshot plaintext.

Receiver, Node and Cranker APIs expose only the redacted work and public
evidence required for coordination. The owner device retains private roots,
snapshot keys and decrypted balances.

## Debit and exit boundary

Debit and exit interfaces may exist for future compatibility, but live
confidential debit and exit remain proof-gated and disabled. A GPRU signature,
hash-only payload or placeholder proof cannot spend, exit, mutate a tip, or
drain a liquidity pool. Enabling spend requires an audited proof verifier,
registered rate/version rules, commitment opening and successor checks,
nullifier consumption, destination binding for exits, and protocol liquidity
invariants.

## Where this sits in tokenized finance

Tokenization is spreading across institutions, funds, payment companies and
other financial operators. Representing an asset as a token is not the same as
settling a payment or maintaining a private balance ledger.

- **TSN** is settlement and authorization coordination infrastructure: it
  verifies intent, leases, epoch liability and one-time execution authority.
- **TCAP** is private balance accounting: it advances commitment-backed tips and
  anchors encrypted owner snapshots.
- **GPRU** is non-custodial authorization and routing: it tells the system what
  may happen and where the authorized work may go without holding value.

Together these layers separate institutional token representation, payment
authorization, settlement coordination and private accounting.

## Architecture history

The repository previously explored ZK-PRU-based receiving and spending. That
experiment was superseded by the TIN privacy-receiving root, GPRU authorization
and TCAP encrypted-snapshot credit model. The history remains documented for
auditability, but new implementations must target the current architecture.
See [ZK-PRU retired](./ZK-PRU-RETIRED.md).
