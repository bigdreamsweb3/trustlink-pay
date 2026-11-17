# Remove sealed funding pools from native credit

**Status: EXPERIMENTAL implementation change, 2026-11-08.** The user explicitly retired sealed funding-pool accounts and the requirement to wait for two depositors. This record describes the replacement contract and will record its completed offline checks. Program deployment, funding-root migration, service reload and complete live payment/accounting are separate, unperformed operations in this task.

## Contract and source scope

Native credit uses the existing global funding account at `[tcap:funding-root:v1]` directly. A single genuine positive confirmed deposit is eligible for credit. The private proof retains exact funded-note asset/amount membership, the freshly blinded amount commitment, secret-derived nullifier consumption and recipient-state arithmetic. Pool capture, Mother-attested source census, adaptive release timing and pool-specific work/recovery are removed from ordinary runtime.

The global account retains its PDA and `TcapFundingMerkleRootV1` discriminator, with internal version 2 and protocol version 1. The 6,209-byte layout preserves the prior current-root/count/frontier prefix and adds 128 root/count history records, a write cursor and populated count. A successful deposit appends its new root/count atomically. TCAP/GPRU and off-chain callers accept only a current or retained positive-count root; malformed, fabricated, empty or retired credit contexts fail. History retention is bounded and does not guarantee latency.

Funding history authenticates past deposits, while the latest shared head/nullifier state remains mandatory for spending. Reusing a retained funding root cannot restore a consumed nullifier. The thirteen-input circuit and private amount relation remain unchanged. The readonly funding-account position now requires the canonical global account; the 905-byte TSNP authorization instruction and sixteen outer account positions are preserved.

Complete `TCAP_EPOCH_ACCOUNTING` remains a separate operation over 2–64 accepted credits, considered after 120 slots or at 64 entries. Individual credit does not wait for a second depositor. Aggregate accounting still carries a singleton forward and exposes the complete epoch total. Public deposits, singleton funding membership, timing, recipient/head correlations and Node knowledge remain privacy limits; this removal is not a complete unlinkability result.

## Migration and preserved state

Existing 1,081-byte version-1 global funding accounts require explicit governance-authorized in-place migration after compatible program deployment. The migration validates the old ownership/PDA/discriminator/version/root/frontier, preserves current root/count/frontier, funds any rent shortfall and seeds only the authoritative current root/count into the new history. Ordinary runtime accepts the new layout; old decoding belongs only to the one-time migration.

Existing sealed pool accounts and stored signed attempts are historical state. Source removal neither closes those on-chain accounts nor refunds their rent, and it does not rewrite Receiver/witness data. Historical recovery reports remain in the [November 7 record](EXP-20261107-private-credit-epoch.md); its old pool commands no longer describe current operation. Unique debit/exit, liquidity-provider and epoch/DNA payout/refund instruction families retain their separate source scope.

The task preserves existing IDs, keys, deployment configuration, user services and unrelated local modifications. A source backup was captured before edits. No transaction signing/submission, deployment, service operation or Git commit/push is authorized by this change record.

## Verification record

### Follow-up validation, 2026-11-11

The TCAP program test build completed; 42 of 43 unit tests passed. All new `private_funding` tests passed, including serialization, exact prefix migration, history validation, wrap/eviction and shared SDK/Poseidon vectors. The unrelated existing `funding::tests::canonical_commitment_test_vector_is_stable` failed with a commitment mismatch in unchanged `funding.rs`. GPRU compiled and passed 9 tests; 2 serialized-proof tests were ignored because their explicit fixtures were not supplied. TSNP compiled, but its suite had 1 pass and the unrelated `accept_intent::tests::confidential_fields_are_deterministic_and_bound` failed in unchanged code.

SDK TypeScript build passed. The full SDK suite reported 97 passes and 5 failures; the failures include an unrelated TIN V1 creation fixture rejected for its ElGamal key commitment. The focused funding-note and chain-history suites passed 15 tests. Node's single-deposit witness-preparation test passed; Cranker's global-root tests passed 3 tests; Receiver's coordination test passed; and the setup helper passed all 7 migration/layout tests.

SDK and on-chain/interface catalogs were regenerated. Documentation inventory covers 276 files; the local link/navigation checker reported zero issues; MDX/Mermaid validation compiled 102 pages and parsed 38 diagrams with zero failures. These are offline source checks. No SBF deployment, migration transaction, service reload, or complete live payment/accounting was performed. Existing pool accounts remain on chain until separately authorized cleanup, and old pool-signed work must be reconciled before program migration.

Sources: [funding account](../../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/private_funding.rs), [TCAP credit](../../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs), [GPRU verifier](../../../tsn-protocol/programs/gpru/src/hidden_head.rs), [Node](../../../tsn-protocol/services/tsn-node/server.py), [funding reconstruction](../../../tsn-protocol/services/tsn-node/funding_snapshot_sync.py), [Receiver](../../../tsn-protocol/services/tsn-receiver/lib/work-contract.ts), [Cranker](../../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts) and [SDK credit](../../../tsn-protocol/sdks/tsn-sdk/src/tcap-gpru-credit.ts).
