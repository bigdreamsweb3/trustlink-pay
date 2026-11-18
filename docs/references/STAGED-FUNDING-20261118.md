# Intent-first funding implementation and verification

**Status: CURRENT source contract and scoped offline verification, November 18, 2026.** This record covers the message-first wallet-to-TIN funding change across SDK/XP, Receiver, Node and Cranker. Loaded-service behavior, live latency, chain acceptance and owner payment recovery remain unverified. Historical failed attempts remain preserved; these checks establish neither their precise rejection cause nor nonexecution.

## Implemented contract

The wallet first signs the canonical payment message. Message-only `/intents` stores encrypted authorization and private note as `AUTHORIZED_FUNDING` in `AUTHORIZATION`. Node validates the authorization, recipient, governed asset/deposit accounts and advisory owner token balance, then signs `FUNDING_READY` with no execution projection. A balance observation reserves no funds and does not guarantee the later transfer.

SDK/XP shows progress and offers an explicit **Approve funding** action after current readiness. Its fenced expiry timer updates idle controls, and cancellation is serialized against wallet approval with the original session checked before applying a response. Owner-authenticated `POST /network/funding/readiness` returns the original work ID, version, authorization commitment, expiry, amount and ten deposit-account strings. On approval, the application obtains a fresh blockhash/context and wallet signature. `POST /network/funding/complete` binds those exact bytes/context to that same work and expected readiness fence. Receiver atomically freezes completed funding, retains original authorization/readiness lineage and creates its deterministic linked settlement. Identical completion retries reuse the same wire/work; changed bytes and stale fences fail.

Final Node verification checks preserved readiness evidence/signature, original approval expiry, exact deposit and confirmed minimum-slot simulation. It reuses initial authorization and does not consume its nonce twice. Only final `VERIFIED` admits Cranker. Each funding endpoint requires twenty remaining blocks, and fallback submits identical owner-signed bytes. A failure report retains candidate signature and sanitized context/height/attempt phase. Candidate signatures, request invocation and successful status reports do not establish chain acceptance. Confirmed funding separately gates linked settlement; private credit and aggregate epoch accounting remain independent transactions.

Source anchors are [SDK funding helpers](../../tsn-protocol/sdks/tsn-sdk/src/funding-authorization.ts), [XP controls](../../protocol-tests/ui/public/tsn-dapp.js), [Node staged verification](../../tsn-protocol/services/tsn-node/verification/work/README.md), [Receiver contracts](../../tsn-protocol/services/tsn-receiver/lib/contracts/README.md) and [Cranker funding submission](../../tsn-protocol/services/tsn-cranker-op-daemon/src/dbrix/owner-signed-funding.ts). The [architecture map](../laboratory/architecture-map.md), [public lifecycle](../../tsn-protocol/tsn-docs/developers/payment-intent-lifecycle.mdx) and [typed credit example](../../tsn-protocol/tsn-docs/sdk/examples/credit-deposit.ts) describe the same actor sequence. Funding helpers are exported from `@trustlink/tsn-sdk`; no new package subpath is added.

## Verification evidence

- Node's final `testing.run_suite` diagnostic invocation passed 152 of 156 checks, with four existing opt-in circuit/proof skips, zero failures/errors, unchanged source and 25.79 seconds elapsed. `%TEMP%\tsn-staged-funding-node-diagnostic-20261118\suite-summary.json` retains results. Its [verification record](../../tsn-protocol/services/tsn-node/docs/verification.md) lists new cases, native-library setup and limits.
- Receiver staged checks passed 11/11; typecheck passed. Its broad aggregate remains partial at 83/86, with two failures and one timeout. A later serialized current-source follow-up passed all five selected HTTP/storage/readiness cases, including the three affected aggregate cases, in 89.955 seconds. `%TEMP%\receiver-staged-serial-20261118-43ddcd41-f801-4832-9ccf-9edd8b199091.log` and the [Receiver record](../../tsn-protocol/services/tsn-receiver/docs/verification.md) retain scope. This is not a clean full-aggregate claim.
- Cranker passed 17 scoped checks and source-targeted non-emitting TypeScript compilation. Tests cover deadline margins, malformed heights, exact-wire fallback and ambiguous submission evidence; see its [implementation record](../../tsn-protocol/services/tsn-cranker-op-daemon/README.md).
- SDK passed 21 focused checks, its TypeScript build and browser bundle build. The full suite passed 108/113, retaining five previously established TIN master-seed/route/serializer/creation failures. These failures remain unresolved and separate from staged funding. [SDK verification](../../tsn-protocol/sdks/tsn-sdk/README.md) records the package scope.
- Final XP verification passed 26/26 with `node --test scripts/tests/tin-xp-credit-preparation.test.mjs`; `%TEMP%\trustlink-xp-cancellation-20261118.log` retains output. Cases cover message-only ingress, readiness gating/expiry, wallet changes, cancellation/approval serialization, stale responses, exact signed retries and successful unlock. Source/test syntax and scoped CRLF-aware whitespace checks passed. The final client controls are served directly as `tsn-dapp.js`; they changed no SDK/browser bundle input and required no repeat SDK build.
- `node docs/references/tooling/verify-sdk-examples.mjs` passed five typed examples and thirteen offline scenarios with synthetic wallet approvals. No example signed or submitted a live transaction.

