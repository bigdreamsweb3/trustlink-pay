# Node lease renewal test components

The `../../node-lease-renewal.test.mjs` discovery facade retains the original renewal scenario. The case checks generation continuity and preservation of signed decisions after the original lease expires. The attestation field serializer, reassignment transaction and request adapter have separate implementation files; shared helpers capture environment entries, read boxed time, load compiled modules and construct synthetic authenticated requests.

[CALLBACKS.json](CALLBACKS.json) maps the extracted callbacks. The request adapter retains the original argument order and synthetic Node credential default while sharing header/body construction. Each implementation owns one function. The case passed in the 27-check offline regression run against isolated temporary fixtures; it does not verify a running Node or hosted Receiver.
