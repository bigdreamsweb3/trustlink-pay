# TSN operator guide and blockhash correction record

**Status: CURRENT bounded source/review record, 2026-11-05.** This checkpoint accompanies [Build and operate your own TSN](../RUN-YOUR-OWN-TSN.md) and the [required agent maintenance rule](../../.agents/tsn-operator-guide-policy.md). It does not certify a clean-machine installation, new independent network, production ceremony or complete owner-workflow recovery. One finalized reference funded-note credit is recorded below with its separate receipt-repair obligation.

## Source reconciliation

Reviewed root instructions, `.agents` terminology/change policy/index, documentation maintenance, Laboratory architecture/credit ABI, package scripts, deployment/setup helpers, TIP initializer/route append, Mother CLI inputs, TCAP initialization/asset registration, circuit setup/export, Node native library/prover/witness requirements, Receiver storage/lease contract, Cranker admission/funding submission and SDK/application integration. Existing README lifecycle diagrams retain their actors/accounting gates and now identify the post-amount-approval blockhash refresh.

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

## TCAP credit account decoding correction, 2026-11-15

The retained original TCAP artifact at `tsn-protocol/programs/tcap-protocol/target/deploy/tcap.so` has SHA-256 `ae578f2b04dd7f80eac99969c9c778cfbf4980e075160420644f0885b35f6c8c`. Its generated `CreditGpruMemoV2::try_accounts` uses a direct stack displacement of 4,392 bytes and a derived address displacement of 4,192, both beyond SBF's 4,096-byte frame. The synthetic [compiled-program regression](../../scripts/tests/test_tcap_credit_sbf.py) reproduces a stack access violation without Receiver data, private notes, keys, real proof material, network access or transaction signing.

Heap-backed config, shared root, asset and reserve accounts reduce the corrected validator's deepest direct displacement to 3,496 bytes and derived address displacement to 3,352. Handler and dispatch remain within 4,096 bytes. The isolated artifact at `protocol-test-runs/tcap-credit-stack-20261115/deploy/tcap.so` has SHA-256 `2c0aae8f332c084f737ef52ceea26686d37e061ab36729a96eea65dfbf2ce557`. Its offline locked `cargo build-sbf` completed with 21 existing Anchor/unused warnings and no stack-offset warning. The original deployment artifact/keypairs were not replaced. Local `evidence.json`, build log and before/after test logs remain in that ignored test directory; they are development evidence rather than required runtime configuration.

From the root in PowerShell, run the corrected compiled-program fixture with:

```powershell
.\.venv\Scripts\python.exe scripts/tests/test_tcap_credit_sbf.py protocol-test-runs/tcap-credit-stack-20261115/deploy/tcap.so
```

Four test methods cover 13 synthetic cases. Direct TCAP calls with current/retained full-width funding roots reach a deliberate authorization-commitment mismatch (`6008`) for both absent and existing epochs. Synthetic TSNP calls with a matching Mother account and authorization digest through the existing binary reach TCAP and reject at the deliberately expired slot (`6012`), after funding and authorization binding checks. Zero, unrecorded, noncanonical and malformed-history contexts still reject with `6023`. Independent review repeated the original nine direct cases against both artifacts and verified disassembly; the root run passed all 13 final cases. TSNP's offline locked isolated SBF build against the boxed TCAP dependency also completed successfully, with four existing warnings. It is byte-identical to the original TSNP artifact (SHA-256 `1e8d4d2ffafb1b5a36c173664928bdad509dc86fce6bd42796ea83ca0ab6243b`), so this fix requires only the corrected TCAP deployment. These tests establish account/argument decoding, CPI serialization and funding guards, not real Groth16 proof acceptance, a confirmed private credit or owner recovery.

