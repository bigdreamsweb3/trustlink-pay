# Cranker transaction submission map

**Status: EXPERIMENTAL private-credit source map, reviewed 2026-11-07.** Dated TIN, twelve-input and amount-public funded-note receipts below preserve historical live observations. The [November 7 experiment](experiments/EXP-20261107-private-credit-epoch.md) records current offline checks; SBF/activation/live accounting remain unverified. This page maps the [current daemon](../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts) and retains [TIN](experiments/EXP-20261102-tin-staged-finalization.md) and [first-credit](experiments/EXP-20261102-native-credit-baseline.md) evidence with its original scope.

## Work, transaction and instruction boundaries

A Receiver work item is a durable service task. A transaction is a signed message submitted to a chain and identified by a signature or transaction hash. Instructions execute inside that transaction; a cross-program invocation (CPI) lets one Solana program call another without creating a new transaction. One TIN work item can therefore produce several upload transactions, while one native-credit transaction can execute TSNP, TCAP, GPRU and Memo instructions atomically.

Receiver persists work and controls versioned leases. Node verifies the request and signs an execution receipt. Cranker claims verified work, validates that receipt against its pinned Node public key, submits the permitted chain message and reports its result. Mother authority is a separate settlement transaction signer. An HTTP acceptance, Node decision, lease or `tx sent` message establishes its own boundary; successful chain execution and the expected account state need separate evidence.

```mermaid
flowchart TB
  subgraph S1["1 Â· Owner / application"]
    A["Approve the request<br/>Funding: sign exact deposit wire<br/>TIN: sign creation intent"]
  end
  subgraph S2["2 Â· Receiver and Node"]
    R["Receiver persists RECEIVED work<br/>Node leases and verifies it"]
    N["Node returns signed VERIFIED receipt<br/>Cranker receives allowlisted execution fields"]
    R --> N
  end
  subgraph S3["3 Â· Cranker dispatch"]
    C["Claim VERIFIED work<br/>Verify receipt context, signature<br/>and execution commitment"]
    F["AUTHORIZED_FUNDING<br/>Unchanged owner-signed deposit"]
    I["TIN_OPERATION<br/>Direct creation or staged uploads + finalize"]
    H["SETTLEMENT / native credit<br/>Requires complete current-lease authorization<br/>and Mother co-signature"]
    E["SETTLEMENT / Creditcoin<br/>Requires route-specific signed authorization"]
    C --> F
    C --> I
    C --> H
    P["TCAP_FUNDING_POOL<br/>Seal qualified immutable funding root"]
    Q["TCAP_EPOCH_ACCOUNTING<br/>Verify complete aggregate and reclassify once"]
    C --> E
    C --> P
    C --> Q
  end
  subgraph S4["4 Â· Chain execution"]
    PF["TCAP deposit_private_funding_v1<br/>Reserve receives assets; funded leaf appends"]
    PI["TIP creation<br/>Registry, recovery and shared route root"]
    PH["One native-credit transaction<br/>TSNP â†’ TCAP â†’ GPRU, followed by Memo<br/>Atomic root / blinded epoch transcript"]
    PE["Creditcoin hub executeSettlement<br/>Successful receipt + publication event"]
  end
  subgraph S5["5 Â· Evidence and recovery"]
    O["Cranker checks branch result<br/>Receiver records CONFIRMED or FAILED<br/>Owner recovery / destination payout checked separately"]
    B["Native readiness gates<br/>Root-matching snapshots, verified proof<br/>and current lease authorization"]
  end
  A --> R
  N --> C
  F --> PF --> O
  I --> PI --> O
  H --> PH --> O
  E --> PE --> O
  P --> O
  Q --> O
  B -. "required before native submission" .-> H
  classDef device fill:#edf3ec,stroke:#52634f,color:#253322;
  classDef receiver fill:#f6f0df,stroke:#8c7a45,color:#40371f;
  classDef node fill:#e9efed,stroke:#536d63,color:#263a32;
  classDef submission fill:#f2eee6,stroke:#88765b,color:#403525;
  classDef program fill:#e7eee9,stroke:#536c5b,color:#263a2c;
  classDef evidence fill:#fbf6e9,stroke:#998451,color:#463d26;
  class A device;
  class R receiver;
  class N node;
  class C,F,I,H,E,P,Q submission;
  class PF,PI,PH,PE program;
  class O,B evidence;
```

The settlement arrows describe the implemented submitter branches and their required inputs. The later finalized-credit checkpoint establishes target-cluster acceptance for that exact original V1 transaction; it does not establish live confirmation by the replacement HTTP sender or Creditcoin execution.

