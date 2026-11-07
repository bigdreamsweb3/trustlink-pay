# TSN operator guide and blockhash correction record

**Status: CURRENT bounded source/review record, 2026-11-05.** This checkpoint accompanies [Build and operate your own TSN](../RUN-YOUR-OWN-TSN.md) and the [required agent maintenance rule](../../.codex/tsn-operator-guide-policy.md). It does not certify a clean-machine installation, new independent network, production ceremony or complete owner-workflow recovery. One finalized reference funded-note credit is recorded below with its separate receipt-repair obligation.

## Source reconciliation

Reviewed root instructions, `.codex` terminology/change policy/index, documentation maintenance, Laboratory architecture/credit ABI, package scripts, deployment/setup helpers, TIP initializer/route append, Mother CLI inputs, TCAP initialization/asset registration, circuit setup/export, Node native library/prover/witness requirements, Receiver storage/lease contract, Cranker admission/funding submission and SDK/application integration. Existing README lifecycle diagrams retain their actors/accounting gates and now identify the post-amount-approval blockhash refresh.

The guide explicitly distinguishes fixed reference IDs from the source changes needed for a separate deployment. It records actual environment precedence, Windows DLL versus SBF/Linux builds, one-time funding root/V2 verifier enrollment, persistent artifact pins, canonical empty-state snapshot bootstrap and established-state recovery constraints. It links existing canonical records instead of creating a second ABI/proof specification.

## Supplied failures and inspected timing

Receiver funding work `e4e67e52-293a-4e3a-ae0e-31ebf0ba2592`, `57efffbd-5ae8-4a96-bade-722e8e973f5d` and `fb78c7a4-284d-4505-8b82-044faabeda92` was REJECTED during Node simulation. Ingress-to-decision intervals were approximately 15.7, 9.4 and 13.5 seconds. The rejection claimed no configured RPC recognized the signed deposit blockhash.

Funding `ae009498-4be6-461f-a126-81c29b0bf9be` reached VERIFIED and then FAILED at Cranker submission with `Blockhash not found`; its inspected record contained no result signature. The linked settlement's RECEIVED state does not establish execution. No failed record or private envelope was changed by this task.

The records lack the issuing bank, block height and wallet-approval timing needed to prove expiry versus bank lag for each historical attempt. A current public Devnet read returned its expected genesis and a fresh confirmed hash; `isBlockhashValid` returned true on that endpoint. The local gateway was unreachable from the diagnostic session. Current endpoint observations cannot reconstruct historical provider behavior.

## Corrected implementation

- XP obtains a fresh Node blockhash after canonical amount approval and immediately before transaction signing. Refresh requires the existing authenticated, unexpired prepared credit and does not extend its approval window.
- Gateway retries `simulateTransaction` bank rejection and `sendTransaction` preflight `BlockhashNotFound` across its ranked providers using the identical request. A program error remains a program error. It reports explicit hash invalidity only when every attempted provider answered; a transport failure leaves validity unknown.
- Node treats mixed blockhash rejection/transport or malformed responses as HTTP 503, rather than claiming every endpoint rejected the hash. It validates simulation result shape before accepting it.
- Node retries HTTP 5xx/transport unavailability while the current lease is renewed, inside the existing 600-second processing window. Validation/signature/program failures remain terminal. Lost leases/timeouts cancel work without a stale decision. Persistent failure still needs lease recovery and another authenticated wake/startup drain; no automatic success or refund is implied.

The fixes change client preparation and off-chain RPC handling. They do not change the program ABI, keys, configured program IDs or deployment helpers. Expired owner-signed bytes still require a new wallet signature after original-attempt reconciliation.

## Verification and remaining work

Focused offline regression commands:

```powershell
node --test scripts/tests/rpc-blockhash-failover.test.mjs scripts/tests/tin-xp-credit-preparation.test.mjs
Push-Location tsn-protocol/services/tsn-node
..\..\..\.venv\Scripts\python.exe -m unittest discover -s tests -p test_deposit_rpc.py
..\..\..\.venv\Scripts\python.exe -m unittest discover -s tests -p test_receiver_lease_renewal.py
Pop-Location
```

The first run passed 11 JavaScript tests, four deposit RPC tests and eight lease tests. Coverage includes unchanged request/wire handling, lagging and unavailable banks, terminal program rejection, wallet approval ordering, session expiry, note/account/amount binding, lease renewal/cancellation and temporary-failure recovery. Later source/result-shape and documentation validation results are recorded in the completion addition below.

No services were started/stopped, no transactions signed/submitted, no programs deployed and no Git commit/push performed. Existing program/activation/artifact setup supplied by the operator remains separate prior evidence. Operator reload and a fresh wallet-authorized credit are required to verify this correction live. Inspect funding signature/finality before repeating uncertain work; recover an already confirmed deposit through its linked settlement.

## Settlement Memo validation correction