Other offline commands passed: `npm --prefix tsn-protocol/services/tsn-receiver test` (typecheck and 46 tests); `node --test tsn-protocol/sdks/tsn-sdk/tests/funding-note.test.mjs tsn-protocol/sdks/tsn-sdk/tests/signed-funding-deposit.test.mjs` (11 tests); and, from the Cranker service directory, `node --import tsx --test tests/funding-root.test.ts tests/settlement-transport.test.ts` (7 tests). From the Node service directory, the root virtual environment imported `server` before discovering `test_funding_note.py`, `test_global_funding_credit.py` and `test_hidden_head_transport.py`, passing 27 tests under the existing native-library settings. These are focused checks; the previously recorded unrelated full-suite failures were not reclassified.

The existing Receiver lock retry needs no further code edit: its isolated tests verify up to eight exclusive-open attempts for `EPERM`/`EACCES`, totaling 1,120 ms scheduled delay, without access-error lock deletion. Persistent errors still fail. This scoped check does not establish general crash-safe locking or change the adapter's separate existing age-based stale-lock handling.

The [internal guide](../RUN-YOUR-OWN-TSN.md#12-diagnose-failures-without-repeating-uncertain-payments), [credit ABI](../laboratory/credit-abi.md) and public TCAP capability boundary were synchronized. Root/protocol README diagrams, SDK exports, TSNP serialization and GPRU proof requirements were reviewed; their data flow and ABI need no change for heap storage. No new agent rule or public installation page is needed. Interface discovery regenerated 16 Node routes, 15 schemas, 26 Receiver handlers and the current Rust declarations. Documentation inventory covered 276 pages; all 36 explicit claim selectors passed; local links/navigation reported zero issues; MDX compilation passed 102 pages and Mermaid parsing passed 38 diagrams with zero failures. Scoped whitespace checks passed. These checks do not verify visual rendering or live execution. The current failed holder remains a separate signed attempt; the read-only resolver could not connect to the local Receiver, and no recovery/deployment/service/signing/Git mutation was performed. Verify the corrected deployment before inspecting and explicitly resolving that attempt, then independently verify fresh private credit and owner recovery.

## TCAP deployment DNS checkpoint, 2026-11-15

The operator's later build completed with the existing 21 warnings and produced the 1,617,120-byte standard TCAP artifact. Its SHA-256 matches the isolated tested correction (`2c0aae8f332c084f737ef52ceea26686d37e061ab36729a96eea65dfbf2ce557`); all four SBF test methods/13 cases passed again against that standard artifact. The reported wrapper failure occurred in its pre-upload ProgramData inspection because WSL could not resolve the configured Helius hostname. Source places buffer preparation, capacity extension and upload after that inspection. This log does not establish a deployed upgrade.

Subsequent read-only WSL checks resolved both provider hostnames and successfully queried public Devnet. TCAP remained at deployment slot 521823595, with ProgramData capacity 1,636,352 bytes and authority `78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX`. Capacity exceeds the checked artifact size. The wrapper's cluster-first resolution explains why setting `ANCHOR_PROVIDER_URL` alone cannot replace its configured Helius URL; no deployment helper or RPC configuration was changed.

From the repository root in the operator's WSL prompt, this direct CLI command selects public Devnet for the existing artifact and preserves the checked capacity. The wallet must remain the matching existing upgrade authority; do not substitute a new keypair.

```bash
cd tsn-protocol/programs/tcap-protocol
solana program deploy target/deploy/tcap.so \
  --program-id target/deploy/tcap-keypair.json \
  --keypair "$HOME/.config/solana/id.json" \
  --upgrade-authority "$HOME/.config/solana/id.json" \
  --url https://api.devnet.solana.com \
  --use-rpc --commitment confirmed --max-sign-attempts 20 \
  --max-len 1636352
```

`solana program deploy --help` confirmed these options on the current WSL CLI. The assistant did not execute deployment, create a buffer, sign, control services or mutate Receiver work. After the operator runs it, inspect the program and compare deployed bytes before failed-attempt recovery or claiming private credit success. RPC/DNS reachability is time-sensitive; these successful reads do not guarantee a later upload.

## Deployment wrapper RPC recovery correction, 2026-11-15

The operator explicitly requested a repair to `npm run tcap:program:deploy:devnet` after the DNS checkpoint above. The earlier failure happened after a successful build but before buffer preparation or upload; the later direct CLI upload showed expired-blockhash retries, and its final outcome remains unverified. These observations do not establish a compiler failure or a completed upgrade.

The [deployment wrapper](../../scripts/devnet-program-deploy.mjs) now retries read-only genesis/capacity/post-deploy inspection for concrete DNS, connection, timeout, HTTP 429 and server failures. Its default is three attempts with two- and four-second waits and a thirty-second timeout per command; `TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS` accepts 1–5. Configured `Anchor.toml` cluster priority is preserved, with a new deliberate `TRUSTLINK_DEPLOY_RPC_URL` override above it. A repeatedly unavailable endpoint permits a backup selected by `TRUSTLINK_DEPLOY_RPC_FALLBACK_URL`, defaulting to public Devnet; `none` disables the backup. Each candidate must return Devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before complete capacity inspection and any buffer/transaction operation. Authentication, certificate, wrong-genesis, malformed capacity and other program/account errors stop without fallback. A genuine missing program permits an initial deployment after cluster and keypair identity checks.

The selected endpoint drives capacity, any required extension, upload and post-deploy inspection together. Transport recovery retains the same endpoint and buffer signer. Existing npm aliases still select TCAP/GPRU RPC-first and TSNP/all QUIC-first with one recovery round; direct wrapper invocation accepts explicit transport and 1–5 rounds, defaulting to RPC-first/three. A returned-success upload followed by failed or malformed inspection reports incomplete verification and retains the auto signer. Exhausted uploads no longer claim the existing program was untouched; reconcile chain state before resuming. Program IDs, program/authority keys, saved RPC configuration, capacity headroom and participating protocol/service contracts were preserved. Windows arguments containing drive paths now map to WSL paths, and command/captured-read diagnostics redact provider user information, path tokens and query values without retaining raw spawn arguments.

From the repository root in PowerShell, the offline verification command is:

```powershell
node --test scripts/tests/devnet-program-deploy.test.mjs scripts/tests/tip-program-deploy.test.mjs
```

All 43 tests passed: 38 new wrapper regressions and five existing TIP regressions. The wrapper tests intercept every child command and reject network access, using synthetic temporary files rather than checkout wallets, artifacts or configuration. They cover same-provider retries, configured/dedicated RPC selection, verified fallback, initial deployment, capacity extension, same-buffer transport recovery, incomplete post-deploy verification, permanent numeric account/TLS errors, strict retry settings, credential redaction and Windows/WSL quoting. `node --check` and scoped tracked whitespace checks passed. Independent review verified the CLI's `genesis-hash --url` option and tested eleven isolated availability-classifier cases. These checks do not exercise real RPC upload throughput, blockhash expiry on chain, clean-machine installation or deployed-byte agreement.

The same wrapper suite ran in the operator's WSL environment, passing 37 tests with the Windows-only forwarding case skipped. That case passed in the Windows run. Both runs used intercepted CLI calls; neither tested a real deployment.

The [operator guide](../RUN-YOUR-OWN-TSN.md) and [build/deploy guide](../DEVNET-BUILD-DEPLOY.md) now state exact precedence and recovery settings. Both documentation trees and root/protocol README command/diagram references were inspected; no public API, SDK export, account layout or actor-flow change requires updates there, and the internal self-hosting guide remains unpublished. No agent-rule change is required because the existing operator-guide policy covers this method. The assistant performed no deployment, signing, service operation, Receiver recovery, commit or push.

Documentation inventory covers 276 pages and the claim register validates all 36 explicit selectors. Local link/navigation checks found zero issues; syntax validation compiled 102 MDX pages and parsed 38 Mermaid diagrams without failures. Script/test syntax, scoped tracked whitespace and new-test trailing-whitespace checks passed. These checks do not verify remote links, visual rendering or the operator's ongoing direct upload.

## Corrected TCAP deployment verified, 2026-11-15

The operator subsequently completed `npm run tcap:program:deploy:devnet` through the configured Helius endpoint on the first RPC upload attempt. The supplied log reports ProgramData capacity 1,636,352 bytes, no extension, successful post-deploy inspection at deployment slot 522558160, the unchanged program/authority and cleanup of the temporary buffer signer. This completed wrapper run supersedes its earlier pre-upload DNS failure; the outcome of the separate direct CLI attempt is not needed to establish the current binary.

Independent read-only JSON-RPC verification checked Devnet genesis and fetched program plus ProgramData together at finalized context slot 522559996. TCAP `tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF` remains executable under the upgradeable BPF loader and binds ProgramData `GMZKt38kw1TcnqGJiefGjmGx1FVxwYEULSHosnB5nj1M`. Its decoded deployment slot is 522558160 and authority is `78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX`. All 1,617,120 artifact bytes exactly match the corrected, previously tested TCAP artifact, SHA-256 `2c0aae8f332c084f737ef52ceea26686d37e061ab36729a96eea65dfbf2ce557`; the remaining 19,232 capacity bytes are zero. The allowlisted local result is retained in `protocol-test-runs/tcap-credit-stack-20261115/deployment-verification-522558160.json`. The assistant performed reads only and did not deploy or sign.

Local Receiver inspection still found `settlement-62e424aa6ebf25982c65e9b498507223` FAILED/version 262 with its saved signature and no nonexecution resolution. Its original funding remains CONFIRMED/version 5. The newer funded settlement `settlement-55d4dc891486b2e12c1f2a34d6412262` remains RECEIVED/version 1, with its own funding CONFIRMED/version 5. The existing read-only resolver preview could not reach `http://127.0.0.1:8010` (`ConnectError`), so current nonexecution evidence and lock release remain unverified. Deployment does not release that signed-attempt lock or repeat either deposit.

With the Receiver that owns this local store running, inspect the failed holder from the repository root in Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe scripts/resolve-failed-settlement.py `
  --receiver-url http://127.0.0.1:8010 `
  --work-id settlement-62e424aa6ebf25982c65e9b498507223 `
  --expected-version 262 `
  --signature 5uiPZpHRaoxJfxnsnvjs3UCGGQMeWFx1zK8iyVBwxaHhigQKf1XHS1LeB3s8jRmKpN2DeRqVgudKVHjzbYNh19C6
```

Version 262 is the inspected local observation; a changed version requires fresh inspection. No `--execute` was used. Only a successful preview establishes eligibility for the separate user-controlled execution that records nonexecution and wakes eligible dependent work. Fresh private credit, complete epoch accounting and owner recovery remain separate checks. The internal guide/status and public TCAP capability boundary distinguish this verified deployment from those unperformed outcomes.

## External-route source retirement, November 22, 2026

The internal operator guide now records the disabled external admission boundary, removed hub/proof/payout/deployment helpers and removed nonexistent root integration-test alias. Native Solana operating contracts remain unchanged. SDK and retained EVM TypeScript builds, forced Cranker TypeScript compilation and local route/retry checks passed. The process-only regular-file stdin Node harness completed 169 checks with 165 passing, four existing matching-artifact skips, zero failures/errors and unchanged source inputs. The ordinary Windows pipe run's repeated serializer timeout remains a separate harness limitation. See the [bounded November 22 maintenance record](TSN-POSITIONING-20261122.md) for complete scope; no service, chain or Git write was performed.

The complete existing SDK test command `node --test tests/*.test.mjs` ran 113 tests, with 108 passing and five failing native TIN envelope/route/staging fixtures. Targeted reruns reproduce all five: the pre-issuance marker accesses an absent field, wrong-wallet recovery expects a different error, the route fixture fails current binding validation, and the stage serializer/creation builder lack current versioned commitments. Those native source and test files have no task diff; they were not altered to conceal this result. Browser SDK bundling and all five retained Solidity research sources compile, with no live service or deployment implication.
