# Shared Receiver test fixture components

These files hold compatible fixture operations reused by multiple extracted test families: reading a boxed clock, capturing an environment entry, returning an already supplied request body, loading a compiled Receiver module and constructing synthetic authenticated request headers. Each file owns one function and receives its fixture inputs explicitly.

Family request adapters keep their distinct argument order and defaults while delegating header/body construction to `authenticated-request-fixture.mjs`. Family [CALLBACKS.json](../native-cranker-lease/CALLBACKS.json) maps and the root [COMPONENTS.json](../COMPONENTS.json) inventory identify callers and ownership. These helpers support offline synthetic tests and do not contain application or protocol behavior.
