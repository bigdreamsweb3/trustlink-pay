# Security Model

## Core Security Properties

### Master Seed Protection
- 32-byte CSPRNG value encrypted with AES-256-GCM
- Encryption uses user's main wallet signature + PIN
- Decrypted **only** on the user's authorized device
- Never sent to backend, Cranker, or any server

### Local Key Derivation
- PRU child keys derived locally using SHA-256
- Formula: `TRUSTLINK_PRU_KEY_V1 | masterSeedHex | tinId | index`
- Keys never leave the device

### Scoped Spend Signatures
- Bound to specific PRU index
- Bound to exact amount
- Bound to unique nonce
- Bound to expiration timestamp
- Domain-separated intent

## Architecture Constraints

### Device-Only Operations
- Master seed decryption
- PRU child key derivation
- Scoped spend authorization signing

### Server-Only Operations
- Authorization verification
- Transaction reservation
- State updates (after settlement)

### Cranker-Only Operations
- Fee payment
- Transaction submission
- No access to user key material

## Known Security Issues

### Server-Side Decryption (DEPRECATED)
- `_decrypt_tin_master_seed_payload`: Decrypts master seed server-side
- `_derive_pru_secret_key_base64`: Derives PRU keys server-side
- These functions are marked DEPRECATED and will be removed
- They currently power the production PRU spend permit flow

### Cranker Key Access (DEPRECATED)
- Cranker receives `secretKeyBase64` in work items
- Uses `Keypair.fromSecretKey` for user PRU signing
- This is marked DEPRECATED and will be removed
- Launch architecture uses scoped spend signatures from user device

## Deprecated Features

- `pru_private_commitment_v1`: Legacy authorization format
- `mixed_pru_wallet_v1`: Legacy mixed funding mode
- `settlementEscrowSecretKeyBase64`: Escrow key passed to Cranker
- `tinBalancesToSelections`: Frontend-owned PRU selection

## Security Best Practices

- Never commit secrets or keys to repository
- Use environment variables for sensitive configuration
- Rotate keys regularly
- Monitor for unauthorized access
- Validate all inputs on-chain