## Dispatcher coverage

`main()` requests `AUTHORIZED_FUNDING`, `TIN_OPERATION`, `SETTLEMENT`, `TCAP_FUNDING_POOL` and `TCAP_EPOCH_ACCOUNTING`, verifies the Node attestation and dispatches the permitted branch. Transaction counts exclude setup/deployment and retries.

| Receiver work / branch | Normal chain transactions | Transaction signer and fee payer | Submission path | Result evidence |
| --- | --- | --- | --- | --- |
| `AUTHORIZED_FUNDING` | One owner-approved TCAP deposit | Signers and payer already fixed in the wallet-signed wire; the current SDK sets the depositor as payer | Web3 legacy `sendRawTransaction`, byte-for-byte unchanged | `TCAP_DEPOSIT_ASSET_V2_CONFIRMED` and deposit signature |
| `TIN_OPERATION`, direct | One creation transaction | Cranker signs and pays; owner approval is an Ed25519 instruction | Web3 legacy transaction, complete size at most 1,232 bytes | `TIN_V1_REGISTRY_CREATED` and final signature |
| `TIN_OPERATION`, staged | Initializer + bounded uploads + finalizer | Cranker signs and pays each transaction; owner approval is checked at finalization | Separate Web3 legacy transactions, each at most 1,232 bytes | Final signature, stage address and all staging signatures |
| `SETTLEMENT`, native | One TSNP credit call followed by its Memo | Cranker is fee payer; Mother authority also signs the exact message | Application-owned Kit V1 builder with HTTP confirmation | `TCAP_GPRU_MEMO_CREDIT_V1_CONFIRMED`, signature and root sequence |
| `TCAP_FUNDING_POOL` | One TCAP pool-capture call | Cranker pays; Mother co-signs exact authorized message | Native wire and HTTP confirmation | `TCAP_FUNDING_POOL_V1_CONFIRMED` and signature |
| `TCAP_EPOCH_ACCOUNTING` | One complete epoch-accounting call | Cranker pays; Mother co-signs exact authorized message | Native wire and HTTP confirmation | `TCAP_EPOCH_ACCOUNTING_V1_CONFIRMED` and signature |
| `SETTLEMENT`, Creditcoin | One EVM hub call | Configured Creditcoin executor wallet signs and pays gas | Ethers `executeSettlement()` | `CREDITCOIN_SETTLEMENT_SUBMITTED`, transaction hash and message ID |

The daemon does not pay the owner-signed funding transaction's network fee merely because it broadcasts that wire. TIN rent and Cranker network fees are distinct from asset amounts and protocol fee policy. Individual private credit leaves public liabilities unchanged; complete epoch accounting reclassifies the authenticated aggregate once.

## Common service gates and reporting

The daemon selects Receiver, establishes its wallet challenge/session authentication and resolves RPC using the existing configuration. `lease()` calls Receiver `/api/cranker/work` for supported kinds. Receiver returns a privacy-minimized view, the active Cranker lease, Node attestation and, for settlement, a freshly requested authorization. A settlement authorization failure can occur inside that POST before a work item reaches the daemon.

`verifyNodeAttestation()` requires the pinned Node key, checks version/algorithm, work ID/kind, `VERIFIED` decision, input commitment, verification type and key ID, recomputes the execution commitment from the branch's allowlist, and verifies the Ed25519 receipt. These are off-chain checks. The chain independently enforces transaction signatures and the called programs' account/proof constraints.

Typical successful coordination is `RECEIVED â†’ NODE_VERIFYING â†’ VERIFIED â†’ CRANKER_LEASED â†’ CONFIRMED`. Node rejection uses `REJECTED`; processing exceptions cause the daemon to attempt `FAILED`. Receiver also supports `SUBMITTED`, but this daemon's `report()` sends terminal `CONFIRMED` or `FAILED` reports. A console `tx sent` entry does not itself transition Receiver to `SUBMITTED`.

Reports use the leased work's `stateVersion`, operator identity and evidence. An HTTP report failure cannot reverse a chain transaction. After a submission timeout or a later account-read failure, reconcile the known signature and account state before retrying; a service-level `FAILED` result alone does not prove that nothing executed.

Source: [daemon](../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts), [Cranker API](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts), [Receiver transitions](../../tsn-protocol/services/tsn-receiver/lib/store.ts), [execution projection](../../tsn-protocol/services/tsn-receiver/lib/work-contract.ts).

## 1. Wallet reserve funding

