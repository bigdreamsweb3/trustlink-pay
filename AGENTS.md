# Repository instructions

Start architecture work with `docs/laboratory/architecture-map.md`, the applicable component/ABI records, and `.codex/architecture-terminology.md`. Open these references explicitly; their contents are not automatically loaded through a link. `.codex/README.md` identifies current guidance and historical context. Never treat historical brainstorming or an old task prompt as active architecture or authorization.

Before changing protocol code, read `.codex/architecture-change-policy.md` and inspect the current program, SDK, Receiver, Node, and Cranker contracts that participate in the affected flow. Treat executable code and account/instruction layouts as the source of truth; do not infer behavior from stale docs or prior implementations.

For an architecture change, establish the intended contract and verify the necessary program accounts and instruction requirements before editing. Once the replacement is implemented and verified, remove superseded runtime instructions, callers, variables, and configuration. Do not preserve an old path as a fallback or parallel compatibility path unless the user explicitly requires migration support. Keep required one-time migrations separate from normal runtime flows and explain why they remain.

Preserve unrelated work and existing program IDs, keypairs, deployment configuration, and user-managed services. Do not start/stop services, sign transactions, deploy programs, or commit/push unless the user explicitly asks. Report the exact verification performed and any compile or chain results that remain unverified.

For documentation requests, read `docs/DOCUMENTATION_MAINTENANCE.md` and follow its source-first impact, status, validation and completion workflow. Meaningful implementation changes require reviewing both `docs/` and `tsn-protocol/tsn-docs/`, plus affected README diagrams and examples. Update only the task's scope, link existing canonical records, preserve valuable research history and correct contradictions rather than adding parallel descriptions.

Do not invent functionality, SDK APIs, migrations, experiments or cryptographic guarantees. Inspect source/tests before describing implementation. Distinguish CURRENT implementation, scoped test/VERIFIED evidence, EXPERIMENTAL, PROPOSED, DEPRECATED, RETIRED, HISTORICAL and UNVERIFIED claims; source/build/deployment/payment results are separate. Record unresolved questions and missing checks without claiming work was performed.
