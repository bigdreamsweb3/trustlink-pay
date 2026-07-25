# TCAP deposit phase (standalone)

Status: SBF-built and exercised on Solana devnet with a disposable canonical
SPL Token mint. It is not production-ready. Local validator testing remains
blocked on this machine because the available WSL/Docker CPU does not expose
AVX2, which the prebuilt Solana 1.18.26 validator requires.

This phase adds the first fund-moving capability to the independent TCAP
program. It is deliberately limited to a canonical SPL Token deposit into a
TCAP-owned reserve vault. TSN, TIP/TIN, Crankers, proofs, confidential notes,
transfers, and redemption are not involved.

## Flow

1. Governance initializes the asset metadata and reserve state.
2. Governance initializes the canonical reserve vault. The vault is an SPL
   token account whose authority is the TCAP reserve-authority PDA, never a
   wallet, TSN, or Cranker account.
3. Governance explicitly enables deposits only for an `Active` and
   `Approved` asset. The reserve must be unpaused.
4. A depositor signs a checked SPL transfer from their token account to the
   canonical vault. The mint, token program, source owner, vault address,
   vault mint, and reserve authority are all checked on-chain.
5. `actual_assets` is increased with checked arithmetic and a versioned event
   is emitted.

This reserve funding event is not a confidential ownership commitment and does
not create a spendable container balance. A later phase will atomically create
a distinct funding commitment representing a pending authorized claim. That
funding commitment may settle into a confidential ownership commitment, settle
directly to a recipient container, or authorize a public reserve exit.

## Token-program policy

Phase 1 supports only the canonical SPL Token program. Token-2022 is rejected
until transfer fees, hooks, delegates, confidential-transfer extensions, and
other extension behavior have a separate design and test suite.

## Invariants

- Zero-value deposits fail.
- Deposits are disabled by default and remain disabled until governance
  explicitly enables them.
- No instruction in this phase creates a funding commitment, confidential
  ownership commitment, public exit authorization, or commitment-root update.
- No TSN authorization receipt can authorize a deposit.
- The vault PDA is derived under TCAP-specific seeds and cannot be substituted.
- The reserve accounting value is updated only after the token CPI succeeds.
- While this phase has one canonical vault and no exits, the temporary
  invariant is `reserve.actual_assets == vault.amount`.
- This phase is localnet/test-only until an independent audit and adversarial
  test pass are complete. Do not deploy or fund it on a public cluster.

## Account relationship

```text
asset entry ──> reserve state ──> canonical vault
      │              │                │
      └──────> reserve-authority PDA ─┘
```

## Next gates

Before transfers are added, test wrong mint/program, wrong source owner,
wrong vault/PDA, paused asset, duplicate vault initialization, overflow, and
transaction failure atomicity. Transfers will require a separate note,
nullifier, conservation, and replay design. Proof verification and public
redemption remain separate phases and are intentionally unavailable here.

A deposit does not create confidential ownership or issue a private note. The
future lifecycle is explicitly separated:

```text
wallet -> reserve -> funding commitment
                         |
                         +-> confidential ownership commitment
                         +-> authorized public exit
```

The long-term invariant will become weaker when future audited phases add
pending liabilities and exits, but Phase 1 must preserve the equality above.

## Devnet validation evidence

Validation date: 2026-07-21.

- Program: `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x`
- Test mint: `9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK`
- Asset entry: `5eCMtSBo9wvtKuBrtqjy14F6GwfdVdDvgzyhto51n7RP`
- Reserve state: `FjE8mUKDRsVg97F3Ny2sWkegYHsgfcCSGerhgjfzKH1a`
- Reserve authority: `9jh2xT63BEcfbikKywL81zZ8FyLv7NZDaG32BazxpR4d`
- Canonical vault: `A9pNUuLcQbiCKBHgfhEoLwV9GmQz1cfH8u1qUDPPZre8`
- Source account: `563tkShWJf3VKttQTeUEAAdfkUfzX2DrZztQVSHDunPy`
- Successful deposit signature:
  `4t5D2WwDb7brVJB3ST9RoKBcucZnzY6ssvE8oY5C1hXA2HCajrfTnFcdbbePTmJrPuu9qhoXXmKVi84X5XzueYGU`

