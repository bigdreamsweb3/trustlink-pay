# TCAP implementation status

Last updated: 2026-07-21.

Program ID: `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x`

This document distinguishes design from implementation and test evidence. No
TCAP phase is externally audited or production-ready.

| Phase | Designed | Implemented | Compiled | Unit-tested | Localnet-tested | Devnet-tested | Cryptographically proven | Externally audited | Production-ready |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Registry and initialization | Yes | Yes | Yes | Partial | No | Yes | Not applicable | No | No |
| Deposit Phase 1 reserve backing | Yes | Yes | Yes | Partial | Blocked | Yes, 24/24 adversarial suite | Not applicable | No | No |
| Funding claims / pending funding commitments | Yes | Yes | Yes | Yes | Blocked by missing AVX2 | Devnet confirmation pending current upgrade | No | No | No |
| Confidential ownership | Architecture only | No | No | No | No | No | No | No | No |
| Container state | Architecture only | No | No | No | No | No | No | No | No |
| Proof verification | Interface concepts only | Rejecting boundary only | Yes | Partial | No | No | No | No | No |
| Nullifier consumption | State definitions only | No | No | No | No | No | No | No | No |
| Confidential transfers | Architecture only | No | No | No | No | No | No | No | No |
| Public exits/redemption | Architecture only | No | No | No | No | No | No | No | No |
| Fee authorization | Architecture only | No | No | No | No | No | No | No | No |
| TSN authorization integration | Non-spendable scaffold only | Partial scaffold | Yes | Partial | No | No | No | No | No |

## Current gate

Deposit Phase 1 passed SBF compilation, Rust validation, real devnet funding,
event decoding, account-substitution attacks, atomicity checks, and direct
unauthorized reserve-withdrawal attacks. The canonical reserve invariant remains:

```text
reserve.actual_assets == canonical reserve vault amount
```

The gate is not fully complete under the phased execution policy because:

- the available WSL and Docker CPU environments do not expose AVX2, so the
  prebuilt Solana 1.18.26 local validator aborts before startup;
- the `u64` accounting-overflow path requires a safe local program-test runtime
  capable of injecting a near-limit program-owned reserve account.

Phase 2 has an implemented and Rust-tested funding-entry primitive. The same
local-validator limitation remains, and its fresh devnet confirmation must be
recorded before this row can be described as devnet-tested.

## Current security boundary

A legacy Phase 1 deposit creates reserve backing only. The new Phase 2 funding
entry creates a distinct pending `FundingClaimV1` and increases pending funding
liabilities, but still does not create confidential ownership, a container
balance, a nullifier, a proof, a transfer, an exit, redemption, or TSN
settlement authority. Test assets in the reserve remain locked because no
withdrawal or redemption instruction exists.
