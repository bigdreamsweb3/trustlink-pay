# Agent reference index

**Status: CURRENT.** Root [AGENTS.md](../AGENTS.md) is the concise repository entry instruction. Files here are explicit supporting references; `.agents/` placement does not automatically load Markdown. Read the linked file when the task requires it. The [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md) documents discovery, evidence criteria and continuation without relying on chat history.

TrustLink Labs engineers use agents for research, implementation and review. These references support any agent environment; the team must configure that environment's instruction loading and give it the applicable source, ABI and evidence records. An agent's proposed change or successful tool call does not replace engineering review or authorize service, chain or Git operations.

## Current guidance

- [Local repository security](../docs/REPOSITORY-SECURITY.md): approved fetch sources, disabled automatic Git imports/writes, dependency install-script policy, secret handling and bounded verification. These controls grant no authority to fetch, commit, push or operate services.

- [TSN operator guide maintenance](tsn-operator-guide-policy.md): mandatory source/command/configuration synchronization for [building and operating TSN](../docs/RUN-YOUR-OWN-TSN.md).

- [Architecture terminology](architecture-terminology.md): experimental first-release v1 naming, component ownership and capability boundaries for architecture/code/documentation work.
- [Architecture-change policy](architecture-change-policy.md): ABI-first cross-layer investigation and replacement/removal rules before protocol edits.
- [Invention/source brief](architecture-source-brief.md): current proof, privacy and settlement boundaries for technical explanations.
- [Documentation sync entry](documentation-sync-policy.md): routes documentation work to the mandatory manual.
- [Cleanup index](protocol-cleanup-index.md): source/capability map for scoped reduction review; it authorizes no deletion.

Canonical technical details live in the [Laboratory architecture map](../docs/laboratory/architecture-map.md), [components](../docs/laboratory/components.md), [credit ABI](../docs/laboratory/credit-abi.md), [cryptography](../docs/laboratory/cryptography.md) and [reconciliation register](../docs/laboratory/reconciliation-register.md). [Documentation status](../docs/DOCUMENTATION_STATUS.md) records dated evidence and unresolved readiness. Public guidance remains in the [Mintlify handbook](../tsn-protocol/tsn-docs/README.md). Verify the relevant source/tests before publishing a behavior claim; do not copy the protocol textbook into root instructions.

## Historical and proposed context

- [Unlinkable latest-head design](gpru-unlinkable-latest-head.md): October 29 proposal/checkpoints, superseded ABI/readiness and unresolved privacy goals.
- [Memo delta finding](GPRU_MEMO_DELTA_PROOF_FINDING.md): attributed November 1 relation fix and original checkpoint, with later evidence pointers.
- [Credibility work order](credibility-pass-work-order.md): historical five-item task; commit gates and proposed APIs are not standing requirements.
- [SDK/UI verification prompt](tsn-verification-prompt.md): historical repair handoff; creation bans and test outcomes do not describe the current contract.
- [Docs pull prompt](pull-docs.md): historical standalone-checkout prompt, unsuitable for this populated non-standalone tree.

Historical records explain evolution and may preserve old commands. Their original bodies must not direct new implementation or authorize Git, service or chain actions. Consult their current-reference boundary before reading the old record. The [pre-edit inventory](../docs/references/agent-knowledge-inventory.md) and [alignment report](../docs/references/agent-knowledge-alignment.md) record the reconciliation.
