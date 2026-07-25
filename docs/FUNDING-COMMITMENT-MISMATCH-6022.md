# Funding Commitment Mismatch (6022 / 0x1786)

## Observed failure

The historical Devnet simulation invoked the deployed TCAP V1 handler
`DepositWithFundingCommitmentV1` and failed with Anchor error
`FundingCommitmentMismatch` (`6022`, `0x1786`). The instruction was not
submitted and no confirmed token or TCAP state changed.

## Confirmed facts

- The failure happened in **Devnet simulation**, not in a local validator and
  not in a confirmed transaction.
- The historical deployed binary recognized the V1 instruction discriminator.
- The program compared the supplied commitment with a reconstruction from
  authorized fields and rejected the comparison.
- The exact V1 source location reported by the log was
  `deposit_with_funding_commitment_v1.rs:162`.
- No signature, claim, nonce advancement, root update, vault movement, or
  reserve movement was confirmed.

## Canonical V1 preimage order

The client and Rust implementation must hash these byte slices in this exact
order, with no text/base58 conversion after a public key has been decoded:

1. `TCAP_FUNDING_CLAIM_V1` UTF-8 bytes
2. program ID (32 raw bytes)
3. protocol version (`u16`, little-endian)
4. asset registry (32 raw bytes)
5. reserve state (32 raw bytes)
6. token program (32 raw bytes)
7. mint (32 raw bytes)
8. asset registry version (`u32`, little-endian)
9. asset commitment (32 bytes)
10. amount (`u64`, little-endian base units)
11. settlement mode (`u8`)
12. destination commitment (32 bytes)
13. depositor authorization commitment (32 bytes)
14. funding identifier (32 bytes)
15. authorization nonce (`u64`, little-endian)
16. expiry slot (`u64`, little-endian)
17. fee authorization commitment (32 bytes)
18. salt (32 bytes; public V1 instruction data, not a secret on-chain)
19. domain separator (32 bytes)

The result is SHA-256 over the concatenation. The depositor authorization and
domain separator each have their own fixed domain-separated preimages in
`funding.rs`.

## Cause status

**UNKNOWN.** The historical simulation does not log either complete preimage
or the program-recomputed hash, so it cannot prove which field differed.

Plausible but unconfirmed categories are stale program/IDL/client encoding,
field ordering, integer endianness, amount normalization, account/PDA binding,
nonce, expiry, authorization commitment, salt, or domain separator. Do not
select one without a focused reproducible comparison.

## Regression guard

The neutral vector at `test-vectors/tcap-funding-commitment.json` is derived
from fixed public inputs used by the Rust test. It must be verified by Rust,
the JavaScript client, and the manual Test Lab before any Devnet simulation.

## Next investigation

Build a focused V1 test that emits the client preimage hash, byte length, and
field offsets, then compare it against the Rust vector. Once those match, use
the same exact builder against the deployed V1 program in a simulation. If the
deployed handler still rejects, treat the binary/client version relationship as
the leading hypothesis and do not submit.
