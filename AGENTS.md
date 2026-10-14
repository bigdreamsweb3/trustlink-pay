# Repository instructions

Before changing protocol code, read `.codex/architecture-change-policy.md` and inspect the current program, SDK, Receiver, Node, and Cranker contracts that participate in the affected flow. Treat executable code and account/instruction layouts as the source of truth; do not infer behavior from stale docs or prior implementations.

For an architecture change, establish the intended contract and verify the necessary program accounts and instruction requirements before editing. Once the replacement is implemented and verified, remove superseded runtime instructions, callers, variables, and configuration. Do not preserve an old path as a fallback or parallel compatibility path unless the user explicitly requires migration support. Keep required one-time migrations separate from normal runtime flows and explain why they remain.

Preserve unrelated work and existing program IDs, keypairs, deployment configuration, and user-managed services. Do not start/stop services, sign transactions, deploy programs, or commit/push unless the user explicitly asks. Report the exact verification performed and any compile or chain results that remain unverified.
