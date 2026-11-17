# Creditcoin payout authorization

`CreditcoinPayoutAuthorization` preserves its exact public hash/address fields, destination allowlist, scalar validation and Cranker payload spelling. `to_cranker_payload` requires the caller's authorization signature and transports the existing destination-network context. This model does not generate a proof, anchor a transaction, sign for a wallet or establish successful Creditcoin execution.

`app.services.creditcoin_settlement` remains the public interface, including `CreditcoinNetwork`. Hash/address helper files are independent functions, and model methods are imported into its frozen dataclass shell. Verification should construct models from public local fixtures and compare exact payloads without invoking a Cranker.
