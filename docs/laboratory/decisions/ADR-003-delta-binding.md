# ADR-003: use one owner-recoverable proof-bound delta

**Status: CURRENT source decision recorded as fixed 2026-11-01; local proof evidence recorded 2026-11-02. Independent review and chain execution remain unverified here.**

## Context, alternatives and problem

The [Memo finding](../../../.codex/GPRU_MEMO_DELTA_PROOF_FINDING.md) identifies an earlier approach that encrypted a delta independently of the proved balance transition. A Memo hash commits ciphertext bytes without proving their plaintext arithmetic relation. Retaining that approach would not establish consistent owner replay.

## Decision and rationale

Authenticate the owner scan point in the TIP route; prove the one-time ciphertext relation using the same delta as the Pedersen update; bind ciphertext/ephemeral point in the Memo prefix and GPRU public inputs. The encrypted action body does not accept a second delta. This aligns circuit, program, Node, Cranker and owner SDK recovery.

## Consequences

The proof interface has twelve public inputs, the route leaf authenticates five fields, and older account/key artifacts require compatibility checks. Owner validation of action-body fields and history continuity remains required. The cryptographic relation does not imply that global ordering or wallet endpoints are confidential.

Evidence and observed limits are preserved in [EXP-20261101](../experiments/EXP-20261101-delta-binding.md) and [EXP-20261102](../experiments/EXP-20261102-hidden-head.md). These bounded observations avoid treating source fixes as automatically deployed behavior.
