# TrustLink Pay Developer Guide

> **Update reference:** this guide includes the TSN runtime additions introduced at commit `dfa0735` (`TSN: Add settlement-token/OTDT, claim-lease & recovery runtime, and Python cranker daemon`).

## Summary

TrustLink Pay is a TIN-first Solana payment ecosystem. Developers should think about the system as four coordinated layers:

- **TINS (Transfer Identity Number System):** portable 10-digit payment identities and wallet abstraction.
- **SAS (Solana Attestation Service):** recipient and merchant verification through attestations without storing sensitive PII on-chain.
- **TSN (Transfer Settlement Network):** private, verifiable settlement through payment intents, Cranker verification, vaults, proofs, and recovery.
- **Crankers:** decentralized operators that verify TSN intents, perform settlement work, submit proofs, and keep liquidity healthy.

WhatsApp is used only for social confidence verification, notifications, opt-in, and recovery communication. It is not the protocol identity. The protocol identity is the TIN.

---

## Integration principles

### Keep TINS, TSN, and SAS separated

| Layer | Developer responsibility |
| --- | --- |
| TINS | Resolve or display the 10-digit payment identity. |
| SAS | Validate recipient/merchant trust attestations without storing PII in settlement state. |
| TSN | Create payment intents, monitor settlement state, and use SDK/mempool operations. |
| Cranker | Run verification, leases, settlement proofing, and recovery operations. |

Do not collapse these layers into one application-specific flow. A payment may use all layers, but each layer has a distinct purpose.

### Use SDK-owned operations

Application code should not manually recreate protocol internals. Prefer SDK calls and protocol-owned helpers.

Good examples:

```ts
await tins.resolveIdentity(recipientTin);
await tsn.postIntent(intentRequest);
await tsn.submitIntentVerification(intentId, crankerPubkey);
await tsn.acquireClaimLease(intentId, crankerPubkey);
```

Avoid:

```ts
// Avoid hand-rolling PDA, settlement-token, or lease logic in product code.
const pda = deriveSomeInternalAddressByCopyingProtocolSeeds();
```

---

## Payment identity flow

A developer-facing TrustLink Pay send flow should read as:

```text
recipient TIN
  -> TINS identity resolution
  -> optional SAS trust check
  -> TSN payment intent
  -> Cranker settlement and proof
```

Do not present raw wallet addresses as the normal receive identity. Wallets may exist behind TINS and TSN routing, but the user-facing identity is the TIN.

---

## TSN payment-intent flow

A TSN intent now includes an encrypted settlement token and registry commitment.

```text
create intent
  -> generate encrypted settlement token
  -> hash decrypted token into commitment hash
  -> store encrypted token + commitment hash in registry
  -> leave sender wallet, recipient wallet, balances, and plaintext out of registry
```

Example using the local JSON mempool runtime:

```ts
import { JsonFileTsnMempool } from "@trustlink/tsn-sdk/mempool";
import { buildCreateIntentRequest } from "@trustlink/tsn-sdk/contracts";

const tsn = new JsonFileTsnMempool();

const intent = await tsn.postIntent(
  buildCreateIntentRequest({
    paymentId,
    recipientHash,
    tokenMintAddress,
    amount,
    source: "trustlink-pay",
  }),
);
```

If `encryptedSettlementToken` and `settlementTokenCommitmentHash` are not supplied, the runtime generates them before storing the intent.

---

## Commitment registry rules

The commitment registry is the single source of truth for recoverability and settlement verification.

### Allowed registry data

- transfer ID
- encrypted settlement token
- commitment hash
- timestamp
- epoch
- recoverable flag
- intent verifier pubkey
- settlement proof reference
- settlement commitment hash
- OTDT hash
- recovery proof reference

### Forbidden registry data

- sender wallet
- recipient main wallet
- decrypted token
- phone number
- WhatsApp identifier
- wallet balances
- SAS PII or raw attestation contents

If a feature requires private routing information, keep it outside the registry and only expose the minimum proof material required for TSN auditability.

---

## Intent work, claim points, and claim leases

Crankers must perform intent work before settlement work.

```text
pending intent
  -> Cranker validates structure/signatures/routing/epoch
  -> intent becomes escrowed
  -> Cranker earns claim point
  -> claim point can be spent on a claim lease
```