`processAuthorizedFunding()` accepts only verified `senderFundingMode=tcap_funded_note_v1` work containing the sender-signed wire. It decodes canonical base64, parses a legacy transaction, requires all transaction signatures to verify, and requires reserialization to match the original bytes. The wire contains the note commitment and canonical global funding-root account; Cranker receives no private opening. It never changes the payer, blockhash, instruction accounts or amount.

The SDK funded-note builder sets depositor as payer. `deposit_private_funding_v1` supplies depositor, config, asset entry, reserve, source token account, vault, mint, Token Program and writable global funding root. TCAP validates policy/relationships and the actual token transfer, creates pending obligations and appends an exact asset/amount-bound leaf. Retained `deposit_asset_v2` is a distinct general-deposit capability; native funded-note credit requires the nine-account leaf-producing deposit.

The daemon uses `sendRawTransaction(wire, {skipPreflight: false, preflightCommitment: "confirmed"})`, requires the returned signature to equal the existing transaction signature, then polls signature status until `confirmed` or `finalized` with no error. Success reports `TCAP_DEPOSIT_ASSET_V2_CONFIRMED`. Confirmed funding makes the linked settlement eligible for independent Node verification; it does not complete recipient credit.

An `already processed` response triggers status reconciliation of the existing signature. A `Blockhash not found` response may send the **same wire** through `TSN_RPC_FALLBACK_URL`, or public Devnet when that variable is absent, provided it differs from the selected RPC. This handles an RPC visibility difference; it cannot revive an expired signature. Expiry requires a rebuilt transaction and fresh owner approval/signature through the normal application flow.

Source: [deposit builder](../../tsn-protocol/sdks/tsn-sdk/src/tcap-gpru-credit.ts), [funding note](../../tsn-protocol/sdks/tsn-sdk/src/gpru/funding-note.ts), [funded deposit handler](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_private_funding_v1.rs), `processAuthorizedFunding()` in the daemon.

## 2. Direct TIN creation

`processTinOperation()` executes only verified `intentType=tin_creation` work with the current route/key versions and encrypted identity, recovery and master-seed envelopes. It validates the ElGamal public-key commitment, derives the registry from the keyed lookup commitment and builds the owner approval instruction from the already signed canonical intent. The private envelopes remain encrypted in instruction data.

The complete direct transaction contains, in order, a **1,400,000-unit Compute Budget request**, **owner Ed25519 approval**, and **TIP `CreateTinV1`, tag 17**. Size selection includes all three instructions, account keys, blockhash and transaction signatures. At most 1,232 bytes uses the direct branch; a larger candidate selects staging before submission.

TIP receives Cranker payer, global state, shared route root, commitment-addressed registry, owner recovery PDA, instructions sysvar and System Program. It verifies expiry, current route/key/policy fields, intent hash, preceding owner approval and account derivations, and rejects an existing registry or owner recovery account. It creates registry/recovery accounts, appends the authenticated route leaf and increments the global sequence within the same transaction.

The daemon calls `confirmTransaction(..., "confirmed")`, reads the registry and checks TIP ownership, registry version **1**, active status and lookup commitment before reporting `TIN_V1_REGISTRY_CREATED`. For independent evidence, also inspect the transaction's chain error and recovery/root state; a creation log is less complete than that check. The owner is an approval-message signer here, not a second transaction fee payer or a Mother-authority signer.

## 3. Staged TIN creation

`submitStagedTinV1Creation()` splits the **encrypted bytes** across transactions while preserving the same owner-bound creation contract:

1. **Initialize, tag 19.** Cranker funds a staging PDA derived from owner and intent hash, supplies declared envelope lengths and public creation commitments, and allocates zero-filled buffers. This creates temporary storage, not an active registry.
2. **Append chunks, tag 20.** The daemon uploads identity (`kind=0`), owner recovery (`kind=3`) and master seed (`kind=1`) in that order, using at most 700 bytes per instruction. Each transaction confirms before the next is sent. TIP checks the stage owner/layout/PDA, expiry, bounds and sequential written offsets; an already written identical chunk can be accepted, while conflicting bytes or gaps are rejected.
3. **Finalize, tag 21.** One transaction contains the 1,400,000-unit compute request, owner Ed25519 approval and finalize instruction. TIP requires all buffers complete, reconstructs and verifies the owner-bound request, creates registry/recovery accounts and appends the route leaf through the same creation handler. It closes the stage and returns its lamports to the finalization payer atomically with creation.

