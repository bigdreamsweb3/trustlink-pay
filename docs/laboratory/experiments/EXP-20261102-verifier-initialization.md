# EXP-20261102: verifier initialization packet limit and staged setup

**Status: CURRENT source fix with bounded build/test and read-only account evidence, 2026-11-02.** The user reported successful program deployment and requested directions for GPRU verifier initialization and TCAP root activation. Inspection found the original full-key GPRU initializer could not fit a Solana transaction. This record does not claim the subsequent corrected GPRU binary was deployed or that enrollment/activation/payment completed.

## Problem, replacement and contract

The current proof requires twelve public inputs and thirteen IC points. The original initializer encoded two 32-byte commitments, a 64-byte alpha point, three 128-byte G2 points, a four-byte IC vector length, thirteen 64-byte IC points and an eight-byte instruction discriminator: 1,356 bytes of instruction data against a 1,232-byte transaction packet limit. A lookup table cannot remove the instruction-data payload. The superseded direct initializer therefore had no usable client transaction.

The replacement creates the existing verifier PDA disabled with the fixed key header and commitments, writes at most four IC points per authority-signed transaction, then validates every IC point and the complete domain-separated key commitment before setting enabled. Both stored verifier authority and canonical Mother Escrow authority are required for writing/enabling. Enabled keys cannot be changed; incomplete/wrong keys remain disabled. No temporary per-user account, alternate proof verifier or normal settlement fallback was added.

The initializer ABI changed; its instruction name remains `initialize_hidden_head_verifier_v1`, now with the fixed header only. New setup instructions are `write_hidden_head_verifier_ic_v1` and `enable_hidden_head_verifier_v1`. Settlement proof inputs, circuit/proving artifacts, verifier account layout and program IDs remain unchanged. Existing matching disabled setup is resumable by the operator script. The old deployed GPRU binary requires a rebuild/redeployment before these commands work.

## Read-only account and signer observations

Public Devnet reads at **2026-11-02T12:10:11.580Z**, slot **517850409**, found verifier PDA `4qordCRiPw4XFZcPPK8LLJTCpmugTDDawonpfqvpN9cT` absent and TCAP root `ESunnNGeKYHiJx6ECsCUEh95zTVwsmJKRRZBo6vQwWbq` paused at sequence zero with zero current/previous roots. Mother authority is `FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG`; TCAP governance is `78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX`. Public-key derivation verified the local Node Mother keypair and WSL Solana wallet match those separate roles; no private bytes were logged or transaction signed.

TCAP config itself was unpaused. Its older proof-program fields were unset/disabled; native hidden-head credit uses the explicitly checked GPRU program/verifier accounts rather than those legacy fields. Root activation remains the existing governance-only `activate_commitment_root_v1`; it sets the canonical Poseidon empty root and unpauses only before the first transition. No new TCAP code was needed.

## Verification and remaining limits

- The Node script's three offline tests passed: six packets fit the Solana limit and reconstruct all points; stale/mismatched/old keys are refused; root instruction and owner/layout checks reject invalid state.
- Real read-only plans using the exported local key produced six packet sizes **790, 506, 506, 506, 313, 244 bytes** for enrollment and **244 bytes** for root activation. No wallet was loaded for those plans.
- GPRU SBF build through the root `gpru:program:build:devnet` flow passed under Anchor 0.30.1/Solana 1.18.26. The pre-existing unused macro doc-comment warning remained; no SBF stack error was reported. Program-ID verification passed.
- Rust configuration tests passed **3/3** via `cargo test --lib verifier_setup_tests`: incomplete/altered keys stay disabled, out-of-range/empty/zero chunks cannot partially mutate the key, and enabled keys reject writes. Existing host/Anchor cfg warnings remained; they did not fail compilation or tests.

Root dependency placeholders caused the first JavaScript attempt to fail importing Web3. The new setup script uses the existing installed TSN SDK dependency tree and needs no built SDK or manifest dependency changes. Initial read-only development checks also caught an incorrect genesis constant and config-field offsets; they were corrected against public Devnet and the actual TCAP decoder before any signing path was used. The final script checks Devnet genesis, account owners/layouts, canonical root binding, authority and packet size; `--send` is required for mutation.

No assistant deployment, verifier enrollment, root activation, service restart or payment occurred. The operator must deploy the corrected GPRU binary, run enrollment/activation with their verified separate wallets, then confirm verifier/key/root state. Witness snapshots, Node artifact configuration and complete credit/history recovery still need their own checks. Source/build/unit evidence does not establish live proof verification or production review.

## Source and continuation

See [GPRU setup ABI](../../../tsn-protocol/programs/gpru/src/lib.rs), [configuration guards](../../../tsn-protocol/programs/gpru/src/hidden_head.rs), [root activation](../../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/activate_commitment_root_v1.rs), [operator script](../../../scripts/hidden-head-setup.mjs), [script tests](../../../scripts/tests/hidden-head-setup.test.mjs) and [runbook](../../GROTH16-PROVER-AND-KEY-ARTIFACTS.md#one-time-verifier-initialization-and-root-activation). The [native credit ABI](../credit-abi.md) remains the runtime reference.
