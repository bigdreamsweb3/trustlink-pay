# Native Cranker lease test components

The `../../native-cranker-lease.test.mjs` discovery facade registers the original lease scenario. Its named case preserves both authorization passes, lease ownership and expiry, and the signed-work immutability assertions. Synthetic time is supplied through the shared boxed-clock reader; compiled fixture modules load through the shared module loader.

[CALLBACKS.json](CALLBACKS.json) records callback ownership and reuse. Each authored implementation occupies one file, with captured bindings passed explicitly. Verification uses an isolated compiled Receiver fixture and temporary JSON storage; the case passed in the 27-check offline regression run and does not establish live service or chain behavior.
