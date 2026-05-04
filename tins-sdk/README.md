# TINS SDK

TrustLink Pay SDK for the Transfer Identity Number System.

## Safety Rule

If a developer does not pass a program ID explicitly, the SDK always uses the built-in default TINS program ID.

The SDK does not read an environment variable to silently change the default program ID.

## Current Scope

- TIN generation and validation
- PDA derivation
- Phase 1 instruction builders
- Account decoding
- simple client creation
