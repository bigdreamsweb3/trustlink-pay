# Work-contract test components

The discoverable `../../work-contract.test.mjs` facade retains thirteen original case names and adds the two clock/identity-port and compact/legacy-record checks. Thirty-three named implementation files cover thirty-four original test, fixture and assertion-callback bodies: the missing and malformed funded-note assertions share `validate-funding-note-fixture.mjs`. Enclosing fixtures pass local bindings explicitly; components do not import the discovery facade to find mutable test state.

[COMPONENTS.json](COMPONENTS.json) maps the implementation files and captured inputs. Existing assertions, synthetic account/signature fixtures and error expectations are preserved. All fifteen cases pass after extraction; this is offline contract verification rather than a hosted storage, service-startup or live-chain result.
