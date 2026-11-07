# TSN Laboratory and Engineering Record

Use [Build and operate your own TSN](../RUN-YOUR-OWN-TSN.md) for the full installation and operating procedure, including reference/independent-deployment boundaries and current recovery steps.

This record explains the checked-out TSN implementation, its engineering decisions, and the evidence needed to establish behavior. It extends the existing team runbooks and protocol-flow guides rather than moving their files or replacing the public Mintlify site. The public developer handbook remains in [tsn-docs](../../tsn-protocol/tsn-docs/README.md).

## Study paths

- [Foundations and assumptions](foundations.md) explains the settlement thesis and the distinction between identity, authorization, funding, execution and finality.
- [Canonical architecture map](architecture-map.md) follows the current wallet-to-TIN credit contract across the SDK, Receiver, Node, Cranker and programs.
- [Component engineering records](components.md) documents responsibilities, important functions, data, authorization, failures and limitations.
- [Cranker transaction map](cranker-transaction-map.md) covers every current daemon submission branch, its signers, fees, instructions, confirmation and retry boundaries.
- [First finalized credit baseline](experiments/EXP-20261102-native-credit-baseline.md) records the actual transaction, 93 field definitions, existing public funding linkage and next-credit comparison procedure.
- [State and route diagrams](state-and-route-diagrams.md) explain identity, hidden maps, reserve accounting and the separate epoch family.
- [Cryptography and privacy](cryptography.md) describes the implemented cryptographic relations and their public-data boundaries.
- [Invariants and recovery](invariants.md) records checks that must survive implementation changes.
- [Contradictions and claim coverage](reconciliation-register.md) records corrections and unresolved evidence.
- [Technology reference](technology-reference.md) connects dependencies and tool versions to their actual use.
- [HTTP interfaces](interface-reference.md) and [program declarations](onchain-reference.md) provide reproducible source catalogs.
- [Credit ABI](credit-abi.md) documents the exact native call/account and proof contract.
- [Research and experiments](experiments/README.md) preserves observed results and failed approaches without promoting them into current guarantees.
- [Architecture decisions](decisions/README.md) records decisions reconstructed from implementation; unknown alternatives remain unknown.
- [Historical archive](../historical-archive/README.md) identifies superseded narratives while retaining their original files.
- [Documentation status](../DOCUMENTATION_STATUS.md) records coverage, contradictions, verification and continuation work.

## Canonical locations

The [documentation maintenance manual](../DOCUMENTATION_MAINTENANCE.md) governs additions, corrections, evidence, public synchronization and continuation. It links existing records rather than duplicating their engineering detail.

Application-facing concepts and SDK contracts belong in Mintlify. Source-level processing, deployment, witness/key setup, operator instructions and research belong here. Existing [team guides](../team/README.md) and [TIN issuance stages](../protocol-flows/tin-creation/README.md) retain their established locations. New pages link those guides instead of copying their procedures.

The generated [document inventory](../references/documentation-inventory.json), [SDK symbol inventory](../references/sdk-api-inventory.json) and [interface reference](interface-reference.md) provide a reproducible starting point for review. Discovery is separate from verification: a catalogued document can remain UNVERIFIED, and a source-backed contract can remain untested on chain.

## Evidence convention

Use CURRENT for implementation descriptions that match inspected contracts, VERIFIED for a specified observation or tested behavior, EXPERIMENTAL for active unfinished work, PROPOSED for unadopted designs, HISTORICAL for superseded descriptions, DEPRECATED for supported functionality being phased out, RETIRED for explicitly abandoned concepts, and UNVERIFIED where evidence is insufficient. These labels describe claims, not product maturity. For a mixed document, classify the whole page conservatively and label individual claims separately.

Every observation must identify its scope and date. The [November 2 readiness experiment](experiments/EXP-20261102-hidden-head.md) is a point-in-time observation taken before a user-managed deployment; it cannot establish the chain state after that deployment. The later [six-transaction TIN run](experiments/EXP-20261102-tin-staged-finalization.md) independently establishes fresh registry creation, and the [credit baseline](experiments/EXP-20261102-native-credit-baseline.md) establishes one finalized native credit. Owner credit recovery remains unverified. Do not copy private payloads, credentials, wallet secrets or lookup material into the record.
