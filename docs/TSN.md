
## TSN PRU intent validation order (2026-06-26)

### Summary

TSN Crankers must reject a PRU-backed settlement before touching funds unless all seven security gates pass. This makes a PRU signature useful only inside the real TrustLink TSN vault, for one TIN, one PRU index, one destination hash, one amount, one nonce, and one short expiry window.

### Implementation notes

Cranker validation order is fixed:

1. `tsn_domain == SHA256("TSN_TRUSTLINK_INTENT_V1" + tsn_vault_pubkey)` rejects fake TSN vaults.
2. Verify the spend proof against `identity_binding.main_wallet`, the on-chain TINS owner wallet.
3. Require `spend_proof.message.tin == pru_spend_guard.tin` to reject cross-TIN settlement attempts.
4. Require `intent_id` to be unseen in Cranker replay state.
5. Require the PRU nonce bit to be unset in `pru_spend_guard.nonce_bitmask`.
6. Require `expiry > Clock::get().unix_timestamp`; SDK intents default to a 60-second window.
7. Require `pru_spend_guard.active == true` so a deactivated PRU cannot spend.

### Usage examples

```ts
import { validatePruSpendForCranker } from "@trustlink/tsn-sdk/payment-authorization-server";

validatePruSpendForCranker({
  intent,
  tsnVaultPubkey: realTrustLinkTsnVault,
  mainWalletSpendProofVerified,
  identityBindingMainWallet,
  pruSpendGuard,
  seenIntentIds,
});
```

```bash
tsn-cranker run --require-pru-spend-guard --reject-expired-pru-intents --vault <REAL_TSN_VAULT>
```

### Security & privacy considerations

Crankers never need custody. They verify domain binding, owner proof, replay state, and guard activity before executing TSN settlement. The destination is represented by `SHA256(recipient_tin)`, keeping the recipient TIN preimage out of public Cranker logs.

### Testing notes

Run `npm --prefix tsn-protocol/tsn-sdk test`. The PRU security test suite covers all seven expected-fail attack scenarios: malicious signature harvesting, fake TSN intent, captured PRU signature replay, wallet-adapter PRU access absence, nonce replay, cross-TIN spend, and inactive/expired runtime attempts.

## Normal Payment Fee Distribution

### Summary

Every normal TSN payment settlement separates the recipient payout from the recipient-side protocol fee. The recipient PRU receives the net payout amount. The fee is split during settlement so it does not remain silently inside the Cranker vault.

### Split

The normal payment fee split is:

- 85% stays in the LP Cranker vault and is recorded as LP rewards.
- 8% transfers to the settlement Cranker operator token account.
- 5% transfers to the TSN protocol treasury token account.
- 2% transfers to the TSN reserve pool token account.

The LP share remains in the Cranker vault because that vault is the active liquidity vault for the payout. The non-LP shares are transferred out of the vault in the same payout transaction.

### Settlement behavior

For a payment amount `A` and recipient fee `F`:

```text
Recipient PRU receives: A - F
LP vault reward:        F * 85%
Cranker operator:       F * 8%
Protocol treasury:      F * 5%
Reserve pool:           F * 2%
```

Integer division is deterministic in base units. Any rounding remainder stays with the LP vault share because the LP share is calculated as the fee remainder after operator, treasury, and reserve transfers.

### Verification

A successful private PRU payout transaction includes:

1. Cranker vault to recipient PRU token account for the net payout.
2. Cranker vault to operator token account for the 8% Cranker share.
3. Cranker vault to protocol treasury token account for the 5% treasury share.
4. Cranker vault to reserve pool token account for the 2% reserve share.

The 85% LP share remains in the Cranker vault and is accounted as LP rewards.
