# TCAP credit values explained

This page explains the values used by the live TSN → TCAP credit path. They
are bindings and verification inputs, not a public balance record.

## Privacy-receiving root

The privacy-receiving root is owner-device material for receiving payments. The
root itself stays on the authorized device. A device derives a one-way
commitment from it when it needs a public routing handle. The root is not sent
to Receiver, Node, Cranker, TSN, or TCAP.

## `TCAP_TIP_ROOT_COMMITMENT`

This 32-byte commitment scopes a TCAP tip. It is the seed input for the
`tcap:tin-tip:v1` PDA. It lets the chain find the correct tip without learning
the privacy-receiving root, TIN, or wallet address.

## Tip PDA (`TCapTinTipV1`)

The tip stores the current balance commitment, transition sequence, policy
commitment, last transition nullifier, frozen flag, version, and bump. It does
not store a TIN, privacy-receiving root, seed, plaintext balance, snapshot key,
or token account. A credit advances the tip from one commitment to the next.

## Policy commitment

The policy commitment binds the tip to the policy under which transitions are
accepted. Credit arguments and the TSN authorization receipt must carry the
same value as the tip. A mismatch prevents the transition.

## Initial/genesis commitment

The initial commitment is the tip's starting state and becomes
`previous_commitment` for the first credit. A controlled Devnet fixture may
derive a deterministic nonzero genesis value; production devices must use the
owner's authorized initial state.

## Commitments and sequence

- `previous_commitment` is the commitment currently stored by the tip.
- `new_commitment` is the successor state authorized by TSN and written by
  TCAP after a successful credit.
- `sequence` is the strictly increasing transition number. TCAP requires the
  next sequence, preventing stale transitions from being replayed.

Commitments hide private balance state while binding the state transition.
They are not encryption keys and cannot be used alone to spend.

## Nullifier

A nullifier is a one-time identifier for a transition. TCAP records it in a
nullifier PDA and rejects a consumed nullifier. This protects against replay
and double application.

## GPRU scope commitment

The GPRU scope commitment binds authorization to the permitted routing and
authorization scope. GPRU is non-custodial: it never holds balances or
spendable keys. TCAP checks that the scope in the receipt matches the credit
arguments.

## TSN values

- **Mother Escrow** is the TSN authority boundary for epoch coordination and
  ConfidentialSettlement authorization.
- **Epoch ID** selects the settlement epoch. The canonical epoch commitment
  PDA is derived from Mother Escrow and this ID.
- **Accepted intent root** commits to the accepted, owner-authorized intents
  for the epoch.
- **Settlement commitment** binds the TSN settlement context carried into the
  encrypted owner snapshot.
- **Asset commitment** binds authorization to the governed TCAP asset record,
  token program, mint, and policy context.

These values let TSN and TCAP verify the same authorization without exposing a
payment identity or private balance.

## Encrypted snapshot and key

After credit, the owner device constructs a canonical private balance snapshot
and computes its commitment. The snapshot is encrypted with an owner-held
snapshot key. The encrypted record may be stored in a snapshot store, but the
key and plaintext remain under owner control. A private read fetches the tip
commitment, locates the matching ciphertext, and decrypts and verifies it
locally.

## Why the TIN stays private

The tip PDA is derived from a one-way commitment, not from a public TIN. The
tip stores no TIN field and emits no plaintext receiving root. Public chain
state contains only commitments, sequence, policy references, nullifier,
token identifier, and validity data required for verification. A commitment
does not provide a practical inverse to recover the TIN or root.

## Credit flow

```text
Owner device authorizes intent
  → SDK binds TIN route, root commitment, policy, and GPRU scope
  → Receiver stores redacted work
  → Node verifies signatures, commitments, sequence, lease, and expiry
  → Mother/TSN authorizes ConfidentialSettlement for the epoch
  → TSN CPI registers the complete TCAP receipt
  → TCAP validates receipt, advances the tip, and consumes the nullifier
  → Owner device encrypts and stores the successor private snapshot
  → Owner device reads and decrypts the private balance locally
```

## Devnet test derivations versus production material

The repository provides explicitly labelled controlled-Devnet derivations for
the fixture wallet and a test identity label. They are deterministic test
bindings, not production wallet recovery, spend keys, or claims about a real
owner balance. Production integrations must supply privacy-root, policy,
genesis, and authorization material generated and retained by the authorized
owner device and signed TSN workflow.

## Glossary

| Term | Meaning | Public on-chain? |
|---|---|---|
| TIN | Transfer Identity Number for payment identity and route discovery | No plaintext TIN on the tip |
| Privacy-receiving root | Owner-device receiving material | No |
| GPRU | Non-custodial authorization and routing scope | Only its commitment/binding |
| Tip PDA | `TCapTinTipV1` state account | Yes, commitments and control fields |
| Commitment | One-way binding to private state or authorization context | Yes, as required for verification |
| Nullifier | One-time transition identifier | Yes |
| Mother Escrow | TSN epoch coordination authority account | Yes |
| Epoch commitment | Canonical TSN state for an epoch | Yes |
| Snapshot key | Owner encryption/decryption key | No |
| Encrypted snapshot | Ciphertext containing private balance state | Ciphertext/locator may be stored; plaintext is private |
| TCAP | Transfer Confidential Asset Protocol private balance accounting layer | Program state public; balances encrypted |

ZK-PRU is retired historical material and is not part of the live receiving,
credit, balance, or spending architecture.
