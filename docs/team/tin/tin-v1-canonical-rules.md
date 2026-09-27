# Canonical TIN V1 Rules

This document is the internal source of truth for the replacement TIN registry. The approved privacy-preserving design is **TIN V1**. The previous registry implementation is obsolete and is not a compatibility target.

## Scope

TIN V1 is a fresh registry and resolver for new users on Solana Devnet. Existing accounts created by the previous implementation are not migrated, upgraded, or accepted by the new SDK and Node route gate. A fresh program deployment and fresh TIN issuance are required before the next end-to-end settlement test.

## On-chain data boundary

The TIN value and display name are not stored in cleartext. A TIN V1 account stores an opaque lookup commitment, an owner commitment, encrypted identity material, encrypted metadata references, and the TSN route commitments required for settlement coordination. The account may expose status, timestamps, route version, and cryptographic commitments, but not the identity plaintext.

The lookup commitment must be keyed with resolver-held secret material. Hashing a short TIN without a secret would allow exhaustive guessing and is not an acceptable privacy boundary. The resolver computes the commitment from the supplied TIN and protected lookup secret, then returns only the authorized identity disclosure needed for payment confirmation.

## Issuance

TIN V1 issuance uses cryptographically random issuance material and an explicit uniqueness check. A check digit may be used for input-error detection, but it is not treated as a privacy mechanism or as the source of uniqueness. The old sequential counter and raw-TIN PDA lookup are not part of TIN V1.

The XP backend generates the random ten-digit TIN before the owner signs the
creation intent. The backend derives the lookup commitment with the protected
`TINS_LOOKUP_SECRET`, checks the commitment-derived PDA on the selected
Solana cluster, and retries if that account already exists. The secret is
shared only with the trusted Node resolver; it is never sent to the browser or
Receiver. The Receiver receives the keyed commitment and encrypted identity,
not the TIN or display name. `TinV1Account` does not assign random numbers; it
validates the owner-authorized commitment and initializes the V1 registry PDA.

The Node verifies a keyed HMAC issuance proof bound to the owner, commitment,
owner intent hash, nonce, and expiry. This prevents callers from bypassing the
trusted issuer and submitting arbitrary lookup commitments through Receiver
ingress. The owner signs the raw 32-byte intent hash used by the Rust
processor. The SDK, Node, and program include four-byte little-endian lengths
before each variable-length encrypted blob in that hash.

## Resolver behavior

The SDK exposes one TIN V1 resolver. It does not scan for old account layouts, return `accountKind: "legacy"`, set `upgradeRequired`, or silently reinterpret an old account as current. If the commitment or account schema is not TIN V1, resolution fails.

## Settlement boundary

TIN V1 supplies the authorized route commitments to TSN. It does not change sealed TIP handling, two-phase exit commitments, Path 1 or Path 2 wiring, one-vault accounting, liability PDAs, GPRU authorization, Node orchestration, Cranker submission, or Creditcoin settlement routing.

TSN remains TrustLink Labs' Transfer Settlement Network within the broader Decentralized Settlement Protocol (DESP) architecture. DeFi decentralizes financial services; DESP decentralizes settlement infrastructure.

## Deployment gate

The TIN V1 program must be deployed on Solana Devnet before any public demo claim. The deployment record must include the program ID, deployment transaction, fresh TIN issuance transaction, resolver evidence, and the later Solana-to-Creditcoin settlement transactions. No placeholder address or fabricated transaction hash is valid evidence.

## Global initialization gate

Program deployment does not initialize the TIN registry state. The team must
initialize the program's global-state PDA once on Devnet before issuing any
private TIN. The initialization instruction sets the starting sequence used by
the registry; it does not create a user TIN and does not store a display name,
lookup secret, or private identity data.

Run the idempotent initializer from the repository root after deploying the
program:

```bash
npm run tin:init-global -- \
  TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT \
  ~/.config/solana/id.json \
  100000000
```

The command uses the Solana Devnet RPC selected by the TSN RPC resolver. If the
global-state PDA already exists, it reports `already_initialized` and does not
submit another transaction. If it creates the PDA, record the real Solana
signature, program ID, global-state PDA, payer, and starting sequence in the
team evidence log. Never record the keypair contents or lookup secret.

Only after this gate passes may the SDK create a private TIN issuance intent.
That intent still follows the current SDK → Node → generic Cranker → TIN
program path; global initialization is not an issuance transaction.

## Runtime configuration

The existing SDK façade accepts the protected lookup secret through its resolver options, and the TSN Node accepts the same secret through `TINS_LOOKUP_SECRET`. The value must be provisioned through the team secret store or an ignored local environment file; it must never be committed, printed, or sent to the Receiver. When the variable is absent, the Node continues using the existing route reader until the fresh private-registry deployment is activated.

## Implementation observation

The private account parser now validates the account version, active status, keyed lookup commitment, owner commitment, encrypted identity envelope, route commitments, and complete account length before returning route material. It does not read a cleartext TIN or display name from the account. The SDK resolver decrypts the identity disclosure only after the caller supplies the protected lookup secret.
