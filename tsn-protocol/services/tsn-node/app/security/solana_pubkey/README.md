# Solana public keys and PDA derivation

`Pubkey` is the existing frozen 32-byte public-key type. Its separately authored methods preserve base58 parsing, byte/string conversion, seed limits, compressed Edwards-Y curve rejection and descending PDA bump search. `_as_program_id` imports the class locally to avoid an initialization cycle between its method files and the class shell.

`app.solana_pubkey` remains the public interface, including the originally exposed `_encode_base58` helper. This package does not depend on native `solders` wheels. `tests/test_solana_pubkey.py` covers known public-key and PDA behavior; wallet-funding and snapshot tests use the same adapter. No chain operation is performed by key construction or derivation.