For the two-decimal test mint, the deposit moved 10,000 base units (100.00 UI
units):

```text
source balance:         100000 -> 90000 base units
canonical vault:             0 -> 10000 base units
reserve.actual_assets:       0 -> 10000 base units
actual_assets == vault: true
```

The first deposit attempt was rejected atomically because reserve
initialization left `reserve_state.paused = true`. The governance deposit-policy
instruction was corrected to set `reserve_state.paused = !enabled`. After SBF
rebuild and devnet upgrade, re-enabling deposits unpaused the reserve and the
same deposit succeeded. The rejected attempt changed neither token balance nor
reserve accounting.

Post-fix validation:

- `cargo fmt --check`: passed
- `cargo check --locked`: passed
- `cargo test --locked`: passed (4 passed, 0 failed)
- `anchor build --no-idl`: passed
- real devnet deposit: passed
- reserve/vault equality invariant: passed

This evidence proves reserve funding only. No funding commitment,
confidential ownership commitment, container balance, proof verification,
withdrawal, redemption, or TSN settlement was created.

## Automated adversarial validation

The reusable devnet suite is:

```text
npm run tcap:deposit:test:devnet
```

Result on 2026-07-21: **24 passed, 0 failed**.

- 6 canonical success, invariant, event, and policy-lifecycle checks.
- 15 expected-rejection and atomicity checks.
- 3 direct unauthorized reserve-withdrawal attacks.

Covered rejection cases include duplicate vault initialization, disabled
deposits, paused/inactive asset state, zero amount, insufficient balance, wrong
mint, wrong token program, Token-2022 substitution, wrong source owner, missing
depositor signature, wrong reserve metadata, substituted canonical vault,
substituted asset/config PDAs, unauthorized governance, and policy redirection
to a fake vault.

Every expected rejection snapshots and compares:

- source token balance;
- canonical vault token balance;
- `reserve.actual_assets`.

It also proves no `AssetDepositAcceptedV1` event was emitted and reruns
`assertReserveInvariant()` after rejection. Direct SPL Token transfer attempts
using an arbitrary wallet, a Cranker-like signer, and a TSN-like signer all
failed because none controls the TCAP reserve-authority PDA.

The successful event test decodes `AssetDepositAcceptedV1` from transaction
logs and validates version, asset entry, reserve state, mint, source, depositor,
vault, amount, and resulting `actual_assets`. The event contains no funding
commitment, confidential ownership, private-balance, proof, or TSN-settlement
claim.

Final state after the manual proof and automated suite:

```text
source:                89594 base units (895.94 UI)
canonical vault:       10406 base units (104.06 UI)
reserve.actual_assets: 10406 base units
actual_assets == vault: true
```

Regression gate after the suite:

- `cargo fmt --check`: passed
- `cargo check --locked`: passed
- `cargo test --locked`: passed (4 passed, 0 failed)
- `anchor build --no-idl`: passed

Devnet cannot safely synthesize a near-`u64::MAX` program-owned reserve account
without a privileged account-injection test runtime, so the overflow branch was
not claimed as integration-tested. Local validator execution remains blocked
by missing AVX2 in the current WSL/Docker CPU environment. Public devnet also
returned transient HTTP 429 responses; Web3 retry handling recovered and the
complete suite passed.

All assets in this test reserve are deliberately locked because no withdrawal
or redemption instruction exists. Production funds must not be deposited.

## Phase 2: funding-claim entry

Phase 2 adds `deposit_with_funding_commitment_v1`. It is a separate entry path
from the legacy reserve-only deposit and is development-only until the stated
test and audit gates are complete.

```text
wallet source -> canonical TCAP reserve -> FundingClaimV1
```

The instruction atomically performs a checked SPL Token transfer, increases
`actual_assets`, increases `pending_liabilities`, creates a pending funding
claim, advances the asset funding hash-chain accumulator, and advances the
depositor-and-asset-scoped public funding nonce exactly once. It does **not**
create a confidential container, confidential ownership, public exit,
withdrawal, proof, nullifier, or TSN payment intent.

For the precise state layout, commitment encoding, accumulator limitations,
and Phase 2 invariants, see [TCAP funding commitments](./TCAP-FUNDING-COMMITMENTS.md)
and [TCAP invariants](./TCAP-INVARIANTS.md).
