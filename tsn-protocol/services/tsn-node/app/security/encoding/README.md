# Base58 encoding

`encode_base58` and `decode_base58` preserve the original generic base58 behavior, including leading zero bytes and the encoder's existing empty-input spelling. Invalid alphabet characters raise `ValueError`. This generic adapter is separate from the Solana public-key adapter's stricter input and empty-value rules.

`app.utils.encoding` remains the public interface. Existing threshold and nonce tests exercise the shared encoding through signed authorization fixtures. Pure-function checks require no configuration, network or signing service.
