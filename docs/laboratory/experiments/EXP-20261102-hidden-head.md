# EXP-20261102: reusing the development hidden-head setup

**Date: 2026-11-02. Outcome: successful for development-artifact reuse and local proof/build checks; end-to-end settlement unverified.** The original observation is preserved in [the readiness run](../../../protocol-test-runs/hidden-head-readiness-20261102/README.md). Its chain checks were captured before a user-managed deployment and must not be presented as current after an upgrade.

## Question, hypothesis and setup

The operational question was whether the previously generated November 1 `hidden_head_v1` development setup still matched the current source well enough to test native TIN credit. The testable hypothesis was that recompiling the current circuit would reproduce its R1CS and witness WASM and that the existing circuit-specific key would verify against that R1CS and the prepared Powers of Tau.

The tools were `circom2 0.2.19`, `circomlib 2.0.5`, `snarkjs 0.7.6`, Node witness/prover tests and the installed pinned Solana build tools. Compilation used an isolated audit output; original setup metadata, keys and earlier SBF artifacts were preserved. The experiment did not perform a new ceremony or sign/submit transactions.

## Procedure and observations

The current circuit was compiled to isolated R1CS/WASM outputs and compared byte-for-byte with November 1 artifacts. The two artifacts matched. The circuit had 165,496 constraints and twelve public inputs; its verification key contained thirteen IC points. The older October 31 eight-input setup was incompatible with this ABI.

`snarkjs zkey verify` accepted the existing November 1 development key with `ZKey Ok!`. Ten witness tests passed, including real local Groth16 generation, serialized reverification and tamper rejection; four prover-binding tests passed. A separate source-bound manifest was created because the older metadata lacked `circuitSourceSha256`. Its SHA-256 was `af511d43974fa2cf32cdfbeda88913988af55eea7b18bb1611d602ab67bc682c`.

Four SBF builds succeeded using `cargo-build-sbf 1.18.26`, platform-tools `v1.41` and Rust `1.75.0`. Fresh TIP, TSNP, TCAP and GPRU binaries differed from the then-deployed Devnet bytes and fit the existing ProgramData capacities. IDL generation was not performed. The readiness folder contains build logs, evidence JSON and preserved prior artifacts; see that original record for hashes and sizes.

## Dated chain preflight

At `2026-11-02T08:57:35.987Z`, confirmed slot `517802208`, the configured provider returned Devnet's genesis hash. GPRU verifier PDA `4qordCRiPw4XFZcPPK8LLJTCpmugTDDawonpfqvpN9cT` was missing. TCAP's root was zero, paused and at sequence zero. Devnet USDC was active/approved with deposits enabled, token ID one and six decimals.

One schema-2 TIN registration was found without the new balance scan key, and no schema-3 registration was found. The inspected TIP runtime supplied creation/resolution and staging but no schema-2-to-3 migration. Seven required Node witness/prover environment settings were unset; local Receiver, Node, gateway and XP ports were not listening during that check. No private identity payloads or credentials were retained in the public record.

Later version-label correction, 2026-11-02: the paragraph above preserves the readiness report's original schema-2/schema-3 labels. Current `TinV1Account::VERSION` is 1; `CURRENT_VERSION=3` belongs to global state. No migration into the current registry layout was found. The [later successful TIN run](EXP-20261102-tin-staged-finalization.md) verifies a fresh version-1 registry; the old scan-key/layout incompatibility remains a separate check.

## Failed assumptions and root causes

An older local binary matching Devnet did not establish source compatibility: the current proof interface has twelve public inputs and the revised TIP leaf includes a scan point. Deploying a new binary does not initialize the verifier, activate a paused root, migrate old TIN accounts or apply Node runtime settings.

A WSL Anchor probe initially selected an installer path and was stopped. Successful compilation used explicitly selected already-installed binaries. This failure is tool resolution evidence, not a program failure. The original report preserves this distinction.

## Conclusion and decision

The November 1 development setup can be reused for the matching current circuit in Devnet testing. Reuse is conditional on source/artifact/key/verifier agreement; it is not approval for production trust. A fresh valid recipient registration and an ordered TIP snapshot matching its new confirmed root are needed for the first post-upgrade credit test.

The remaining execution sequence is operator-managed deployment, matching verifier initialization, canonical TCAP root activation, explicit Node configuration, fresh TIN creation and refreshed witness state, followed by fresh wallet-signed funding and settlement verification. On-chain proof verification, actual compute consumption, funding/settlement signatures, reserve transitions and owner Memo recovery remain unverified by this experiment.

## Evidence

Use [readiness README](../../../protocol-test-runs/hidden-head-readiness-20261102/README.md), [sanitized readiness evidence](../../../protocol-test-runs/hidden-head-readiness-20261102/readiness-evidence.json), [circuit source](../../../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom), [witness tests](../../../tsn-protocol/services/tsn-node/tests/test_hidden_head_witness.py) and [prover tests](../../../tsn-protocol/services/tsn-node/tests/test_hidden_head_prover.py). The readiness folder and build artifacts are local evidence and may be ignored by Git; the narrative preserves the observation without claiming those artifacts will exist in every clone.
