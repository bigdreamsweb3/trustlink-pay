# api / handlers

Expose the existing typed HTTP operations, worker authentication, and sanitized validation errors. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [wake_receiver_verification](wake_receiver_verification.py): Wake the verifier after Receiver commit; carries no work payload.
- [private_payment_validation_error](private_payment_validation_error.py): Private payment validation error. See the named validation/return operations in its dedicated implementation.
- [create_settlement_authorization](create_settlement_authorization.py): Reverify the exact stored transition for the current Cranker lease.
- [mempool_status](mempool_status.py): Mempool health check and current epoch info.
- [consume_threshold_access_nonce](consume_threshold_access_nonce.py): Verify wallet + device authorization and atomically consume its nonce.
- [post_intent](post_intent.py): Persist a payment intent at Receiver ingress for asynchronous Node verification.
- [get_network_recent_blockhash](get_network_recent_blockhash.py): Return a sender-signable blockhash from the RPC this Node uses for verification.
- [list_intents](list_intents.py): List intents. See the named validation/return operations in its dedicated implementation.
- [update_intent_status](update_intent_status.py): Update intent status. See the named validation/return operations in its dedicated implementation.
- [list_pending_intent_work](list_pending_intent_work.py): Pending payment-intent submissions for crankers to create on chain.
- [get_metrics](get_metrics.py): Get metrics. See the named validation/return operations in its dedicated implementation.
- [post_cranker_heartbeat](post_cranker_heartbeat.py): Post cranker heartbeat. See the named validation/return operations in its dedicated implementation.
- [get_settlement_networks](get_settlement_networks.py): Return only destination routes ready for Creditcoin settlement.
- [get_network_overview](get_network_overview.py): Get network overview. See the named validation/return operations in its dedicated implementation.
- [get_epoch_status](get_epoch_status.py): Get epoch status. See the named validation/return operations in its dedicated implementation.
- [close_epoch](close_epoch.py): Manually close the current epoch, archive it, and roll unresolved work forward.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
