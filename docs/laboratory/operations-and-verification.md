# Operations, upgrade evidence and documentation validation

**Status: CURRENT command and contract reference, 2026-11-02.** This page links existing operational guides and records verification performed for documentation. It does not start services, initialize accounts or submit transactions automatically.

## Existing operational entrypoints

Use [Devnet build/deploy](../DEVNET-BUILD-DEPLOY.md), [Cranker operator setup](../CRANKER-OPERATOR-GUIDE.md), [Node keys](../TSN-NODE-KEYS.md), [Receiver storage modes](../team/operations/receiver-storage-modes.md), [service coordination](../service-coordination-and-quota.md), and [Devnet evidence capture](../TSN-DEVNET-EVIDENCE-CAPTURE.md). These guides retain their established paths. Environment-specific older observations must be refreshed before treating a guide as proof of current deployment.

The root deployment script is `npm run programs:devnet:deploy:all`; it rebuilds/deploys TIP before the TSNP/TCAP/GPRU wrapper. It uses configured cluster/wallet/program IDs. Deployment is operator action, not a documentation check. Avoid concurrent edits to deployment artifacts or user-managed runtime configuration while an upgrade runs.

## Native-credit post-upgrade evidence

The [one-time verifier/root setup commands](../GROTH16-PROVER-AND-KEY-ARTIFACTS.md#one-time-verifier-initialization-and-root-activation) use the corrected staged GPRU initializer. The original full-key initializer exceeded Solana's packet limit. Redeploy the corrected GPRU build, initialize under Mother authority, activate the sequence-zero root under TCAP governance, then refresh status. The [setup record](experiments/EXP-20261102-verifier-initialization.md) records the bounded checks; enrollment and root activation are explicit operator transactions.

After a user-managed deployment, compare deployed program bytes/slots with the intended local artifacts and preserve the configured IDs/authority. Verify the matching GPRU verifier account, canonical root activation, asset/reserve flags and recipient schema. Applying a binary does not apply Node settings or migrate an old TIN registration.

For the first native credit, refresh the ordered TIP snapshot after valid recipient creation and ensure the TCAP snapshot reconstructs its confirmed current root. Use a fresh wallet message/signature and signed deposit. Capture Node verification, Cranker lease, exact submitted signature, successful chain result, expected root/liability transition and owner record recovery. Funding and settlement need independent signatures/evidence. Retain allowlisted summaries rather than raw private witnesses or authorization payloads.

The [November 2 experiment](experiments/EXP-20261102-hidden-head.md) supplies a pre-deployment observation and local build/proof evidence. Those snapshots can become stale while the operator deploys; this documentation task performs no chain mutations or live availability claims.

The later [staged TIN experiment](experiments/EXP-20261102-tin-staged-finalization.md) independently verified six finalized transactions, an active registry and stage closure. The [Cranker transaction map](cranker-transaction-map.md) records subsequent confirmed reserve funding, the root-matching TIP snapshot repair, locally tested lease-authorization/retry corrections and the corrected TCAP asset-layout preflight. The existing guarded retry supports missing-snapshot and the exact repaired asset-preflight rejection, preserves confirmed funding and requires fresh Node verification. Load corrected services before explicitly requeueing the already funded settlement; successful TIN creation and deposit do not establish native credit completion.

## SDK build verification

The root command is:

```bash
npm run tsn:sdk:build
```

During this documentation run, it failed because the root `.bin/tsc` launcher referenced missing `node_modules/typescript/bin/tsc`, while the SDK's own TypeScript package was present. Using the installed scoped compiler directly succeeded without changing package manifests, dependencies or protocol source:

```bash
node tsn-protocol/sdks/tsn-sdk/node_modules/typescript/bin/tsc -b tsn-protocol/programs/tcap-protocol/tcap-sdk/tsconfig.json tsn-protocol/sdks/tsn-sdk/tsconfig.json --pretty false
```

This records a launcher/dependency-location problem rather than a source compiler error. A fresh environment should install the expected dependency tree through its reviewed package-lock workflow. The workaround does not establish a supported global toolchain policy.

## Reproducible documentation checks

Run from the workspace root:

```bash
node docs/references/tooling/generate-sdk-reference.mjs
python docs/references/tooling/generate-interface-reference.py
node docs/references/tooling/verify-sdk-examples.mjs
python docs/references/tooling/documentation-audit.py inventory
python docs/references/tooling/generate-claim-register.py
python docs/references/tooling/documentation-audit.py check
git diff --check
git -C tsn-protocol diff --check
```

The SDK generator parses root/subpath exports with the installed TypeScript compiler; it does not import or execute the SDK. The interface generator parses Python/Next.js/Rust declarations without starting services. The example verifier type-checks complete example files and exercises canonical preparation, request/client errors and service health with mocked fetch. Wallet-credit preparation is type-checked only; it requires real RPC and wallet callbacks to execute.

The [reference tooling guide](../references/README.md) also records temporary MDX/Mermaid/JSDOM syntax validation and the original-baseline preservation check.

The inventory applies explicit page classifications from [document-review.json](../references/document-review.json). Unreviewed whole-page claims remain UNVERIFIED. The local link checker validates filesystem targets, navigation pages, MDX frontmatter and balanced fences. It does not validate remote URLs, anchor names, MDX compilation, Mermaid rendering or live endpoint behavior; report those checks separately.

## Maintenance ownership

Program/account changes require updates to ABI, lifecycle, invariants, relevant ADRs and source catalogs. SDK export changes require reference regeneration and example validation. Service routes and projection changes require interface and trust-boundary review across Receiver/Node/Cranker. A new research claim needs a bounded experiment record and a status label before entering the public narrative.

No secret environment values, Git mutations or production-source edits are required for these documentation commands. Publication, source migrations and service starts/stops are separate user-directed operations. [Documentation status](../DOCUMENTATION_STATUS.md) records remaining work and exact checks so continuation does not repeat the audit.
