# Supporting Solana reads

The extracted functions preserve the existing supporting TSNP/TIP PDA helpers, account-header decoding, owner checks, replay/fee reads and public CrankerVault liquidity projection/cache. `solana_rpc` preserves its HTTP/error translation and configured gateway. These helpers remain separately implemented supporting capabilities; they are not replacements for the active native-credit ABI validation functions.

`app.solana` remains the public interface. Many helpers refer to attributes absent from the original supporting `app.config`, including program identifiers, salts, fee/cache values and token metadata. Calling those helpers still requires their established external configuration; extraction does not invent defaults or copy active server state into this older module. The unused import of the nonexistent generic `decode_secret_key` was removed to make the interface importable.

Verification should compile/import this package offline and use explicit configured fixtures for any account-decoding behavior. RPC and liquidity functions require injected HTTP dependencies for offline testing. No live RPC request is issued during import.
