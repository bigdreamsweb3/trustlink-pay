# TrustLink / TSN Final Architecture

This document describes the architecture used for the current TrustLink
development network. It is the canonical explanation of how TIN, ZK-PRU,
the TSN Receiver, TSN Node, Cranker, and the on-chain TSN Program work
together.

## Network model

TSN is the payment infrastructure. TIN is the payment identity. ZK-PRU is the
private receiving and authorization technology used by a TIN. TrustLink Pay
is the application that lets a user operate the system.

```mermaid
flowchart TD
  W["Main wallet"] --> D["Authorized user device"]
  D --> SDK["TSN SDK"]
  SDK -->|"signed public intent + commitment"| R["TSN Receiver / durable ingress"]
  R --> N["TSN Node / verification and routing"]
  N -->|"verified immutable work"| R
  R --> C["Cranker / short lease + fee payer"]
  C -->|"exact funding transaction"| P["TSN Program"]
  P --> E["Isolated TSN Escrow"]
  R -->|"settlement work"| C
  C -->|"exact leased settlement"| P
  P --> CV["CrankerVault pays recipient"]
  E -->|"separate verifier-approved reimbursement"| CV
  CV --> Z["Recipient ZK-PRU or public wallet"]
```

The Receiver stores durable public work and status in Firestore. The Node is
stateless and performs protocol verification. The Cranker submits only work
that the Node has verified. The Cranker is paid from its protocol vault first;
the isolated escrow reimburses only the Cranker that held the successful lease.
None of these services receives a TIN master seed, a PRU private key, or a
serialized user signer.

## TIN account

A finalized TIN account contains:

- the TIN number and public display name;
- the main-wallet authority commitment;
- an encrypted master-seed envelope;
- a ZK-PRU configuration commitment;
- a separately encrypted public-route envelope;
- route version and route nonce.

The TIN does not store an authorized-device list. Device authorization remains
in the existing Private View device system. Authorizing a new device therefore
does not require changing the TIN account.

## Master seed and authorized devices

The TSN SDK generates a random master seed on the user device. It is never
derived from the wallet signature. The wallet signs a canonical authorization
that binds the TIN, route version, ZK-PRU commitment, resource commitment, and
the current authorized-device session.

The seed is encrypted locally. The independent data key is released only as an
envelope encrypted to the authorized device's non-exportable X25519 key. The
device unwraps the key and decrypts the seed locally. A copied wallet
signature is not sufficient on an unauthorized device.

```mermaid
sequenceDiagram
  participant W as Main wallet
  participant D as Authorized device
  participant S as TSN SDK
  participant T as TIN registry
  participant K as Threshold access adapter

  D->>D: Load existing device authorization
  S->>T: Read encrypted TIN envelope
  W->>S: Sign TIN + route + device-session authorization
  D->>S: Sign device proof with non-exportable key
  S->>K: Submit public authorization proofs
  K-->>D: Data key encrypted to device X25519 key
  D->>D: Unwrap key and decrypt seed locally
  D->>D: Derive selected ZK-PRU authorities
  D->>S: Return public keys, commitments, and scoped signatures
```

Plaintext seed material never enters the Receiver, Node, Cranker, backend,
logs, analytics, or payment records. It is cleared after the selected public
keys and signatures are produced.

## ZK-PRU derivation and balances

The SDK derives a deterministic set of ZK-PRU child authorities from the
random master seed and the TIN identifier. It computes a configuration
commitment over the ordered public set. To load a user's balance, the
authorized device:

1. unlocks the encrypted seed locally;
2. derives the public ZK-PRU addresses;
3. verifies the derived set against the TIN commitment;
4. queries public token accounts for those addresses;
5. aggregates balances for the signed-in user interface.

The public token accounts are observable on Solana. The private association
between a TIN and its derived ZK-PRU set is not sent to the application
backend.

## Receiving a payment

The recipient does not need to be online. The TIN stores a separate encrypted
route envelope containing only public ZK-PRU routing metadata. The TSN Node
decrypts this envelope with its routing key, verifies the configuration
commitment, and selects an eligible receiving public key according to the
allocation policy.

The route envelope never contains the master seed or a private key. The
Cranker receives only the minimized route authorization required to submit the
already-verified work.

```mermaid
sequenceDiagram
  participant S as Sender device
  participant R as Receiver
  participant N as TSN Node
  participant C as Cranker
  participant P as TSN Program
  participant E as TSN Escrow
  participant V as CrankerVault

  S->>R: Signed payment intent
  R->>N: Publish received work
  N->>N: Verify intent and route commitment
  N->>N: Decrypt public route envelope and select destination
  N-->>R: VERIFIED intent work
  R-->>C: Short intent lease
  C->>P: Submit exact funding transaction
  P->>E: Create isolated escrow vault
  R-->>C: Settlement work after funding confirmation
  C->>R: Claim short settlement lease
  N->>N: Recheck lease-bound settlement data
  C->>P: Submit exact settlement transaction
  P->>V: Pay selected recipient route
  P-->>R: Settlement proof and confirmation evidence
  N->>N: Verifier decides reimbursement eligibility
  R-->>C: Separate authorized reimbursement work
  C->>P: Submit reimbursement transition
  P->>E: Execute authorized reimbursement only
```

## Spending from a TIN

Every ZK-PRU spend requires both authorizations over the same canonical plan
commitment:

1. the main wallet authorizes the complete payment plan;
2. the selected ZK-PRU child authority signs the exact source and amount.

The TSN Program rejects a missing signature, mismatched commitment, wrong
source, stale state version, expired plan, replay, wrong delegate, or
insufficient allowance. The Cranker never reconstructs a user key and never
replans a payment.

## Receiver, Node, and Cranker responsibilities

| Component | Responsibility | Must never do |
| --- | --- | --- |
| TrustLink Pay | Authenticate the user and collect wallet/device approvals | Hold TIN master seeds |
| TSN SDK | Derive local ZK-PRU data, build commitments, create scoped signatures | Export plaintext private keys |
| TSN Receiver | Store public ingress, leases, immutable work, and status | Verify cryptography or decrypt private data |
| TSN Node | Verify plans, commitments, signatures, replay and route state | Sign as a user or choose a private key |
| Cranker | Pay fees and submit exact verified batches | Change amount, route, fee, or destination |
| TSN Program | Enforce on-chain signatures, delegate authority, escrow and state transitions | Trust an unverified route |

## Current Devnet migration gate

TIN `1000000008` is currently a legacy on-chain account. It has no finalized
encrypted public-route envelope, so the Node correctly rejects new work with
`Recipient TIN ... has no finalized PRU route`.

The safe migration sequence is:

1. build and deploy the current TIN Registrar program from WSL;
2. verify the deployed program ID and upgrade authority;
3. authorize the current browser device through Private View;
4. have the owner wallet sign the finalized TIN upgrade in the frontend;
5. create the encrypted master-seed and public-route envelopes locally;
6. submit the owner-signed update transaction;
7. verify the new route commitment and route version on Devnet;
8. retry a small funding transaction.

The old `tin:update:legacy` helper is not part of this flow. It prints seed
material and does not construct the finalized route envelope; it must not be
used for the production-shaped migration.

## Deployment boundary

Program builds and deployments require the pinned Solana/SBF toolchain in WSL.
The Windows shell in this repository does not provide `cargo build-sbf`, so a
Windows `npm run tip:build` failure with “no such command: build-sbf” is a
toolchain limitation, not evidence that the Rust program is invalid.

No Devnet signature is claimed until the WSL build, deploy, upgrade, and route
verification commands have completed successfully.
