# amounts / units

Resolve registered token metadata/decimals and perform the existing exact base-unit conversion. The package entry point exports the canonical implementations; each authored function has its own source file.

Inputs, outputs, dependency types and raised exceptions are recorded per component in [the contract map](../../core/component_contracts.json). Functions retaining no runtime dependencies are directly reusable. A stateful function accepts its narrow `Dependencies` port; production binds that port through `NodeRuntime`.

## Public components

- [get_supported_token_mints](get_supported_token_mints.py): Get supported token mints. See the named validation/return operations in its dedicated implementation.
- [get_supported_token_metadata](get_supported_token_metadata.py): Get supported token metadata. See the named validation/return operations in its dedicated implementation.
- [resolve_tcap_registered_asset](resolve_tcap_registered_asset.py): Resolve accepted mint identity and decimals from TCAP's canonical entry.
- [parse_optional_float](parse_optional_float.py): Parse optional float. See the named validation/return operations in its dedicated implementation.
- [ui_amount_to_base_units](ui_amount_to_base_units.py): Ui amount to base units. See the named validation/return operations in its dedicated implementation.

## Verification and replacement

Run `python -m testing.run_suite` from the Node directory for the complete offline suite, or select the relevant unittest family under `tests/`. Supply synthetic dependencies to exercise a component directly; use an awaited mock only for an async port. Preserve the signature, errors and transaction/response projection when replacing a component, then verify its direct consumers. Update this README and the contract map when ownership or an interface changes.
