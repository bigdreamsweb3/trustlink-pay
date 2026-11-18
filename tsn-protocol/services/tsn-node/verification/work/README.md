# verification / work

## Staged funding contract

`prepare_receiver_funding` accepts Receiver `AUTHORIZED_FUNDING` work in `AUTHORIZATION`, verifies its immutable message and work-bound nonce, and reads advisory deposit readiness before a wallet transaction exists. It returns `TSN_FUNDING_AUTHORIZATION_READY` with bounded expiry/commitment and private preparation. The worker signs that evidence as `FUNDING_READY`, with an empty execution projection. Receiver encrypts the preparation and keeps the original readiness attestation/lease context.

`funding_authorization_preflight` reconstructs the original evidence commitment and checks its signature, work binding and expiry before exposing accounts to the owner. `verify_completed_funding` accepts only `SIGNED_DEPOSIT`, reuses that signed preparation, checks canonical authorization expiry, validates the exact sender/amount/note/accounts and simulates unchanged bytes. Final verification produces executable funding evidence. RPC unavailability retries under the existing lease/processing limit; validation failures reject work. The staged, wallet-funding and nonce-store tests cover these boundaries. Phase-less historical funding cannot enter this replacement runtime; confirmed receipt reconstruction retains its separate read contract.

Dispatch Receiver work kinds to their verification components and sanitize rejection evidence. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [_verify_receiver_work](verify_receiver_work.py): Verify receiver work. See the named validation/return operations in its dedicated implementation.
- [_verification_rejection_reason](verification_rejection_reason.py): Verification rejection reason. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
