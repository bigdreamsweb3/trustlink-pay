# Reproducible documentation references

This directory contains source-derived catalogs, bounded review records and validation reports for the existing internal and Mintlify documentation systems. Generators write documentation metadata; they do not create another SDK, start servers or submit transactions. [The status ledger](../DOCUMENTATION_STATUS.md) describes exact results and remaining scope.

## Review and discovery

- [Documentation inventory](documentation-inventory.json) records paths, hashes, Git boundaries, dispositions and status statements.
- [Document review](document-review.json) supplies manually assigned page status/reasons/evidence. Default discovery is UNVERIFIED.
- [Technical claim inventory](technical-claim-inventory.json) records paragraph/list/code review units and explicit overrides; it does not claim exhaustive sentence-level semantic verification.
- [Claim review](claim-review.json) attaches bounded source/observation evidence to exact text selectors and fails regeneration if a selector becomes stale.
- [SDK API inventory](sdk-api-inventory.json) records public exports, signatures, public members, source locations, direct calls and direct throws. Generated comments remain subject to claim review.
- [HTTP inventory](http-interface-inventory.json) records declared Node routes/models and Receiver handlers; middleware and handler bodies still determine effective authorization.

## Validation reports

Agent instruction discovery, pre-edit conflicts and the current-reference hierarchy are documented in the [knowledge inventory](CODEX_KNOWLEDGE_INVENTORY.md) and [alignment report](CODEX_KNOWLEDGE_ALIGNMENT.md). The [maintenance manual](../DOCUMENTATION_MAINTENANCE.md) is the repeatable workflow; these dated reports are evidence of this alignment, not extra automatically loaded rules.

[Link checks](link-check.json) cover local targets, Mintlify navigation, frontmatter and code-fence balance. [Syntax checks](syntax-check.json) cover MDX compilation and Mermaid parsing. Neither validates all remote URLs, anchor fragments, browser layout or deployed endpoints. [Source preservation](source-preservation.json) compares the task's inspected-source baseline and excludes generated build artifacts; independently made user changes are not attributed automatically.

## Regeneration

Run from the workspace root with the SDK's installed TypeScript compiler and Python available:

```bash
node docs/references/tooling/generate-sdk-reference.mjs
python docs/references/tooling/generate-interface-reference.py
node docs/references/tooling/verify-sdk-examples.mjs
python docs/references/tooling/documentation-audit.py inventory
python docs/references/tooling/generate-claim-register.py
python docs/references/tooling/documentation-audit.py check
```

The example verifier type-checks four complete examples and runs eight offline scenarios using mocked fetch. Its wallet-credit example has no live signing/RPC evidence. Review selectors and page dispositions need human source reconciliation; regeneration does not automatically promote a design claim into a guarantee.

For syntax validation in PowerShell, parser dependencies can live in a temporary directory outside the repository:

```powershell
$taskDocsSyntax = Join-Path $env:TEMP 'trustlink-doc-syntax-20261102'
npm install --prefix $taskDocsSyntax --no-audit --no-fund --ignore-scripts --save-exact @mdx-js/mdx@3.1.1 mermaid@11.12.3 jsdom@26.1.0
node docs/references/tooling/validate-doc-syntax.mjs $taskDocsSyntax
```

The parser uses a temporary JSDOM window because Mermaid imports DOMPurify. It parses diagrams without serving a site. The reconstruction installed these dependencies only in that temporary prefix; production dependency manifests and lockfiles were preserved. Retaining the validator/package versions makes a later repeat meaningful.

The link/syntax validators also cover root `AGENTS.md`, `.codex` Markdown, root `README.md` and `tsn-protocol/README.md`. This explicit scope prevents entry instructions and architecture diagrams from escaping the checks. Historical bodies remain preserved with their boundary labels; parsing them does not turn their old commands into active tasks.

`verify-source-preservation.py` additionally requires the original ignored local baseline at `protocol-test-runs/docs-reconstruction-20261102/source-hashes.json`. It refuses to reconstruct a missing baseline from current files, since that would destroy its evidentiary meaning. The one-time `finish-public-reconciliation.py` records this run's prose corrections; routine regeneration uses the commands above instead.
