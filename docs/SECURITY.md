# Security

This document explains the security model in plain English.

## What Is This?

TrustLink Pay combines identity, settlement, operators, liquidity, and epoch accounting.

Security depends on clear boundaries between those parts.

## Main Security Goals

1. Do not expose wallet addresses as the normal payment identity.
2. Do not publish private social identity data.
3. Do not expose the full payment graph when a normal user pays.
4. Make settlement work verifiable.
5. Prevent replay and duplicate settlement.
6. Hold Crankers accountable for bad work.
7. Keep epoch accounting isolated.

## Privacy Model

TrustLink Pay improves privacy through separation.

The sender-side funding step and recipient-side payout step are not the same public transfer. Commitments and epoch roots help prove work without publishing the full private route.

This is not the same as complete anonymity.

Solana remains public. Program activity remains visible. The goal is to avoid exposing the most obvious payment graph.

## Identity Security

TINs are public payment identities.

Social identities should be encrypted. Sensitive fields should require explicit user authorization before decryption.

The app must show which identity source it is displaying:

- Transfer Identity registry name
- TrustLink display name
- WhatsApp or social profile name
- verification platform result

## Cranker Security

Crankers must validate work before executing it.

They should check:

- signatures
- nonce
- expiry
- amount
- token
- recipient route
- epoch
- commitment hash
- duplicate work status

Bad or repeated failures should be quarantined, not retried endlessly.

## Epoch Security

Epochs isolate risk.

Each epoch has its own reservoir and aggregate root. Public challenge data should include only what Crankers need to compete and verify work.

## Operational Security

Operators should protect:

- Cranker keys
- verifier keys
- permit signing keys
- mempool API keys
- RPC credentials
- deployment authority keys

Never paste private keys into public chats, logs, screenshots, or dashboards.

## Important Limits

No documentation should promise impossible privacy.

The correct claim is:

```text
TrustLink Pay reduces direct payment graph exposure through separated settlement and commitments.
```

The incorrect claim is:

```text
TrustLink Pay makes payments invisible.
```

## Related Docs

- [Architecture](./ARCHITECTURE.md)
- [TSN Commitment Settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)

## PRU Security Hardening Layer (2026-06-26)

### Summary

We treat PRU spend authority as a five-layer TrustLink-only control plane. The TIN Master Seed is CSPRNG material generated inside the TSN mempool and Cranker layer, encrypted for storage, and never derived from the main wallet key. PRU signing keys are re-derived inside the SDK only long enough to sign a TSN intent, then their secret bytes are overwritten. Every intent is bound to the real TSN vault domain, scoped to one amount and destination hash, and rejected by Crankers if the TIN, nonce, expiry, active guard, or main-wallet spend proof fails.

### Implementation notes

- TypeScript SDK: `generateTinMasterSeed()` uses `crypto.getRandomValues()` when available and falls back to Node CSPRNG for tests and daemon tooling. `encryptTinMasterSeed()` stores the random seed with AES-256-GCM using `SHA256(main_wallet_signature + PIN)` as wrapping key material; this key encrypts the seed but never creates it.
- TypeScript SDK: `createScopedPruIntent()` computes `tsn_domain = SHA256("TSN_TRUSTLINK_INTENT_V1" + tsn_vault_pubkey)`, derives a PRU signing key from the random TIN Master Seed for the chosen PRU index, signs the canonical intent message, and wipes `secretKey` immediately in a `finally` block.
- Python / Cranker parity: Cranker daemons must mirror `validatePruSpendForCranker()` order exactly before any TSN settlement execution: domain, main-wallet spend proof, TIN match, intent replay, nonce replay, expiry, active guard.
- On-chain protocol: `PruSpendGuard` stores `tin`, `pru_index`, `spend_auth_hash`, `nonce_bitmask`, `active`, and `bump` at the PDA seeds `["pru_spend_guard", tin.to_le_bytes(), pru_index.to_le_bytes()]`.

### Usage examples

```ts
import {
  createScopedPruIntent,
  encryptTinMasterSeed,
  generateTinMasterSeed,
} from "@trustlink/tsn-sdk/pru";

const tinMasterSeed = generateTinMasterSeed();
const encrypted = await encryptTinMasterSeed({
  tinMasterSeed,
  mainWalletSignature: ownerSignedChallenge,
  pin,
});

const intent = createScopedPruIntent({
  tinMasterSeed,
  tsnVaultPubkey: realTrustLinkTsnVault,
  tin: "1234567890",
  pruIndex: 7,
  amount: 1250000n,
  recipientTin: "5555555555",
});
```

```bash
tsn-cranker validate-pru-intent --vault <REAL_TSN_VAULT> --intent <INTENT_JSON> --identity-binding <PDA> --pru-spend-guard <PDA>
```

### Security & privacy considerations

- Hidden: TIN Master Seed, PRU private keys, recipient TIN preimage, raw spend key material, and decrypted seed bytes after use.
- Exposed: the scoped intent fields required for Cranker verification, the TSN vault domain hash, the PRU index, and replay-control metadata.
- Fake dApp intents fail at the first Cranker check because a fake vault computes a different `tsn_domain`.
- Captured signatures cannot change amount, recipient, TIN, PRU index, nonce, expiry, or intent id because each field is inside the signed canonical message.
- Runtime key extraction has a narrow window: the SDK does not cache PRU private keys and overwrites the secret key after signing.

### Testing notes

Run `npm --prefix tsn-protocol/tsn-sdk test` to exercise CSPRNG seed generation, TSN domain binding, main-wallet proof gating, TIN mismatch rejection, intent replay rejection, nonce replay rejection, 60-second expiry, and inactive PRU rejection.
