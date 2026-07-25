# Testing Resumption Checkpoint

Date: 2026-07-23

## Scope and evidence status

| Item | Status | Evidence |
|---|---|---|
| TCAP V2 governed-asset source | SOURCE_PRESENT | `programs/tcap/src/asset_governance.rs` and V2 deposit handlers are present locally. |
| TCAP V2 local compilation | BUILT | `cargo check -p tcap` completed successfully on 2026-07-22. |
| TCAP V2 unit tests | LOCAL_TESTED | `cargo test -p tcap` completed: 22 passed, 0 failed. |
| TCAP V2 SBF artifact | FAILED | `anchor build --program-name tcap` stopped while Cargo 1.80 could not parse `wit-bindgen 0.51.0` because it requires `edition2024`. |
| TCAP V2 Devnet deployment | NOT_TESTED | No V2 artifact has been deployed or invoked on Devnet. |
| Stable-TCAP mint | NOT_TESTED | The reserved mint account was confirmed absent; no mint or faucet state has been created. |
| Faucet program | DEPLOYED | `stable_tcap_faucet` program `E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h` was shown executable on Devnet. |

## Last successfully verified operation

The last verified TCAP runtime operation was entry into the **deployed V1**
`deposit_with_funding_commitment_v1` handler during Devnet transaction
simulation. The deployed program was
`TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x`.

This is **SIMULATED**, not `DEVNET_CONFIRMED`: simulation reached the handler
but no transaction signature was produced and no state reached consensus.

The latest manual-lab runs on 2026-07-22 did not supersede that evidence. They
were correctly blocked at wallet configuration and did not attempt a
simulation or submission.

## Last failed operation

| Field | Value |
|---|---|
| Operation | `deposit_with_funding_commitment_v1` |
| Runtime | Devnet transaction simulation |
| Program | `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` |
| Error | `FundingCommitmentMismatch` |
| Anchor number / hex | `6022` / `0x1786` |
| Source location reported by program | `programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs:162` |
| Submission | No |
| Confirmed signature | None |
| Confirmed token movement | None |
| Confirmed state mutation | None |

Sanitized log excerpt:

```text
Program log: Instruction: DepositWithFundingCommitmentV1
Program log: AnchorError ... FundingCommitmentMismatch (6022)
Program ... failed: custom program error: 0x1786
```

Three System Program CPIs completed inside simulation before the transaction
was rolled back. They are not confirmed on-chain effects.

## Inputs and client metadata

The historical client used the V1 instruction builder in
`tcap-protocol/scripts/devnet-funding-claim.mjs`. It derived the config,
registry, asset, reserve, root, nonce, claim, source token account, vault,
mint, token program, funding identifier, nonce, expiry, destination
commitment, fee commitment, salt, domain separator, authorization commitment,
and expected funding commitment. No keypair material is recorded here.

The V1 local IDL/source can explain client encoding only. It is not evidence
that a later V2 source build is deployed. The simulation log is the evidence
that the historical deployed V1 binary recognized the V1 discriminator.

## Blocked downstream stages

The following are `BLOCKED` until a successful, confirmed funding baseline
exists: funding submission, confirmation, reserve/funding-state verification,
duplicate-claim and stale-nonce tests, settlement, TSN intent execution,
recipient state verification, and privacy-linkage analysis.

## Exact next test

1. Resolve the SBF Cargo toolchain/dependency compatibility failure.
2. Build and review the TCAP V2 artifact and generated IDL.
3. Deploy V2 only after artifact review and a deliberate Devnet approval.
4. Run the fixed shared commitment vector in Rust and JavaScript.
5. Use the manual Test Lab to load a wallet, prepare the accepted asset, build
   the funding instruction, and run **simulation only**.

Do not submit a funding transaction or begin settlement unless the simulation
passes.
