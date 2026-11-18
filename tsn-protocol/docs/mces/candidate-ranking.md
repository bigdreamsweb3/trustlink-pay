# MCES candidate ranking

**Status: retained selection from the November 17, 2026 pre-refactor assessment.** Receiver was the single recommended directory and was subsequently approved by the user. The [assessment](candidate-assessment.md) supplies original findings and verification limits; the [plan](next-refactoring-plan.md) preserves its proposed sequence and links the resulting Receiver implementation. Scores describe the baseline architectures rather than the post-refactor file layout.

## Scoring method

Each criterion uses an ordinal score from 1 to 5. For complexity, concentration, reuse and MCES gain, higher means a stronger reason to modularize. For isolation, dependency tractability, safety and verification, higher means a more practical next task. Safety deliberately reverses raw operational risk: a highly critical service receives a lower safety score. Estimated effort is explained separately rather than pretending that these ordinal values predict delivery time.

The priority score is `sum(weight × criterion score / 5)`, out of 100. The weights favor verifiable extraction and a stable dependency seam:

- **A — architectural complexity, 10%:** 1 is a thin page/proxy; 3 is several transport responsibilities; 5 is a multi-stage domain/coordination runtime.
- **F — function concentration, 15%:** 1 is focused implementations; 3 is several mixed helpers; 5 is major execution responsibilities concentrated with shared orchestration/state. File/function counts are supporting evidence only.
- **I — component isolation, 15%:** 1 has unclear ownership; 3 has identifiable families needing contracts; 5 has narrow independently testable seams. Existing partial isolation can score 4.
- **D — dependency tractability, 10%:** 1 crosses SDK, deployed contracts and external proof systems; 3 has moderate framework/storage coupling; 5 uses narrow stable ports with little integration coupling.
- **R — reusability, 10%:** 1 is presentation-specific; 3 can serve adjacent use cases; 5 provides shared current-service coordination contracts. This is potential engineering reuse, not an invented future API.
- **O — operational safety, 10%:** 1 has very high signing/custody/irreversible execution risk; 3 has moderate state/availability risk; 5 has a small reversible presentation scope. High coordination/shared-transport risk scores 2.
- **V — verification readiness, 20%:** 1 lacks behavior fixtures or an available local check; 2 has syntax/type checks only; 3 has meaningful but partial helper tests; 4 has passing state/route/component tests with material integration gaps; 5 adds complete relevant component and integration baselines.
- **M — incremental MCES gain, 10%:** 1 adds little beyond targeted cleanup; 3 improves existing transport/integration modules; 5 makes central ownership and dependency substitution substantially clearer.

The scores are source-based engineering judgments, not measured reliability, performance, vulnerability or coverage statistics. Weights and individual values are published so the selection can be challenged without changing the evidence. Eligibility is a prior gate: Node is the reference, absent solutions supply no candidates, and generated artifacts/templates are not ranked projects.

## Comparative ranking

1. **Receiver — 80/100.** `A=5, F=4, I=4, D=3, R=5, O=2, V=4, M=5`. Very high suitability; high overall extraction complexity and operational risk. It owns the reusable work/lease/projection seam, offers identifiable pure and transaction-backed families, and passed 46 current tests plus typechecking. The initial slice can avoid changing hosted adapter initialization or transactional scheduling. Missing hosted Firestore/session coverage prevents a verification score of 5.
2. **Cranker operator daemon — 73/100.** `A=5, F=5, I=4, D=2, R=4, O=1, V=3, M=5`. Very high suitability; high extraction complexity and very high operational risk. Its main file mixes more execution families than Receiver's store, and 22 helper tests passed. Direct SDK/cross-chain imports, module state and incomplete dispatcher/session/TIN integration fixtures make it a less safe next task.
3. **RPC gateway — 62/100.** `A=3, F=4, I=4, D=3, R=4, O=2, V=2, M=3`. High suitability for focused internal extraction; medium complexity and high shared-availability risk. Existing config/pool/app/host separation reduces the immediate architectural gain. Six syntax checks passed, but provider/error/HTTP/WebSocket behavior lacks a discovered local suite.
4. **Cross-chain integration — 48/100.** `A=4, F=3, I=3, D=1, R=4, O=1, V=1, M=3`. Selective suitability; very high whole-directory complexity and operational risk. It spans off-chain adapters, proof workers, deploy tooling and twelve Solidity contracts. The configured TypeScript check passed, but no local behavior suite was found and worker/contract verification is absent. Treating it as one Python-like extraction project would ignore ABI/storage/event and proof boundaries.
5. **Mempool UI — 44/100.** `A=1, F=2, I=3, D=4, R=2, O=5, V=1, M=1`. Low suitability for full MCES; low cleanup complexity and low presentation risk, with separate public-data concerns. Its thin page/proxy does not justify a broad component hierarchy. No local suite exists and its local compiler is absent. Freeze its Receiver response/display contract before targeted improvements.

## Why Receiver comes next

Receiver's advantage is the combination of shared contract ownership and available characterization, rather than being the largest file or a risk-free component. Stable work/projection/lease components benefit Node and Cranker immediately. Its existing envelope, wake, retry, authorization and reconciliation helpers demonstrate that responsibility-based extraction fits the current application.

Cranker is the strongest alternative. Its concentration score exceeds Receiver's, but Receiver leads by seven points because dependency tractability, operational safety, reusable ownership and verification are stronger. Raising Cranker's verification score from 3 to 4 alone would add four points and leave Receiver first. Raising Gateway's verification score from 2 to 4 would add eight points and still leave Receiver first. The choice should be reconsidered if the actual Receiver characterization or upstream contract capture fails, rather than relying on the totals regardless of new evidence.

The gateway is an upstream transport service, but its current HTTP seam can be frozen and mocked without changing gateway internals. Receiver's dependency on that seam does not require modularizing the gateway first. Node's bidirectional calls likewise need exact existing request/error fixtures, not a simultaneous Node refactor. Cranker's SDK and cross-chain source dependencies warrant explicit capture before its later turn. The UI's projection consumer role and small responsibility make it a poor foundation for protocol-wide MCES adoption.

The ranking is a priority assessment, not approval to execute a five-project roadmap. The single next task is Receiver only. Begin with deterministic work/projection functions, then transaction commands and narrowly declared dependencies; keep public routes and existing import facades stable. [The nine-stage plan](next-refactoring-plan.md) lists the extraction order, required checks and stop conditions.
