# TCAP Funding Claims (Phase 2)

Status: implemented as a development-only funding-entry primitive. It is not
audited, production-ready, or a confidential-payment implementation.

## Three distinct objects

```text
Funding Claim != Confidential Asset Container != TSN Payment Intent
```

- `FundingClaimV1` records that public SPL tokens entered a canonical TCAP
  reserve and are pending one later authorized settlement.
- A future TCAP — Token Control and Authorization Protocol container will represent persistent confidential
  ownership. It is not an SPL token account and is not created by this phase.
- A TSN Payment Intent will authorize a proposed settlement. It is not created
  here and must never deduct ownership by itself.

```text
New tokens:
wallet -> reserve -> Funding Claim -> future container OR future public exit

Existing confidential value:
future container -> future TSN Payment Intent -> future atomic TCAP ownership
rewrite -> future recipient container OR future public exit
```

## `FundingClaimV1` layout

Anchor discriminator: `a19f0ce3c669bbd9`; allocated size: **335 bytes**.
There is no padding in the serialized Anchor/Borsh representation.

| Order | Field | Bytes | Visibility |
| --- | --- | ---: | --- |
| 1 | discriminator | 8 | public on-chain |
| 2 | version, protocol version | 2 + 2 | public on-chain |
| 3 | config, asset entry, reserve state | 32 x 3 | public on-chain |
| 4 | funding identifier, funding commitment | 32 x 2 | public / commitment only |
| 5 | amount | 8 | public by SPL transfer |
| 6 | settlement mode | 1 | public on-chain |
| 7 | destination and depositor-authorization commitments | 32 x 2 | commitment only |
| 8 | authorization nonce, expiry | 8 + 8 | public on-chain |
| 9 | fee commitment, domain separator | 32 x 2 | commitment only |
| 10 | funding-root sequence, pending status, bump | 8 + 1 + 1 | public on-chain |

The direct PDA is public. It intentionally stores no plaintext TIN, recipient
wallet, fee recipient, private salt, proof witness, private key, or decryption
material. `Pending` is a narrow Phase 2 lifecycle marker only; it is not the
final private consumption model. Later settlement must use a commitment and
nullifier design instead of a publicly linkable `spent` flag.

## Related state and PDA domains

| State | Size | PDA seed domain | Payer / close policy |
| --- | ---: | --- | --- |
| `FundingRootV1` | 117 | `tcap:funding-root:v1`, asset entry | depositor pays first initialization; no close instruction exists |
| `FundingClaimV1` | 335 | `tcap:funding-claim:v1`, asset entry, funding identifier | depositor pays; no close or migration instruction exists |
| `FundingAuthorizationNonceV1` | 115 | `tcap:funding-nonce:v1`, asset entry, depositor | depositor pays first initialization; no close or migration instruction exists |

`FundingAuthorizationNonceV1` has discriminator `a41165c7503d6701` and holds
version, asset entry, public depositor, next nonce, last claim PDA, and bump.
It protects public wallet funding only. It must never be reused as a
confidential-spend nonce, ownership-state version, or TSN payment-intent nonce.

`FundingRootV1` has discriminator `9720db8f59cefbc5` and holds version,
protocol version, asset entry, current root, immediate previous root, sequence,
and bump.

## Canonical commitment encoding

The claim is SHA-256 over fixed-width byte slices in exactly this order:

```text
"TCAP_FUNDING_CLAIM_V1" || TCAP program id || protocol version (u16 LE) ||
asset registry || reserve state || token program || mint || registry version
(u32 LE) || asset commitment || amount (u64 LE) || settlement mode (u8) ||
destination commitment || depositor-authorization commitment || funding id ||
funding nonce (u64 LE) || expiry slot (u64 LE) || fee commitment || salt ||
domain separator
```

The authorization commitment separately binds the program ID, protocol version,
public depositor, funding identifier, funding nonce, and expiry. The domain
separator separately binds its version and canonical asset commitment. All
integers are little-endian and every key/commitment is exactly 32 bytes, so
there is no ambiguous concatenation.

## Funding-root accumulator

The current root is an **append-only hash-chain accumulator**, not a Merkle
tree and not a production membership-proof commitment tree.

```text
empty = H("tcap:funding-empty-root:v1" || program || domain || asset-entry)
next  = H("tcap:funding-root-step:v1" || program || domain || previous-root ||
          funding-commitment || sequence-u64-LE)
```

It stores only the current root, immediate previous root, and a `u64` sequence;
it stores no leaves and no unbounded vector. The theoretical sequence capacity
is `u64::MAX` insertions; checked arithmetic rejects overflow. Writes for one
asset contend on the same root account and therefore serialize. Historical
roots are not retained beyond the immediately previous root. A later phase
must replace or extend this with a versioned, bounded historical-root and
Merkle-membership-proof strategy before proof-based settlement is enabled.

## Atomic entry and accounting

`deposit_with_funding_commitment_v1` validates canonical config, registry,
asset, reserve, vault, mint, SPL Token program, source owner, expiry, mode,
domain, commitment, nonce, and reserve-vault equality before the checked SPL
Token CPI. Only after a successful CPI does it write reserve accounting, claim,
root, and nonce, then emit `FundingClaimCreatedV1`.

```text
source token account -> canonical TCAP vault
actual_assets += amount
pending_funding_liabilities += amount
FundingClaimV1 created
funding hash-chain root advanced
FundingAuthorizationNonceV1 advanced once
```

Phase 2 preserves:

```text
reserve.actual_assets == canonical vault token amount
reserve.actual_assets >= pending funding liabilities
```

Legacy `deposit_asset_v1` deposits do not create a Funding Claim and do not
increase pending funding liabilities.

## Explicitly unavailable

This phase cannot settle a claim, create confidential ownership, credit a
container, release tokens, execute a public exit, consume a nullifier, accept
a proof, transfer confidential value, redeem funds, or call TSN.
