# DBrix owner action records and Ledger Memos

This package validates the existing encrypted owner balance-action record, encrypts it with Secretbox and binds the resulting Ledger Memo to its public successor/action fields. It preserves the exact record/envelope tags, JSON sorting and separators, conditional deflate compression, nonce generation, Base64/slot encoding, SHA-256 domains, BN254 reduction and thirteen-input Memo validation. Supported credit, debit and exit record kinds remain distinct accepted values.

`encrypt_transaction_record_v1` constructs the owner-readable record and bound Memo; `validate_transaction_record_v1` validates the existing transition envelope/encoding/public bindings. `_validate_balance_action_record_v1`, `_ledger_memo_payload_v1` and `_sha256_to_bn254_scalar_hex` remain separately named implementation helpers. Validation does not independently open the owner ciphertext or establish a chain settlement.

Import the functions from their matching `transactions.records` modules. `dbrix_transaction_record.py` retains the public and private export names from the same implementations. Dependencies are PyNaCl, Python encoding/compression libraries and the existing private amount commitment function; server state, RPC and service lifecycle remain caller responsibilities.
