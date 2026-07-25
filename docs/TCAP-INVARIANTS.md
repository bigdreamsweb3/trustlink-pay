# TCAP invariants

This document records invariants for the currently implemented TCAP phases.
It is not an audit report.

## Reserve backing

For each approved asset with a canonical initialized vault:

```text
reserve.actual_assets == canonical vault token amount
reserve.actual_assets >= pending funding liabilities
```

Only TCAP's reserve-authority PDA controls the canonical vault. TSN,
Crankers, governance wallets, and external wallets are not vault authorities.

## Funding entry

For `deposit_with_funding_commitment_v1`:

- amount is nonzero and SPL Token transfer uses the canonical mint and program;
- source is owned by the signing public depositor;
- asset, reserve, vault, root, claim, and nonce PDAs use TCAP seed domains;
- commitment, expiry, settlement mode, and exact expected nonce are checked;
- a successful transaction advances the public funding nonce exactly once;
- a failed transaction changes no source balance, vault balance, reserve value,
  pending liability, root, nonce, or claim account;
- a Funding Claim is pending metadata only: it creates no confidential
  ownership, container balance, withdrawal authorization, or TSN state.

## Nonce separation

`FundingAuthorizationNonceV1` is scoped to `(asset entry, public depositor)`.
It is public wallet-funding replay protection only. Future confidential spend
nonces, ownership-state versions, and TSN intent nonces must have independent
state and domains.

## Limits

The current funding root is a hash-chain accumulator, not a membership-proof
tree. The current program is not externally audited, and deposit test assets
must not be treated as production funds.