The supplied November 5 log rejected `settlement-69f6df71a5e93936ae0ba0f2a451b30c` with `GPRU transaction record is missing its twelve public hidden-head inputs`. Read-only local Receiver inspection found its original funding `def3ee3a-b8f0-4ff1-89eb-03d0bdd7290b` CONFIRMED at version 5, with signature `24Qibbt6MSy9WPp6JTrMAzD3NHDRow8gcZXppbxoVmKMK8Mo7ru49PjA2VPxruXbBJfrSmjopnTp6Vg6atLzUiL7`. Settlement was REJECTED at version 3 with no Node/Cranker lease, authorization or execution result. Its restricted funding envelope remained present. This is stored coordination evidence; the deposit receipt was not independently reread on chain during this correction.

The exact error came from `validate_transaction_record_v1` in Node, called by full credit-digest validation after proof construction. Its length guard still required twelve inputs while Node proving, SDK serialization, Cranker and TSNP/TCAP/GPRU require thirteen with funding root last. The guard now requires exactly thirteen. Historical SDK receipt decoding remains unchanged. Full digest regressions pass for the current encrypted Memo and reject obsolete/extra counts, changed Memo field and funding-root substitution.

Receiver and the operator utility now allow recovery for this exact prior rejection, without a broad proof-error retry. Authentication, expected version, confirmed funding, immutable lineage and absence of execution state still gate requeue. Funding, original payload and rejection history remain intact; a new Node lease must verify/prove again. The utility also now matches Receiver support for an exact funded-root-change rejection.

After loading corrected Node and Receiver in the existing PowerShell service terminals, the operator can inspect the observed request from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/retry-settlement-snapshot.py `
  --work-id settlement-69f6df71a5e93936ae0ba0f2a451b30c --expected-version 3
```

The command is read-only. Version 3 is the inspected observation; use a newly observed version if the record changes. Add `--execute` only to requeue this eligible settlement after repair. It wakes Node and can lead to Cranker submission; it does not submit another deposit. No service reload, record mutation, recovery execution, signing or deployment was performed here.

## Completion verification

The final full Node suite ran 104 tests: 100 passed, two failed and two skipped. The failures remain the previously observed System Program base58 encoding test (`test_system_program_round_trip`, which returns 33 leading ones) and the TIP synchronization fixture lacking a funding-root `getAccountInfo` mock (`test_node_settlement_synchronizes_before_proving_and_blocks_on_missing_history`). Neither path was changed by this Memo correction. The full suite is not green.

Focused settlement validation/transport ran 12 tests successfully; the isolated authenticated Receiver recovery integration passed; four offline operator utility tests passed. These verify framing/digest and guarded recovery with mocks/fixtures, not an accepted Groth16 proof or live funded-note settlement. Final documentation and blockhash regression results follow below.

Final XP/gateway regressions passed 12/12 and Receiver `npm run typecheck` passed. The earlier four deposit-RPC and eight lease-renewal tests also pass in the full Node run above. The operator utility successfully inspected this live Receiver request without `--execute`, returning settlement REJECTED/version 3 and funding CONFIRMED/version 5; it made no requeue request. No funded-note settlement was submitted or finalized by this work.

Documentation inventory covers 274 pages, the claim register validated all 31 explicit evidence selectors, local link/navigation checks reported zero issues, and syntax validation compiled 103 MDX pages and parsed 39 Mermaid diagrams with zero failures. Scoped tracked whitespace and new-file trailing-whitespace checks passed. These checks do not verify visual rendering, clean-machine setup, deployed byte equality, independent-network automation or a live funded-note payment. Both documentation trees and affected service READMEs were updated; existing README actor/program diagrams need no Memo-validation change because execution ownership and account order are unchanged. The HTTP retry request shape and SDK exports are unchanged, so no interface/signature catalog regeneration was needed for this correction.

## Expired Cranker confirmation report

### Observed execution and lease timing

Read-only receipt reconciliation verified the operator's settlement `settlement-69f6df71a5e93936ae0ba0f2a451b30c`, signature `2U9KCqFjxvVuRbW8UZVAQ5ecWHT5cAQdz4ZStc5hcLKbRZ5cW1uzwkqhiQHCRV82XzGfnmp5tghPXk7pFq5TWT8V`, finalized at slot **518977204**, advancing TCAP sequence to **5**. Its 3,044-byte V1 wire matched both signatures, the exact authorized thirteen-input instruction and Memo, fourteen canonical TSNP accounts, confirmed original funding and resulting shared root. The original funding remains CONFIRMED/version 5 with signature `24Qibbt6MSy9WPp6JTrMAzD3NHDRow8gcZXppbxoVmKMK8Mo7ru49PjA2VPxruXbBJfrSmjopnTp6Vg6atLzUiL7`. This verifies one reference credit; it does not verify owner Memo/history recovery, deployed-byte equality, independent-network replay or general unlinkability.

