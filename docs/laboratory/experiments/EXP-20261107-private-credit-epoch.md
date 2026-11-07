# Private credit and complete epoch accounting: offline validation

**Status: EXPERIMENTAL replacement with scoped VERIFIED offline checks, 2026-11-07.** [ADR-005](../decisions/ADR-005-private-amount-and-adaptive-pools.md) defines the adopted contract and [ABI](../credit-abi.md) defines exact account/wire layouts. No program was deployed, chain transaction submitted, user environment updated or service started/stopped in this validation.

## Implementation and local checks

Individual credit now uses positive private u64 amount, nonzero fresh BN254 blinding and a token/nullifier-bound Poseidon5 commitment. The 905-byte TSNP V3 has sixteen outer accounts, readonly reserve/sealed pool and writable private root/epoch. Credit updates the shared head/nullifier root plus blinded epoch digest without public liability reclassification. Separate five-input proof opens all 2–64 ordered accepted commitments before TCAP reclassifies only the authenticated total once; replay and failed arithmetic leave state unchanged.

Pool capture uses chain-current funding root, two positive unspent member notes and two source wallets, with shared windows adapting to qualified arrivals. Zero-value/duplicate/spent/nonmember notes do not inflate admission. Later deposits preserve sealed membership. Receiver inventory and lease queues paginate, native verification serializes, waiting/unsigned stale work defers, and signed uncertain work remains locked for exact finalized receipt reconciliation. Pool/epoch public execution projections exclude private source lists/openings. Native System program zero-address encoding was repaired after the real SDK wire exposed an extra base58 digit.

The hidden-head Python suite passed 48 tests, including honest/mutated circuit witnesses and real Groth16 generation/serialized reverification. Private coordination passed eight tests including complete epoch real proof/reverification and mutations to every public input, private opening/order checks, later-deposit sealed recovery and unsigned stale-work deferral. Eleven precondition tests and the canonical System address round-trip test passed. The final attestation/projection suite passed nine tests. The encrypted native credit fixture is 3344/4096 bytes, with 905 authorization and 1660 Memo bytes, eighteen distinct accounts and two signers; it stops before any signature or broadcast.

Receiver full test/typecheck passed nineteen tests covering privacy projection, paginated inventory/leases, concurrent serialization, deferred work, uncertain accounting lock, durable receipt repair and late report reconciliation. The pool/epoch receipt fixtures reject changed version, bump, asset/root/epoch/token/seed/digest/count/release fields and extra writable permissions. Their synthetic signatures are isolated fixture keys; their proof bytes are serialization fixtures, not chain-accepted aggregate proofs.

SDK build and the combined funding/current/historical owner-history suite passed all twenty-two tests. The combined funding/history/owner suite initially exposed a stale V2 import and a new assertion using the wrong decoded field; both fixtures were corrected. The historical twelve-input, historical thirteen-input amount-public and current thirteen-input private-amount readers remain independent of the sole active V3 builder. Cranker sealed-pool gate, exact HTTP transport/checkpoint and confirmed-report tests passed nine focused tests. Hidden-head setup tests passed five tests; epoch initialization/resume/rekey passed two tests and reconstructs six IC points in four packets within 1232 bytes.

Native GPRU tests passed seven ordinary tests and two explicit serialized real-proof tests: credit and epoch pairing verification reject changed public inputs. TCAP native tests passed three accounting/conservation/capacity tests, and TSNP native cargo check passed with the TCAP dependency. These are host checks, not SBF execution or deployment.

## Matching isolated development artifacts

The source compiled 174421 nonlinear credit constraints with thirteen public inputs and 42614 epoch constraints with five. Single-machine development setup verified supplied prepared Ptau and each zkey against its R1CS, then exported exact circuit-specific keys. Honest proofs were generated and verified with both JavaScript and serialized Rust pairing code. This is not a production ceremony or independent circuit audit.

Credit R1CS SHA256: `1d52b9bd8954c918e0eb43905a42c1cf9dcd5fb9b5b522dd1b6980805cd89722`.
Credit WASM SHA256: `44f01db2bcd085406d2a9974c0ed71ea2233ff63c30dee156a2f96e72b55d9f0`.
Credit circuit commitment: `8f5577274695cc89c4848202a1f1b5fcb80ff21167a2099da01f07f44f7aaea6`.
Credit key commitment: `fb0ec07e5fd40dad3688e01b8091549f5a1c8d62ef06e1e7b1308f9d5a5dee8a`.