For nonempty envelope sizes `I`, `R` and `S`, this daemon submits `2 + ceil(I/700) + ceil(R/700) + ceil(S/700)` transactions. The recorded run used 76, 91 and 874 bytes, yielding **six** transactions. The direct candidate was 2,315 bytes; the largest submitted packet was 987 bytes.

Initializer and upload transactions already confirmed remain on chain if finalization fails. They do not establish an issued TIN, and the staged sequence as a whole is not one atomic transaction. Program-level initializer/chunk idempotency does not establish automatic daemon restart/resumption or authorize replaying an expired owner request. An expired-stage close instruction exists as tag 22, but this daemon does not dispatch it; use a separately reviewed cleanup procedure.

After finalization, the result stores the final signature separately from `stagingSignatures`, whose first entry is the initializer. In the run, five staging signatures mean **one initializer plus four uploads**. The `TIN stage initialized workId=...` log prints `payload.intentId`; other work logs use Receiver `work.id`. Preserve that distinction when correlating records.

Source: [TIP staging handler](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs), [shared creation handler](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs), [state/layout versions](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs), [SDK serializers](../../tsn-protocol/sdks/tsn-sdk/src/tins.ts), [six-transaction evidence](experiments/EXP-20261102-tin-staged-finalization.md).

## 4. Native hidden-head credit settlement

`processSettlement()` requires `TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3`, an exact transition and current unexpired lease. It authenticates Mother Escrow, the thirteen-input proof and immutable released sealed pool, then builds the 905-byte TSNP V3 instruction with sixteen accounts followed by the canonical bound Memo. Private openings stay outside Cranker execution. See [the ABI](credit-abi.md) for exact root/epoch/key requirements.

Before signing, Cranker reads the TCAP commitment-root account and checks its owner, discriminator, 124-byte layout, previous-root value and next sequence. `sendMotherNodeCoSignedInstruction()` makes Cranker the payer and requests a remote signature for the exact message through Receiver `/api/cranker/settlement-signature`. Node's Mother signer verifies the leased statement; the returned authority must match Mother Escrow and the signature must be correctly encoded. The Mother private key is not provided to Cranker.

Current experimental credit calls TSNP V3 → TCAP `credit_gpru_memo_v2` → GPRU `verify_hidden_head_transition_v2`, followed by its proof-bound Memo. The 905-byte instruction has sixteen outer accounts, readonly reserve/sealed pool and writable root/epoch. After verification TCAP updates the shared head/nullifier root and blinded epoch digest without tokens moving or liabilities changing. Dedicated pool capture and complete epoch accounting are separate Cranker submissions; the latter authenticates all 2–64 accepted commitments before one aggregate reclassification. [ABI](credit-abi.md) records exact layouts; dated receipts below retain older semantics.

After the transport confirms, Cranker reads the root again and requires the expected old-root predecessor, new root and sequence before reporting `TCAP_GPRU_MEMO_CREDIT_V1_CONFIRMED`. Failure of this credit transaction cannot undo the earlier reserve deposit. Owner Memo scanning/decryption and balance reconciliation remain separate completion checks.

### Native V1 transport and confirmation

The [application-owned settlement transport](../../tsn-protocol/services/tsn-cranker-op-daemon/src/dbrix/settlement-transport.ts) preserves the installed DBrix 0.2 message contract using pinned Kit 8.5.0: actual `version: 1`, a confirmed blockhash, payer/Mother signers, 1,400,000 compute units, a 64 MiB loaded-account limit and the 4,096-byte limit. It broadcasts once through the configured HTTP RPC and polls `getSignatureStatuses` through HTTP, with a 40-second confirmation deadline. Funding/TIN retain their distinct legacy 1,232-byte transport.

Before broadcasting, Cranker authenticates `PUT /api/cranker/work` to save signature, blockhash, last-valid block height, wire hash/size and signed-attempt stage. Receiver checks the native authorization, current work version and active operator lease, preserves the lease generation and rejects a different replacement attempt. An unacknowledged checkpoint prevents broadcast. Later errors retain this signature in the FAILED result. Lease expiry with a recorded attempt also becomes FAILED rather than automatically rebuilding; that signature requires reconciliation. This signed checkpoint does not claim chain submission or confirmation.

The previous DBrix sender derived `ws://127.0.0.1:8787/`, while gateway upgrade handling accepts `/ws`. Kit sent through HTTP before starting WebSocket confirmation, so a WebSocket error could follow a successful chain transaction. The later checkpoint below verifies one 2,909-byte V1 Devnet credit. Its success establishes that specific encoding/run; the replacement HTTP sender is verified offline and requires an operator reload before live use.

### Node/Receiver lease authorization

