# TCAP deposit phase (standalone)

Status: implementation scaffolded; Windows-side compilation is currently
blocked by the local Cargo cache/network environment. It is not production
ready and has not been localnet-tested in this pass.

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
