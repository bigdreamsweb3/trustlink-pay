# Implementation status

This page describes the current repository and deployed evidence, not the
desired architecture. “Implemented” means reachable in code; it does not mean
that a Devnet deployment has been independently verified.

| Subsystem | Status | Notes |
| --- | --- | --- |
| TIN identity and resolution | Implemented | Program/client and application routes exist; review deployed state per cluster. |
| ZK-PRU receiving policy | Implemented / experimental | Planner and accumulator code exist; lifecycle and Devnet evidence must be checked per environment. |
| ZK-PRU spending planner | Implemented / under migration | Local planner supports selection, tranches, fees, and change; end-to-end production call graph is still being aligned. |
| Execution Plan | Implemented / under migration | SDK builder, commitments, and signatures exist; the public naming remains a compatibility concern. |
| Device-local decryption | Partially implemented | SDK/device modules exist, but the complete production boundary is not yet proven across every API path. |
| Scoped signatures | Implemented / under migration | SDK and program verification paths exist; verify exact deployed program and integration tests. |
| TSN Node | Implemented / under migration | Current source directory retains `mempool` naming; verification/reservation services are active. |
| Cranker execution | Implemented / under migration | Operator/fee-payer submission exists; no-user-key guarantees require continued boundary tests. |
| TSN execution PDA | Experimental / under migration | PDA/delegate checks exist in program code; deployment and migration evidence remain required. |
| TSN Escrow | Implemented / experimental | Program-controlled escrow path exists; confirm all recovery and settlement transitions on the target cluster. |
| Exact Ed25519 verification | Implemented / under migration | Program and SDK verification helpers exist; malformed-offset and replay tests are required gates. |
| Recurring payments | Disabled | No production recurring transfer or delegate execution is exported. |
| TCAP | Experimental | Separate confidential-asset direction; not the active TSN settlement actor. |
| Formal zero-knowledge proofs | Not claimed | Commitments/encryption/scoped authorization are present; no formal proof system is asserted here. |

## Known migration boundary

The current TSN Node source still contains legacy encrypted-seed assembly and
server-side decryption/derivation paths under migration. They are not the
target architecture and must not be described as the desired security model.
Until removed and covered by boundary tests, the implementation cannot claim
that every production API is device-only.

The repository also contains historical compatibility identifiers and legacy
source paths. They must be rejected or removed before a production launch.

## Evidence rule

Local tests establish code behavior. Devnet evidence requires an executable
program account, cluster-bound signatures, transaction logs, confirmed
signatures, and fetched account state. A local IDL or a source file alone is
not proof of deployed behavior.