The earlier November 2 source checkpoint returned only `{transition, workStateVersion}`, omitting Receiver's lease fields and Cranker's authorization kind. The corrected `create_settlement_authorization()` returns `kind=TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2`, the exact verified transition, `workStateVersion`, `leaseId`, `leaseVersion`, `leaseExpiresAt` and `expiresAtTs`. Expiry is bounded to the current Receiver lease, and a changed lease/version during proof reverification rejects the response.

[Local authorization tests](../../tsn-protocol/services/tsn-node/tests/test_hidden_head_authorization.py) exercise the actual handler with synthetic funding/proof services, checking envelope fields, unrelated/expired leases and lease rotation. Existing attestation tests separately reject substituted transition/Memo/proof data. These tests do not submit settlement or establish DBrix V1 cluster support.

Source: [Node authorization/signing handlers](../../tsn-protocol/services/tsn-node/server.py), [Receiver authorization attachment](../../tsn-protocol/services/tsn-receiver/lib/store.ts), [Cranker API forwarding](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts), [Memo builder](../../tsn-protocol/services/tsn-cranker-op-daemon/src/dbrix/settlement-memo.ts), [complete program/account ABI](credit-abi.md).

### Automatic TIP membership synchronization, 2026-11-03

Node now calls [the automatic synchronizer](../../tsn-protocol/services/tsn-node/tip_snapshot_sync.py) before settlement proving. It validates the selected snapshot or reconstructs missing route leaves from confirmed direct/staged creation receipts, using invocation-bound TIP append indices. Registry bindings, ordered root/count equality and a second chain read gate immutable publication. Prior snapshots remain available; missing required history or changed roots fail verification. The manual script below shares the same validation/publication implementation and remains an explicit diagnostic. The current source bounds synchronization to 10,000 routes and 10,000 scanned signatures.

The reproduced failure had three on-chain TIP routes but only two routes in the newest local snapshot; TCAP's sequence-three snapshot existed. Read-only Receiver checks found funding `fc9172ea-5be2-4d9e-ab47-2d9b6d8be7b7` CONFIRMED at version 5 and settlement `settlement-3c3bde29d4e5cf7fa875effef843e114` REJECTED at version 3 without a submission signature. Automatic synchronization prevents this missing-TIP-file rejection during future verification when required history is available. It does not reset already rejected work; that existing settlement still needs the guarded retry after Node reload. No service restart or settlement retry was performed for this implementation.

### Confirmed funding and missing TIP snapshot, 2026-11-02

Funding work `66a4e481-b473-4815-9bf2-93f8afd59a9e` reached Receiver `CONFIRMED`, version 5. Its deposit signature `5HyuhK9HA56cwwtbykeTQLKRT6FNwQqeg4Ncb52zdkNwAKUEWpyZtzvMzDqWVtyWXejMShQu7utgJ5566nvZJN7o` independently returned successful Devnet execution at slot 517892485, `err=null`, fee 5,000 lamports. This establishes the authorized 0.1 Devnet USDC reserve funding, not recipient credit.

Settlement `settlement-9ca206a7be1e5fca870e6a32e5ef7e1d` reached `REJECTED`, version 3, with `GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: no snapshot for the chain-selected root`. The TCAP sequence-zero snapshot existed. TIP's confirmed root had advanced to two leaves while the local TIP snapshot contained one. [The snapshot utility](../../scripts/sync-tip-witness.py) verified the old ordered root, decoded the new active registry's route fields while skipping encrypted envelopes, appended its leaf and required an exact match to the current root/count. A second confirmed root read preceded immutable publication of `tip-01971b68089c1e95637ee522bd72678df2e7d2c20e5d5fc7354b58122c94e63d.json`; the original snapshot was preserved.

Repairing a snapshot does not requeue rejected work. The authenticated `POST /api/internal/node/work/retry` accepts `{id, expectedVersion}` only for an unsubmitted settlement rejected for missing snapshots, the exact TCAP asset-preflight reason described below, the exact funded-root change reason, or the former error `GPRU transaction record is missing its twelve public hidden-head inputs`, with its original confirmed funding and deterministic lineage intact. It preserves the payload/commitment and rejection in `retryHistory`, increments the version, clears verification/leases and wakes Node for a new independent verification/proof. [Retry tests](../../tsn-protocol/services/tsn-receiver/tests/settlement-retry.test.mjs) use an isolated store and check the supported reasons, authentication, stale versions, funding/lineage, ambiguous execution, existing leases/authorization, duplicate rejection and funding/history preservation.

