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

## Observed Devnet creation

The current local Receiver store contains a real `CONFIRMED` TIN V1 work item.
The observed work ID is
`d9dd2fe9-7c9b-46fe-a19d-84780df80517`; it reached state version 5, used the
staged path, and carries four staging transaction signatures plus the final
creation transaction. The Node attestation is present and its input commitment
matches the Receiver work commitment.

- Final Solana transaction: [3M6rrtA3weaHFGZwYhASksZTDvknLNU8SZdkXnTzCnTLSnu6psTPfEj599f6vQTirokkUv8H89KkY7TgycfvdvPg](https://explorer.solana.com/tx/3M6rrtA3weaHFGZwYhASksZTDvknLNU8SZdkXnTzCnTLSnu6psTPfEj599f6vQTirokkUv8H89KkY7TgycfvdvPg?cluster=devnet)
- Registry PDA: `6U5TJ5Ar4rzU748bnE2BAg8T7zzEY5KASeTLrwEoC7JB`
- Program: `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT`
- Receiver state: `CONFIRMED`

This proves a real TIN V1 creation path completed. It does not prove that a
wallet can be reverse-indexed to its TIN: the lookup is keyed, and the current
XP only presents the value in the issuing browser session. Wallet reconnect and
cross-device recovery need an explicit owner-authorized recovery design.

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
