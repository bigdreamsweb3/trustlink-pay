
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

Run `npm --prefix tsn-sdk test`. The PRU security test suite covers all seven expected-fail attack scenarios: malicious signature harvesting, fake TSN intent, captured PRU signature replay, wallet-adapter PRU access absence, nonce replay, cross-TIN spend, and inactive/expired runtime attempts.