From the root, [the operator utility](../../scripts/retry-settlement-snapshot.py) reads Node's configured Receiver credential without displaying it. This command uses the later observed version 10; version 3 above is the historical snapshot rejection:

```powershell
.\.venv\Scripts\python.exe scripts/retry-settlement-snapshot.py --work-id settlement-9ca206a7be1e5fca870e6a32e5ef7e1d --expected-version 10
```

The default command is read-only. After loading the corrected Node/Receiver source and checking the existing services, adding `--execute` explicitly requeues this settlement and can cause Cranker submission. It never resends reserve funding. The live record was inspected but not requeued by this repair; settlement, liability mutation, DBrix acceptance and owner balance recovery remain unverified. Do not make a second deposit to recover this funded work.

### Corrected TCAP asset preflight, 2026-11-02

After the operator requeued the version-3 snapshot rejection, later verification rejected the same settlement at version 10 with `TCAP settlement asset is unavailable or its reserve binding is invalid`. Node's preflight incorrectly required bytes 245â€“248 to equal `(1,1,0,0)`, mixing deposit/withdrawal flags with pause/transfer-fee policy. The [Borsh asset layout](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs) instead places status at 283, risk at 284 and deprecated at 285, after governance approval. The [credit handler](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs) requires Active, Approved, unpaused and nondeprecated state plus the correct reserve; it does not require withdrawals enabled or zero policy flags.

The [Node preflight](../../tsn-protocol/services/tsn-node/server.py) now matches those credit predicates. Its regression fixture serializes the declared Borsh field order, accepts disabled withdrawals/nonzero policies and rejects actual status/risk/pause/deprecation or reserve-binding violations. Read-only Devnet validation at slot 517908759 passed the corrected config/root/asset/reserve/slot/solvency checks for 100000 base units. The asset was Active/Approved, unpaused and nondeprecated, with withdrawals disabled; TCAP's root sequence remained zero. Funding remained CONFIRMED at version 5, with no recorded settlement signature.

The existing retry endpoint and utility now admit this exact repaired asset-preflight rejection as well as missing-snapshot rejection. Other reasons remain excluded, and a retry cannot bypass new Node verification or program checks. Reload Node and Receiver in their existing service terminals using `npm run tsn:node:dev` and `npm run tsn:receiver:dev`, then inspect the latest version and explicitly add `--execute` to the command above. Version 10 is an observation, not a permanent retry value. This repair did not requeue work, sign a transaction or implement a refund; live settlement and owner recovery remain unverified.

### Node verification lease renewal, 2026-11-02

The operator's next retry leased this same settlement at version 12 at 17:14:22 local time. Its decision PATCH returned 409 at 17:15:29, about 67 seconds later; the Receiver lease lasted only 60 seconds. Node then reclaimed the expired work at version 14 and repeated verification. A subsequent read-only store observation found NODE_VERIFYING at version 20, no settlement authorization/result and the original funding still CONFIRMED at version 5. This is a coordination expiry failure before Cranker execution, rather than evidence that the deposit failed.