Epoch R1CS SHA256: `918085b64af82b6a0f99ccf405fce87b823a5356fd5b09491d3e071f7afe1425`.
Epoch WASM SHA256: `35dc05d55a3376d7d989460fd40023712c161dee243184905934d67e2ea3272c`.
Epoch circuit commitment: `d5484880a682c14920b816234f6217c1c8537c852a7cc1344487f4a72187bc19`.
Epoch key commitment: `b757d8f352571dcb1360b654f4c4e177445a2d4c8721c5fccad0d8f5314111d6`.

The portable epoch compile command was verified in a separate output directory on Windows. Its R1CS and WASM hashes exactly matched the proof artifacts above, confirming the fixed WASI mounts/path handling produce the same circuit. Artifacts remain isolated and were not copied into live configuration. [Operator procedure](../../RUN-YOUR-OWN-TSN.md) documents persistent matching sets, explicit existing-V2 credit rekey, separate epoch enrollment and six exact epoch variables. Retain the protected opening journal for accounting/recovery; public chain history cannot recover lost private openings.

## Documentation synchronization and repeatable checks

The review explicitly read repository instructions, architecture map/ABI, terminology, architecture-change policy, operator-guide policy and documentation maintenance. Program credit/epoch/pool and GPRU statements were reconciled with SDK serialization/history, Node proving/authorization, Receiver projection/receipts/leases and Cranker submission. Canonical ABI/components/cryptography/invariants and ADR-005 hold the detailed source pointers; historical transaction records retain their original versions.

Documentation impact includes both README diagrams, operator/prover/fund-protection runbooks, Laboratory architecture/foundations/transaction/testing/status records, persistent agent guidance and the public layer, service, SDK, security, overview, lifecycle, testing and capability pages. Generated SDK/interface catalogs and examples were refreshed. Remaining current summaries using the old public amount/signature-nullifier/per-credit liability semantics were corrected; page dispositions explicitly distinguish the experimental replacement from activation.

From a dependency-installed checkout, these checks reproduce the bounded initializer, history and documentation-example scopes:

```powershell
node --test scripts/tests/hidden-head-setup.test.mjs scripts/tests/tcap-epoch-setup.test.mjs
node --test tsn-protocol/sdks/tsn-sdk/tests/funding-note.test.mjs tsn-protocol/sdks/tsn-sdk/tests/gpru-chain-history.test.mjs tsn-protocol/sdks/tsn-sdk/tests/tin-owner-balance.test.mjs
npm run tsn:receiver:test
node docs/references/tooling/verify-sdk-examples.mjs
```

The Python runs used the local virtualenv with isolated compiled circuits, matching development prover sets and debug native library; opt-in real-proof tests need those prerequisites. The retained validation runner selected `test_hidden_head*.py`, `test_private_credit_coordination.py`, `test_hidden_head_preconditions.py`, `test_hidden_head_attestation.py` and `test_solana_pubkey.py` under Node's tests directory. The [operator/artifact guide](../../GROTH16-PROVER-AND-KEY-ARTIFACTS.md) identifies configuration and matching-key prerequisites. Neither these commands nor host proof tests establish SBF execution.

Final documentation validation covered 276 documents and 36 explicit claim selectors, with zero local link/navigation issues. MDX compiled 103 pages and Mermaid parsed 38 diagrams with no failures. Tracked whitespace checks and direct trailing-whitespace inspection of 75 added text files passed. [Inventory](../../references/documentation-inventory.json), [claim review](../../references/claim-review.json), [local link check](../../references/link-check.json) and [syntax report](../../references/syntax-check.json) retain scope. Five SDK examples type-checked and nine offline preparation/transport scenarios passed; the owner-balance and wallet-credit callbacks were not executed live. Parsing does not establish visual rendering or publication.

## November 7 operator activation preparation checkpoint

The operator reported successful program deployments and the Windows native release build after the original offline validation. This is operator-reported deployment evidence; the assistant did not independently compare deployed binaries. The matching development sets were retained outside Temp in ignored `protocol-test-runs/private-credit-20261107/credit` and `epoch`. Checks verified the source, R1CS, WASM, zkey and VK hashes for each set, initializer/runtime VK byte agreement, and the circuit/key commitments recorded above. The configured Windows release DLL passed the Poseidon reference vector and arities 1–5.

