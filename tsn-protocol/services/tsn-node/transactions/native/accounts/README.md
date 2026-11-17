# transactions / native / accounts

Derive the existing TSNP, epoch, Cranker, and associated-token addresses from their required seeds. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_program_pubkey](get_program_pubkey.py): Get program pubkey. See the named validation/return operations in its dedicated implementation.
- [find_tsn_pda](find_tsn_pda.py): Find tsn pda. See the named validation/return operations in its dedicated implementation.
- [get_mother_escrow_pda](get_mother_escrow_pda.py): Get mother escrow pda. See the named validation/return operations in its dedicated implementation.
- [get_epoch_treasury_pda](get_epoch_treasury_pda.py): Get epoch treasury pda. See the named validation/return operations in its dedicated implementation.
- [get_epoch_ledger_pda](get_epoch_ledger_pda.py): Get epoch ledger pda. See the named validation/return operations in its dedicated implementation.
- [get_epoch_claim_slot_pda](get_epoch_claim_slot_pda.py): Get epoch claim slot pda. See the named validation/return operations in its dedicated implementation.
- [get_settlement_dna_pda](get_settlement_dna_pda.py): Derive the Mother-rooted, one-time settlement DNA account.
- [derive_claim_slot](derive_claim_slot.py): Derive claim slot. See the named validation/return operations in its dedicated implementation.
- [get_cranker_pda](get_cranker_pda.py): Get cranker pda. See the named validation/return operations in its dedicated implementation.
- [get_cranker_vault_pda](get_cranker_vault_pda.py): Get cranker vault pda. See the named validation/return operations in its dedicated implementation.
- [get_cranker_vault_token_pda](get_cranker_vault_token_pda.py): Get cranker vault token pda. See the named validation/return operations in its dedicated implementation.
- [get_associated_token_address](get_associated_token_address.py): Get associated token address. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
