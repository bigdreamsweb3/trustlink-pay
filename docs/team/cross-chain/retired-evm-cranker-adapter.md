# Historical EVM submitter boundary

**Status: RETIRED integration, reviewed 2026-11-22.** The former EVM submitter accepted Node-issued authorization and a signature, checked live route/liquidity evidence and submitted one destination-hub transaction. Its runtime adapter and dedicated key-generation path are removed; this page retains the useful separation of responsibilities.

The submitter did not choose payment terms, authorize a source debit, generate an external proof or custody settlement liquidity. Its operator key paid gas separately from the authorization key. Route, executor, exact token, amount, expiry, nonce and commitment equality were independent checks before submission.

A successful hub receipt and message-publication event established publication only. An onward payout required its own destination receipt and recipient-state observation. Source compilation was never evidence of a complete cross-network payment. Current Cranker scope is described in the [transaction map](../../laboratory/cranker-transaction-map.md); planned destinations require the [integration evidence gates](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md).