Receiver's Cranker lease expired at **15:03:53.607Z**, while the confirmation report began at **15:03:53.887Z**, 280 milliseconds later. Node authorization and Mother co-signing consumed most of the original 60-second lease. The old daemon treated the rejected CONFIRMED report as a processing failure and attempted FAILED with the same signature. Receiver subsequently retained FAILED/version **9**, its original authorization and durable signed checkpoint. This coordination state did not undo finalized execution.

The earlier `CRANKER_RPC_UNAVAILABLE` Mother-DNA challenge failure is separate RPC availability trouble. Receiver retries configured RPC reads, and Cranker continues polling after challenge failures; the historical provider-side cause remains unknown. Lease expiry in this settlement is established by the stored timestamps.

### Corrected report contract

The existing authenticated Cranker CONFIRMED PATCH now handles lease/version conflicts through finalized receipt reconciliation. It requires the durable signed attempt, original reporting payer, exact expired authorization/lease generation and expected leased version or immediately reclaimed FAILED version. Both signatures, wire hash/size/blockhash, canonical accounts, exact instruction/Memo, confirmed funding and resulting TCAP root must match. During RPC reads, ordinary expiry reclamation may change only coordination fields; immutable context is compared again inside the storage transaction before mutation. Changed authorization, payer, checkpoint, version or receipt is rejected. Signing authority is not extended.

Cranker retries temporary receipt/finality/RPC or report transport failures with the identical confirmation body up to six times. Each attempt has a 25-second deadline covering authentication, report requests and body reads; retries wait five seconds. Authorization and receipt mismatches are not retried. Remaining failure preserves the confirmed signature as a pending receipt instead of submitting a misleading FAILED report. A lost accepted response can replay the same terminal report under Receiver's existing signature idempotency contract. This path never rebuilds or broadcasts a transaction.

### Verification and operator recovery

Receiver `npm test` passed typechecking and all **17** tests. Its signed synthetic receipt integration covers expired/reclaimed leases, concurrent reclamation, payer/wire/signature/version/authorization mismatch, unavailable finality, immutable context and idempotent reports. Cranker `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json` passed, and `node --import tsx --test tests/confirmed-report.test.ts` passed **7** tests for finality delay, a lost accepted response, deadlines, bounded availability failure, mismatched authorization/receipts and the pending-confirmation branch. These are offline contracts, separate from the live read-only finalized receipt observation. The prior full Node suite's two unrelated failures remain recorded above.

Reload Receiver and Cranker in the existing PowerShell service terminals to load future reporting fixes. For the existing FAILED record, run this from the repository root to verify the finalized receipt without changing status:

```powershell
.\.venv\Scripts\python.exe scripts/reconcile-settlement-receipt.py `
  --work-id settlement-69f6df71a5e93936ae0ba0f2a451b30c `
  --expected-version 9 `
  --signature 2U9KCqFjxvVuRbW8UZVAQ5ecWHT5cAQdz4ZStc5hcLKbRZ5cW1uzwkqhiQHCRV82XzGfnmp5tghPXk7pFq5TWT8V
```

The preview succeeded against the live Receiver and verified finalized slot 518977204/sequence 5. Version 9 is the observed record version; use a newly inspected version if it changes. Add `--execute` only to repair Receiver's receipt status at the next version. This authenticated operation verifies the same receipt, clears completed leases/authorization and retains history; it does not wake Node, repeat funding/settlement, submit transactions or refund funds. No receipt mutation, service reload, signing, submission, deployment or Git commit/push was performed by this fix.

### Documentation completion for the late report correction

Interface discovery regenerated **16** Node routes, **15** schemas and **23** Receiver handlers; the Rust declaration inventory was unchanged in scope. Documentation inventory covered **274** pages, all **33** explicit claim selectors passed, local link/navigation checks found **zero** issues, and MDX/Mermaid validation compiled **103** pages and parsed **39** diagrams with **zero** failures. Tracked scoped whitespace and trailing-whitespace inspection of **23** affected source/document files passed. Parsing does not establish visual rendering or future live reporting after service reload.

Implementation changes are in Receiver `lib/settlement-reconciliation.ts`, Cranker work PATCH and its reconciliation/retry tests, plus Cranker `src/receiver/confirmed-report.ts`, daemon reporting and the seven report tests. Internal updates cover `RUN-YOUR-OWN-TSN.md`, `DOCUMENTATION_STATUS.md`, Laboratory architecture/credit ABI/transaction/reconciliation records, the funded-note experiment's appended checkpoint and this operator record. Public updates cover the operator entry, Receiver/Cranker guides, service API and hidden-head guide; both affected service READMEs were synchronized. Generated HTTP/interface, page/claim and syntax/link reports were refreshed. Existing root/protocol README actor/program diagrams were reviewed: receipt reconciliation changes coordination after execution, while their funding/authorization/CPI/owner-recovery sequence remains applicable. No SDK export or program ABI change was introduced by this correction.
