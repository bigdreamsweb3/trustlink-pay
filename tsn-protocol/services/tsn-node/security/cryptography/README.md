# Native GPRU cryptography

This package owns BabyJubjub point arithmetic, one-time balance delta encryption, native Poseidon, DNA/ElGamal key derivation and owner-record shared-point derivation. Every implementation module defines one function. `gpru_contract.py` contains the existing field, subgroup, curve/base-point constants and the protocol source root; `_load_library` retains its single cached native library instance.

`GPRU_NATIVE_LIBRARY_PATH` and its absolute-path validation retain their existing contract. The unconfigured library path still selects `programs/gpru/target/node-native/release` relative to the protocol checkout, even though the Python implementations now live deeper in the package. Native export checks, input validation, randomness and error strings are preserved. Importing the package does not build or load the native library; a cryptographic operation selects it when needed.

Public functions are `encrypt_balance_blinding_delta_v1`, `poseidon_v1`, `derive_node_dna_elgamal_key` and `derive_node_record_shared_point`, each imported from its corresponding module. The named private helpers remain available through `gpru_crypto.py` and their implementation modules. Dependencies are Python standard libraries and the configured native GPRU ABI; no server state or recipient secrets are introduced.
