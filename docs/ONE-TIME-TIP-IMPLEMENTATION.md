# Blinded-root TIP credit

The current path uses one blinded-root TIP PDA per identity. It is initialized once and mutated in place for each
authorized transition. The TSN authorization wrapper derives a signer PDA from the authorization digest and invokes
TCAP; no successor TIP account is created.

Credit validates the authorization window, previous commitment, sequence, policy commitment, nullifier, token, amount,
and reserve-liability bound, then updates the existing TIP commitment, sequence, and last nullifier. Reserve state holds
the aggregate confidential liability; there is no per-credit liability PDA.

Encrypted balance snapshots are stored off-chain under the current commitment and persisted only after the credit is
confirmed. They contain ciphertext only, so plaintext balances, master seeds, TINs, routes, and wallet destinations are
not written on-chain. This keeps the credit transaction to the existing TIP, asset, reserve, and authorization accounts.

## Devnet paths

The on-ramp path is explicitly separate:

`npm run tcap:one-time:deposit-credit:devnet -- --user A --amount 1000000`

It transfers USDC from the selected wallet into the governed vault, raises the aggregate pending amount, and then
credits the same user's TIP. Its funding signature must be present and its vault delta must equal the credit amount.

The private TIP-to-TIP path is also separate:

`npm run tcap:one-time:debit-credit:devnet -- --from A --to B --amount 1000000`

This path never calls `deposit_asset_v2`, never moves the vault, and never changes aggregate pending. It submits a
debit transaction for A's TIP followed by a distinct credit transaction for B's TIP. The debit transaction contains
no destination TIP, B accounts, token accounts, or vault; the credit transaction contains no A TIP, A token account,
or vault. A persistent per-tip liability account supplies the on-chain spendable bound; it is initialized separately,
not created per transfer. The runner requires pending to be zero before starting and fails closed on a split custody
graph or missing snapshot/liability state.
