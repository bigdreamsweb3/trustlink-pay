# Current TrustLink architecture: TCAP (Transfer Confidential Asset Protocol)

This is the canonical description of the intended TrustLink Pay receiving and
credit architecture. The V1 receipt path remains legacy compatibility; the
privacy-safe V2 path must be deployed before it is used in production.

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

The arrow summary above is retained as a historical V1 shorthand. For the
privacy-safe route, funding and the GPRU/TCAP transition are separate opaque
objects; there is no public AcceptedIntent or TCAP receipt joining them. See
[GPRU ownership and TCAP custody](./GPRU-TCAP-LINK-BREAKING.md).

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
    N->>M: Create settlement intent; inactive until funding is verified
    C->>E: Submit exact authorized funding work
    E->>N: Funding proof becomes available
    N->>C: Activate settlement after exact proof checks
    C->>C: Pay selected destination from Cranker vault
    N->>M: Approve reimbursement only for leased Cranker
    M->>P: Advance opaque GPRU tip through V2 CPI
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
- **Mother/TSN** authorizes the bounded settlement and reimbursement decision.
  The V2 CPI wrapper supplies only opaque tip-transition fields; a GPRU
  signature alone cannot move custody.
- **Cranker** leases and submits the exact authorized transaction. It can pay
  fees and submit work, but cannot change amount, token, recipient binding,
  commitments, sequence, policy, nullifier or expiry.
- **TCAP** owns the tip and sequence checks. A successful V2 credit advances the
  tip from `previous_commitment` to `new_commitment` without a per-transfer
  receipt or nullifier account.
- **Encrypted snapshots** hold private balance state off-chain. The owner
  device verifies the tip commitment and sequence before decrypting a single
  commitment-keyed snapshot.

## Verified authorization contract

The privacy-safe V2 ABI contains the opaque authorization digest, validity
window, predecessor and successor commitments, sequence, token policy, GPRU
scope commitment, and one-time nullifier. It intentionally excludes payment
intent identifiers, recipient TINs, settlement commitments, epoch roots,
`AcceptedIntentV1`, and TCAP authorization receipts. The predecessor and
sequence checks prevent replay without creating an account for every transfer.

## What is visible and what is private

The chain stores governed program accounts, opaque commitments, sequence values,
token IDs, scoped authorization commitments, and validity windows needed for
enforcement. It does not store plaintext receiving roots, private balance
values, master seeds, snapshot plaintext, payment intent IDs, or recipient TINs
inside the TCAP transition.

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