Node's `.env` now persists the twelve credit/epoch artifact settings and native-library path. Only those thirteen duplicate overrides were removed from `.env.local`; private backups were retained. A check using the service virtualenv and `dotenv_values` confirmed exact settings, existing configured paths, no remaining artifact overrides, and unchanged unrelated configuration and witness-directory setting. No witness or Receiver-store data was modified.

Read-only Devnet plans at slots 519695668–519695833 observed the active TCAP root at sequence 5, funding leaf count 1, a different enabled V2 credit key and a missing epoch verifier. The credit-rekey plan contains six packets (757, 506, 506, 506, 378, 244 bytes); epoch initialization contains four (790, 506, 378, 244). Ordinary credit initialization correctly refused to overwrite the different existing key. [The internal activation procedure](../../RUN-YOUR-OWN-TSN.md#existing-reference-devnet-activation-november-7-local-preparation) records exact user-executed commands and disabled-upload recovery. No transaction was signed/submitted, service controlled, program deployed or Git commit/push performed by the assistant. Matching on-chain activation and live private-credit/epoch accounting remain unverified.

## November 7 live deposit and pool-timing checkpoint

Read-only RPC checks verified successful TCAP deposits `4BPGCpbnTcCuhusNkJuySRYqMvL8bUXYbPcSVR69SMhc5TMR3KqVZ7Q5oqV4p393Q7D5vKcKripPzvTHso2VEQXL` at slot 519698598 and `57bwEfrCcVCJUGx8eWMQbgTr4p8geSjBWsrxWo9CKdMfiL6mKMRguVf7fQnPifkheFBcR4nLdBaM7FoqsE7TH3Gs` at slot 519700332. Each had null transaction error, one token transfer and a different wallet signer. Receiver marked both funding work items CONFIRMED; the corresponding settlement work was still RECEIVED. No private opening, amount or replayable service credential was emitted in the retained summary.

At slot 519703343, the ordinary credit initializer reported the existing enabled verifier matched the exact replacement key without transactions. The epoch initializer also reported its enabled key already matched. The TCAP state root remained at sequence 5, while the funding tree had three leaves. These checks verify account/key activation and the two deposits, not deployed-binary equivalence or private-credit/epoch execution.

The supplied Node log showed pool verification followed by repeated authorization HTTP 409 and pool work leasing at increasing versions. Its stored public projection counted two eligible notes/two wallets, with release slot 519701472. Source review found that release was selected from a slot read before the expensive funding census; later authorization rejected a passed release boundary. The corrected Node rereads the funding root/count after the census, selects a common boundary with twice the observed census duration plus 48 slots of transport/RPC budget (capped at 4800 before rounding), and rechecks freshness after each authorization census. Root changes, insufficient sources, expiry and changed leases still reject. A sanitized `TCAP_POOL_CAPTURE_STALE` log now identifies this retry condition.

Offline verification selected `test_private_credit_coordination.py`, `test_hidden_head_preconditions.py` and `test_hidden_head_attestation.py` through the service virtualenv with the configured Windows release DLL: 32 tests ran, 30 passed and two opt-in circuit/real-proof checks were skipped. Regression coverage includes release expiring during the census, post-census scheduling, changed root/count, backward RPC context, two-source enforcement, bounded shared windows, readonly-reserve preconditions and private execution projection. Circuits, program ABI, keys, SDK, Receiver and Cranker were unchanged by this timing repair. Documentation and whitespace checks are recorded separately. No service was started/stopped, transaction signed/submitted, deployment issued or Receiver/witness data changed by the assistant. Node reload and successful resumed pool capture, private credit, owner recovery and epoch accounting remain unverified.

## Unverified activation and privacy

SBF build could not start because WSL VM startup failed with `HCS_E_CONNECTION_TIMEOUT`, before program compilation. WSL/services were not restarted. SBF binaries, CPI runtime/compute/stack behavior, matching on-chain keys, account activation, real multiwallet pools, complete epoch accounting, restart/lost-opening recovery and independently observed reserve deltas remain unverified. No live-chain privacy claim is established.

Historical deposits/credits retain their public disclosures. New credit hides its serialized amount and per-credit liability delta, while public deposit amounts, epoch totals, token, roots, ciphertext, accounts, timing and known prior spends can permit inference. Wallet addresses do not prove independent people. Recipient-registry/head correlations, Node knowledge, busy/sparse latency, census cost and 10000-leaf/signature reconstruction bounds need separate review. Current scheduling is common release windows with serialized queue order, not an atomic batch or cryptographically private shuffle. Liquidity-provider admission, continuous fee rewards and enabled exit are outside this implementation.
