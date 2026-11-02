# TIN V1 Creation: Completion Evidence

Use separate evidence for SDK preparation, Receiver ingress, Node verification,
Cranker lease, Solana submission, and final account decoding. No one service's
success message proves the full flow.

## Minimum evidence by boundary

| Boundary | Required proof |
| --- | --- |
| SDK -> Receiver | TIN operation work ID, `RECEIVED` state, and payload commitment |
| Receiver -> Node | Node lease ID/version and state transition to `NODE_VERIFYING` |
| Node -> Receiver | `VERIFIED` decision, signed Node attestation, and matching input commitment |
| Receiver -> Cranker | Cranker lease ID/version and receipt validation result |
| Cranker -> Solana | Direct or staged step signatures, final creation signature, and transaction confirmation |
| Solana -> XP | Registry PDA owned by the TIN program, active V1 account, matching lookup commitment, and SDK identity resolution |

The Node attestation must be verified using the configured public key. Check
that the receipt work ID and input commitment match the durable Receiver item,
that the lease is current, and that the execution commitment is recomputed
from the Cranker's allowlisted work projection. For staged creation, preserve
all stage transaction signatures and identify the final signature separately;
the final signature is the transaction that creates the registry account.

## Verified creation on 2026-11-02

The [dated staged-finalization record](../../laboratory/experiments/EXP-20261102-tin-staged-finalization.md)
maps all six transactions from Receiver work
`32ccda54-4111-4273-9b48-28bac4b865b1`. Independent read-only chain checks
found each signature finalized with no transaction error. Tx 6 created the
active version-1 registry and encrypted owner recovery account, appended the
shared TIP route leaf and closed the temporary stage. The matching Receiver
record was `CONFIRMED` at state version 5 with the final signature and five
staging signatures: initializer plus four uploads.

- Final Solana transaction: [4pthJa9Wn3SmyLfB1TnqUMGPM6tZfMzYBGxpzyBUhBXvxPv1maKRTh3946wgQeB6bP2Lhimt1eCRkhgVdF6SDgLu](https://explorer.solana.com/tx/4pthJa9Wn3SmyLfB1TnqUMGPM6tZfMzYBGxpzyBUhBXvxPv1maKRTh3946wgQeB6bP2Lhimt1eCRkhgVdF6SDgLu?cluster=devnet)
- Registry PDA: `EZLPHfpq1qiPk5tsYUDM8CEAwavst23mJAGBeBowHFX1`
- Owner recovery PDA: `7LeUdvbwKuRNWoT1Gb7ebBsmahhgxZAScQv2ft3zQXYL`
- Program: `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT`

Owner envelope decryption and credit settlement were not performed. Current
[owner recovery guidance](README.md#wallet-recovery-and-resolver-boundary)
describes the implemented owner-indexed encrypted recovery PDA and SDK
decryption flow; this issuance result alone does not prove recovery on a new
device. The [Cranker map](../../laboratory/cranker-transaction-map.md) explains
all daemon transaction types and the remaining native settlement handoff issue.

## Earlier recorded creation

This page previously recorded Receiver work
`d9dd2fe9-7c9b-46fe-a19d-84780df80517`, state version 5, four staging
signatures and final transaction
[3M6rrtA3weaHFGZwYhASksZTDvknLNU8SZdkXnTzCnTLSnu6psTPfEj599f6vQTirokkUv8H89KkY7TgycfvdvPg](https://explorer.solana.com/tx/3M6rrtA3weaHFGZwYhASksZTDvknLNU8SZdkXnTzCnTLSnu6psTPfEj599f6vQTirokkUv8H89KkY7TgycfvdvPg?cluster=devnet),
registry `6U5TJ5Ar4rzU748bnE2BAg8T7zzEY5KASeTLrwEoC7JB`, under the same
TIP program. Its original observation reported `CONFIRMED` with a present Node
attestation and matching input commitment. That is a separate historical
snapshot, not the six-transaction run above; it was not independently
reverified in this task.

## Capture and handling

The local evidence collector can read the Receiver JSON store and optional
service logs. Review its output before sharing. Internal forensic captures may
contain owner signatures, encrypted envelopes, route commitments, or other
identity-bound material; keep those captures access-controlled and do not put
them in public project updates, recordings, or public repositories. For a
public demo, use only the work state, shortened identifiers, public
transaction/registry references, and the signed decision summary needed to
explain each boundary.

The project evidence bundle under `tsn-demo/evidence/tin-creation/` contains
earlier checkpoint artwork and captured JSON. It should be refreshed from the
current confirmed work before presenting those canvases as the same run. Do not
replace a missing stage with a reconstructed or inferred success state.