Node's refreshed AST/import audit covers 933 Python files/655 functions, including 579 production files/400 functions, with no integrity findings and unchanged production/test sources. It preserves 147 original contracts, 231 original test mappings and original test hashes, while recording nineteen later functions separately. Receiver's refreshed audit covers 756 files/618 functions, including 399 production files/285 functions, with zero multiple-function, syntax, authored-import or forbidden-pattern findings. Inventories describe source ownership rather than measured execution or branch coverage.

## Documentation validation

Source-derived SDK regeneration records 58 modules, 400 exports and 285 public members. HTTP-only generation records eighteen Node operations/seventeen paths/23 schemas and 36 Receiver handlers/21 paths, including inherited request models and MCES handler bindings; it leaves the separate on-chain catalog unchanged. Active starter, lifecycle, funding/operator pages and both README diagrams now place transaction approval after readiness. The private operator guide remains internal, and protocol links to parent-repository files use canonical GitHub blob URLs.

The scoped validator in `%TEMP%\tsn-staged-funding-final-20261118\validate-documents.mjs` passed 42 files: 39 Markdown/fence checks, fifteen MDX compilations, eight Mermaid parses, 562 local links, 102 Mintlify routes, 124 repository GitHub targets and 107 anchor checks. Both root/protocol CRLF-aware changed-line whitespace checks passed, with no files changing during validation. Separate Node inventory whitespace checks also passed using `core.whitespace=cr-at-eol`, preserving existing CRLF bytes. These checks do not establish browser rendering, remote link availability or live protocol behavior.

## Later signed-funding deadline follow-up

The [November 18 deadline investigation](FUNDING-DEADLINE-20261118.md) establishes timing for three later attempts and records the subsequent bounded issuance/queue correction. The results above remain the earlier staged-source checkpoint; they do not verify that later correction or successful live funding.

## Operator impact and outstanding checks

No program account/instruction layout, program ID, key, dependency, deployment helper, environment or service configuration changed for staging. The matching SDK/browser bundle and Receiver/Node/Cranker code must be loaded together. The user manages existing process terminals; no service was started or stopped during this task. From the repository root, use the existing terminal commands after stopping each prior process yourself:

```powershell
npm run tsn:receiver:dev
npm run tsn:node:dev
npm run tsn:cranker:start
npm run protocol-tests:ui
```

Run each service in its own terminal. The [internal operator guide](../RUN-YOUR-OWN-TSN.md) retains setup and recovery details; it remains internal and is not added to public navigation. The gateway's earlier repair is unchanged by this staged implementation. No deployment or chain migration is required by this request-shape change, but existing program/prover prerequisites still apply.

Verify live progress from message acceptance to `FUNDING_READY`, explicit funding approval, same-work attachment, final Node verification, exact funding confirmation and separate settlement confirmation. Check finalized chain receipts and owner recovery independently. The final Receiver framework build, hosted transaction parity, visual browser verification and a complete live staged payment remain unperformed. Preserve/reconcile every historical signed attempt before authorizing replacement funding; neither this implementation nor an expired blockhash proves that an earlier transaction did not execute. No staging, commit or push occurred.