[Receiver renewal](../../tsn-protocol/services/tsn-receiver/lib/store.ts) and the authenticated work PUT handler now extend only the same unexpired NODE_VERIFYING claim, checking owner, work version, lease ID and lease version within a transaction. Expiry moves to 60 seconds after renewal without incrementing either version. [Node's guarded processing](../../tsn-protocol/services/tsn-node/server.py) renews before verification and every 15 seconds through decision reporting, cancels verification/proving on renewal failure and stops renewal on completion or the 600-second processing deadline. Prover cancellation terminates its child process; the existing 300-second prover limit remains. Receiver decision failures now log only a bounded error code, not raw response data. Idle workers retain their event-driven sleep.

[Seven Node tests](../../tsn-protocol/services/tsn-node/tests/test_receiver_lease_renewal.py) cover repeated renewal, single reporting, lost/rotated/expired claims, unavailable renewal, verification rejection, processing timeout and bounded error logging. [The isolated Receiver test](../../tsn-protocol/services/tsn-receiver/tests/node-lease-renewal.test.mjs) advances its clock beyond the original deadline, verifies unchanged funding/payload/version and accepts an actual synthetic Ed25519 decision under the renewed claim. It also rejects unauthorized, malformed, expired, completed and reassigned claims. Receiver typechecking and all 15 tests passed; 19 additional Node authorization/attestation/precondition tests passed. No user keys, chain submissions or services were used by these tests.

To load the correction, stop Node in its existing terminal, reload Receiver with `npm run tsn:receiver:dev`, and restart Node with `npm run tsn:node:dev` after the old claim expires, at most 60 seconds after stopping its former worker. Startup wakes normal leasing, which reclaims an expired NODE_VERIFYING claim. A newly restarted worker that finds the old claim still active can drain and sleep until another wake; allow expiry before starting it. Use the snapshot/preflight retry utility only for its supported REJECTED states, rather than resetting active work. Live renewal, Cranker transport acceptance, settlement and owner recovery remain unverified.

### Later November 2 checkpoint: finalized credit with a failed service receipt

The supplied Node log showed successful authenticated lease renewals, a VERIFIED decision, authorization and Mother signing. Cranker leased the original settlement at version 27, built a 2,909-byte V1 transaction and reported FAILED version 28 after `WebSocket failed to connect`. The original reserve funding remains CONFIRMED version 5; it must not be deposited again.

Read-only finalized Devnet inspection found settlement signature `dojfmWVHfNA4AbwHpzQtFQGGUNxASw3rAdUKfhVYYCnfmoVwJDakVdpV7GJFxGu4aSaagXhBDHigcgwTs53gjgQ` at slot **517916537**, `err=null`. Its complete TSNP instruction bytes and following Memo exactly match the stored transition; both signatures verify. TCAP advanced from `14935d601de8d6fbd04b084de8f8510dd25b5ed1d80ab5382b8f908dc0734b3a` to `2d788e4b5d6527742d7910d402a6c17b3f0c3f1b02698441353cf8bdeff213ef`, sequence 1. The transaction used 760,436 compute units and paid 10,000 lamports. This establishes chain credit, distinct from Receiver's stale FAILED receipt and unverified XP owner recovery.

The authenticated [receipt-reconciliation handler](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/reconcile/route.ts) accepts `{id, expectedVersion, signature, execute}`. It independently reads finalized settlement/funding receipts, Mother authority and TCAP root through the configured gateway. It checks deterministic funding lineage, unchanged payload, successful V1 execution, both signatures, canonical accounts, the entire authorized instruction and exact Memo. A transaction then compares the original records again before setting only settlement CONFIRMED at the next version. Prior error/authorization commitment are archived in reconciliation history; funding, payload and earlier retry history are preserved. No Node wake, signing, requeue or chain submission occurs.

After reloading Receiver in its existing terminal with `npm run tsn:receiver:dev`, inspect this receipt from the workspace root:

```powershell
.\.venv\Scripts\python.exe scripts/reconcile-settlement-receipt.py --work-id settlement-9ca206a7be1e5fca870e6a32e5ef7e1d --expected-version 28 --signature dojfmWVHfNA4AbwHpzQtFQGGUNxASw3rAdUKfhVYYCnfmoVwJDakVdpV7GJFxGu4aSaagXhBDHigcgwTs53gjgQ
```

Add `--execute` to repair only the Receiver receipt after inspection. Version 28 is the observed failed record, not a permanent value. Restart Cranker in its existing terminal with `npm run tsn:cranker:start` to load HTTP confirmation for subsequent settlements. Do not use the snapshot retry utility or create a second deposit for this finalized credit.

Receiver typechecking and all 16 tests passed, including isolated receipt/lease tests covering authentication, malformed/stale requests, exact-byte/account/signature/root mismatches, preview without mutation, funding/history preservation, duplicate repair rejection and signed-attempt expiry. The offline transport test passed: V1 message bytes match the installed DBrix builder, identity precedes broadcast, send/confirmation interruptions retain identity, checkpoint failure prevents broadcast and oversized messages fail. Focused TypeScript checking included the transport, its test and Cranker caller. The receipt matcher and authenticated live endpoint preview also passed against this actual finalized transaction using read-only RPC; the [sanitized local evidence](../../protocol-test-runs/native-credit-receipt-20261102/evidence.json) retains the bounded observations. The new endpoint's live write, replacement sender's live confirmation and owner Memo recovery have not been executed by this investigation.

## 5. Retained Creditcoin settlement branch

When authorization kind is `TSN_CREDITCOIN_PAYOUT_AUTHORIZATION`, the daemon passes the supplied authorization and signature to `CreditcoinCranker.submit()`. The adapter validates payout fields/signature format, reads fresh route/liquidity evidence, compares authorized route, executor and token with the registry, checks available liquidity and expiry, and sends the EVM hub `executeSettlement()` call from its configured executor wallet.

The adapter waits for a receipt with `status=1` and requires a `SettlementMessagePublished` event. The daemon reports Receiver `CONFIRMED` with result stage `CREDITCOIN_SETTLEMENT_SUBMITTED`, transaction hash and Attestcoin message ID. Here CONFIRMED describes the successful **hub publication transaction**; destination payout needs its own receipt/state evidence. The current native Node authorization endpoint accepts hidden-head verification only and does not supply this branch's envelope, so its presence in the dispatcher does not establish a working service handoff.

No Creditcoin route, hub deployment, gas transaction or destination payout was verified for this map. Use the [adapter](../../tsn-protocol/services/tsn-crosschain/src/creditcoin-cranker.ts), [payout validator](../../tsn-protocol/services/tsn-crosschain/src/settlement.ts) and [existing route guide](../team/cross-chain/creditcoin-cranker-adapter.md) for that separate scope.

## Instructions outside this daemon's dispatch

Program upgrades, GPRU verifier initialization/IC writes/enable, TCAP root activation, TIP resolver tag 18 and expired-stage close tag 22, epoch treasury/AcceptedIntent/payout/refund/reimbursement, TCAP debit/exit and one-time migrations are not normal dispatch branches in this daemon. Exports and program entrypoints describe capabilities; enabled callers and execution evidence determine whether another tool can use them.

Use [operations](operations-and-verification.md), [verifier setup record](experiments/EXP-20261102-verifier-initialization.md), [program declarations](onchain-reference.md) and [distinct component families](components.md) for those boundaries. Setup transactions must retain their own authority and account evidence; they must not be counted as transactions from the successful TIN work item.

## Evidence to retain for another run

Keep work ID and payload intent ID separately, kind/state version, Node decision and commitment-check result, lease context, branch/packet sizes, public chain signatures, chain error/confirmation status, and the expected account/root/liability effects. For staging, retain every initializer/upload signature plus the distinct final signature. For Creditcoin, retain hub and destination evidence separately.

Do not copy private TINs, display names, seeds, encrypted envelopes, owner authorization signatures, service credentials, witnesses or raw stores into shared documentation. Public signatures and account references support inspection but still expose timing/account relationships. The [TIN completion guide](../protocol-flows/tin-creation/05-evidence.md) and [successful run](experiments/EXP-20261102-tin-staged-finalization.md) show the bounded evidence used here.

## Funded-note Memo validation correction, 2026-11-05

Read-only Receiver inspection found funding `def3ee3a-b8f0-4ff1-89eb-03d0bdd7290b` CONFIRMED at version 5 and its linked settlement `settlement-69f6df71a5e93936ae0ba0f2a451b30c` REJECTED at version 3 without execution state. Node rejected the thirteen-input proof because `validate_transaction_record_v1` still required twelve inputs. The corrected Memo guard matches the current program/prover ABI; the authenticated recovery endpoint and inspection utility admit only that exact stored prior error after repair, preserving the original funding and requiring fresh proof/verification. Historical receipt decoding remains distinct. The [operator checkpoint](../references/TSN-OPERATOR-GUIDE-20261105.md#settlement-memo-validation-correction) records tests and the prepared recovery command. No recovery, reload or new deposit was performed by this correction.

## Expired Cranker confirmation report, 2026-11-05

The operator submitted funded-note credit `settlement-69f6df71a5e93936ae0ba0f2a451b30c` as a 3,044-byte V1 transaction. Independent read-only reconciliation verified signature `2U9KCqFjxvVuRbW8UZVAQ5ecWHT5cAQdz4ZStc5hcLKbRZ5cW1uzwkqhiQHCRV82XzGfnmp5tghPXk7pFq5TWT8V` finalized at slot **518977204**, matching both signatures, the exact thirteen-input instruction/Memo, fourteen canonical TSNP accounts, original funding and TCAP root sequence **5**. This verifies one reference credit; owner Memo recovery and deployed-byte equality require separate evidence.

The Cranker lease expired at 15:03:53.607Z; its confirmation report started at 15:03:53.887Z. Authorization/co-signing consumed the lease before receipt reporting, and the old daemon then attempted a misleading FAILED report. Receiver retained FAILED/version 9 and its durable signed checkpoint. The corrected authenticated late-confirmation path requires the reporting payer and exact expired lease generation, verifies the finalized receipt, and updates only status/history. Bounded retries of the identical confirmation report cover temporary finality/RPC/transport failures; mismatches remain errors. Cranker retains a pending confirmed signature rather than reporting transaction failure. The [full diagnosis, tests and receipt-only command](../references/TSN-OPERATOR-GUIDE-20261105.md#expired-cranker-confirmation-report) record the remaining operator action. No receipt repair or service reload was performed by this source fix.
