# TSN public documentation and developer handbook

This is the existing Mintlify site. `docs.json` owns routes/navigation; `.mdx` pages contain public protocol and SDK guidance. Internal research, source engineering, operator commands and dated evidence live in the [Laboratory record](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/README.md).

Start with [architecture](overview/architecture.mdx), [payment lifecycle](developers/payment-intent-lifecycle.mdx), [SDK installation](sdk/getting-started.mdx), [configuration](sdk/configuration.mdx), [payment examples](sdk/payment-guide.mdx), [complete API reference](sdk/api-reference.mdx) and [glossary](glossary/index.mdx). Node/Cranker public role guides link the existing internal operational runbooks.

## Development and validation

Contributors and future Codex sessions follow the [documentation maintenance manual](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/DOCUMENTATION_MAINTENANCE.md) and applicable [repository instructions](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/AGENTS.md). The manual covers both documentation destinations, implementation evidence, examples/diagrams, history and completion reports.

Use the repository's existing Mintlify tooling (`mintlify dev` from this directory when installed) for local preview. No new site/framework or service is created by documentation reconstruction. The SDK is a private workspace package; build it before using compiled examples.

From the full [development workspace](https://github.com/bigdreamsweb3/trustlink-pay), regenerate and verify with:

```bash
node docs/references/tooling/generate-sdk-reference.mjs
python docs/references/tooling/generate-interface-reference.py
node docs/references/tooling/verify-sdk-examples.mjs
python docs/references/tooling/documentation-audit.py inventory
python docs/references/tooling/documentation-audit.py check
```

The catalog covers actual root/subpath exports, excluding dependency internals. Complete TypeScript examples live in `sdk/examples`; they are thin SDK calls, not a second SDK. Offline verification mocks transport and does not create signatures or submit transactions. Partial inline snippets are illustrative unless a page states otherwise.

Keep current source contracts separate from local build/proof results and dated chain observations. Public capability claims require relevant deployment/transaction evidence. Source links can refer to local changes not yet published on the remote main branch. [Documentation status](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/DOCUMENTATION_STATUS.md) records verification limits and continuation tasks.
