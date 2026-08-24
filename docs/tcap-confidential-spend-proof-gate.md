# TCAP (Transfer Confidential Asset Protocol) confidential debit/exit proof gate

This specification defines the future spend statement without enabling a live
debit or exit. `debit_tcap_balance_v1` and `exit_tcap_liquidity_v1` currently
validate structural fields and then return `ProofSystemNotEnabled`.

## Debit conservation

For a private witness `(old_balance, debit_amount, new_balance)`:

```text
old_balance >= debit_amount
new_balance = old_balance - debit_amount
new_balance >= 0
stable_units = convert(native_units, registered rate_version)
```

The proof must open the predecessor commitment, bind the successor to
`new_balance`, the predecessor commitment, and `sequence + 1`, and prove a
one-time nullifier. The policy commitment, registered rate version, expiry
window, and layer-zero conditions must also be satisfied. A GPRU signature is
not a spend proof.

## Exit conservation and destination binding

Exit uses the same equations, plus:

```text
destination_binding = bind(protocol_domain, token_id, destination, amount)
actual_assets >= reserved_liabilities + requested_exit_liability
exit_nullifier is unused and the exit receipt is unconsumed
```

The liquidity pool is protocol/governance controlled and is not Cranker
custody. The skeleton account is intentionally not mutated by the disabled
instruction.

## Required future proof statement

The verifier must establish knowledge of the predecessor commitment preimage,
correct native/stable-unit arithmetic under the registered rate version,
sufficient balance, the successor commitment, correct nullifier derivation,
policy satisfaction, and no value creation. Exit proofs additionally bind the
exact public destination and prove the pool invariant.

No hash-only, GPRU-only, or placeholder-payload path may mutate a tip, balance,
liquidity pool, token account, or exit receipt.