A claim lease is required before settlement. A Cranker cannot settle a claim without a lease.

```ts
await tsn.submitIntentVerification(intent.id, crankerPubkey);
const lease = await tsn.acquireClaimLease(intent.id, crankerPubkey);
```

The lease writes an OTDT hash into the commitment registry. If the registry already has `recoverable=true` or an `otdtHash`, duplicate settlement must stop.

---

## OTDT and settlement-token decryption

OTDT means **One-Time Decryption Token**. It is the control that gates settlement-token decryption.

Runtime sequence:

```text
check registry for existing recoverable proof
check registry for existing OTDT hash
spend claim point
create claim lease
write OTDT hash
decrypt settlement token in Cranker memory
submit proof
mark registry recoverable
```

The decrypted token is never stored in the registry or docs examples. It should remain in operator memory for the shortest possible time.

---

## Recovery and liquidity operations

Once settlement proof is accepted, TSN marks the registry entry recoverable and creates recovery work.

Recovery jobs contain:

- transfer ID
- epoch
- recoverable amount
- vault source
- recovery reward
- priority score
- status

Smart recovery prioritizes jobs using active liquidity, pending intents, vault balance, settlement velocity, and liquidity consumption rate.

```ts
const jobs = await tsn.listRecoveryQueue({ status: "open" });
await tsn.completeRecoveryJob(jobs[0].id, crankerPubkey, recoveryProofTx);
```

---

## Python and TypeScript component map

| Component | Language | Purpose |
| --- | --- | --- |
| `tsn-sdk/src/settlement-token.ts` | TypeScript | Settlement-token encryption/decryption, commitments, Cranker DNA hash, OTDT helper. |
| `tsn-sdk/src/mempool.ts` | TypeScript | JSON mempool, registry, claim points, claim leases, recovery queue, liquidity metrics. |
| `tsn-sdk/src/server.ts` | TypeScript | HTTP API for mempool operations. |
| `tsn-cranker-op-daemon/scripts/cranker_daemon.py` | Python | Autonomous queue scheduler for intent work, settlement work, and recovery. |

---

## Local development examples

### Build TSN SDK

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> npm --prefix tsn-sdk run build
```

### Run backend typecheck

```bash
npm --prefix backend run typecheck
```

### Compile Python daemon

```bash
python -m py_compile tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

### Run Python Cranker once

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> \
TSN_CRANKER_ONCE=true \
python tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

---

## Security and privacy checklist

- [ ] Use TINS as the payment identity.
- [ ] Validate SAS attestations without storing sensitive PII in TSN state.
- [ ] Use WhatsApp only for social confidence verification and notifications.
- [ ] Never store sender wallet in the commitment registry.
- [ ] Never store recipient wallet in the commitment registry.
- [ ] Never store decrypted settlement tokens in the commitment registry.
- [ ] Keep `TSN_SETTLEMENT_TOKEN_MASTER_KEY` in deployment secrets.
- [ ] Require claim leases before settlement work.
- [ ] Require OTDT hash before settlement-token decryption.
- [ ] Derive recoverability from registry proof state, not separate claimed flags.
- [ ] Treat confidential transfer / TF-token flows as conceptual until separately tested and shipped.

---

## Testing notes

Minimum checks for TSN runtime work:

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> npm --prefix tsn-sdk run build
npm --prefix backend run typecheck
python -m py_compile tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

Recommended integration checks:

1. Create TSN intent.
2. Confirm encrypted settlement token and commitment hash exist.
3. Confirm commitment registry excludes wallets, phone numbers, balances, and plaintext.
4. Verify intent and confirm claim points increase.
5. Acquire claim lease and confirm OTDT hash appears.
6. Submit settlement proof and confirm `recoverable=true`.
7. Confirm recovery queue entry is created.
8. Complete recovery and confirm liquidity metrics update.

---

## Related documents

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PROTOCOL.md](./PROTOCOL.md)
- [TINS.md](./TINS.md)
- [CRANKER.md](./CRANKER.md)
- [LIQUIDITY.md](./LIQUIDITY.md)
- [OTDT-SMART-RECOVERY.md](./OTDT-SMART-RECOVERY.md)
