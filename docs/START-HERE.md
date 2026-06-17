# TrustLink Pay Start Here

**Version / commit reference:** v1 experimental documentation modernization pass.

## Summary

TrustLink Pay lets people send value to a 10-digit **TINS** identity while **TSN** keeps settlement from becoming a public wallet-to-wallet stalking graph. **SAS** gives confidence about who a TINS identity belongs to without putting private documents on-chain. **Crankers** execute private settlement work, and **OTDT** limits encrypted payload access to authorised Crankers.

If you are new, read this file first. It explains the system without assuming a Solana background.

## The plain-language model

1. A user shares a TINS number, not a raw wallet address.
2. SAS can attach privacy-preserving trust credentials to that TINS identity.
3. TSN accepts sender-authorised settlement work into a private Mempool runtime.
4. Crankers validate encrypted work, front payouts from TSN vault liquidity, and recover funds through verifiable epoch settlement.
5. Epoch settlement uses commitment roots and aggregate math so the public chain sees proofs and totals, not the full payment graph.

## Core primitives

| Primitive | What it does | What stays hidden |
| --- | --- | --- |
| TINS | 10-digit payment identity | Raw wallet address during normal payment UX |
| SAS | Trust credential layer | PII and source documents |
| TSN | Private settlement and vault layer | Direct sender-to-recipient payment graph |
| Crankers | Authorised settlement operators | OTDT-protected payload contents from non-authorised parties |
| OTDT | One-time decryption token | Reusable access to settlement payloads |
| Mempool runtime | Private pre-finality queue | Individual payment graph and decrypted routes |

## Implementation notes

### TypeScript components

- `tsn-sdk` contains TSN client contracts, Mempool runtime clients, Solana instruction builders, Settlement-Token helpers, and private settlement helpers.
- `tsn-cranker-op-daemon` is the reference Cranker runtime. It processes intent work, payout work, recovery work, PrivacyReceivePDA watch events, and v1 epoch challenge races.
- `tsn-cranker-sdk` exposes setup and operator CLI commands for registering Crankers, funding vaults, settling epochs, and manually racing epoch challenges.

### Python components

The Python Cranker daemon remains a first-class design target. The current repo path is TypeScript-first, but Python implementations must follow the same contract: Cranker DNA auth, OTDT-gated decryption, local commitment indexing, minimal challenge verification, and no public PII logging.

## Usage examples

### SDK calls

```ts
await tins.resolveIdentity({ tin: "1234567890" });
await sas.requestAttestation({ tin: "1234567890", type: "merchant" });
await tsn.createPaymentIntent({ tin: "1234567890", amount, commitmentHash });
await tsn.processBatchReimbursement({ epochId, recomputedRootHash, totalToDistribute, crankerCreditSumMod });
```

### Cranker CLI

```bash
npm --prefix tsn-cranker-op-daemon run register
npm --prefix tsn-cranker-op-daemon run crank:start
npm --prefix tsn-cranker-sdk run cranker -- race-epoch 42 <ROOT_HASH_HEX_32_BYTES> <TOTAL> <CHECKSUM>
```

## Security & privacy considerations

- We never display wallet addresses, balances, or phone numbers in cleartext in the product UI.
- Phone numbers live encrypted and are only temporarily visible to the authorised attesting Cranker during WhatsApp verification.
- SAS validates credential commitments instead of storing PII on-chain.
- TSN separates value from metadata: PEAs hold funds, PaymentCommitment PDAs hold commitments.
- The Mempool runtime exposes epoch roots and aggregate math, not raw transaction graphs.

## Testing notes

```bash
./tsn-sdk/node_modules/.bin/tsc --noEmit -p tsn-sdk/tsconfig.json
npm --prefix tsn-sdk run build
npm --prefix tsn-cranker-op-daemon run crank:start
cd tsn/protocol && cargo test --no-default-features
```
