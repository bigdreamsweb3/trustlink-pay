# Cranker Operators for TrustLink Pay

> **Update reference:** this guide reflects the TSN runtime update introduced at commit `dfa0735` (`TSN: Add settlement-token/OTDT, claim-lease & recovery runtime, and Python cranker daemon`).

## Summary

Crankers are the execution operators of the **Transfer Settlement Network (TSN)**. They verify payment intents, earn claim points, acquire claim leases, decrypt settlement tokens through One-Time Decryption Token (OTDT) controls, execute settlement work, submit proofs, and participate in smart recovery.

Crankers do not replace the identity or trust layers:

- **TINS** remains the payment identity layer.
- **SAS** remains the verification and attestation layer.
- **TSN** remains the private settlement layer.
- **WhatsApp** is used only for social confidence verification and notifications.

Crankers keep the network operational by doing useful work before they are allowed to perform settlement work. This protects liquidity, prevents duplicate claims, and keeps recoverability derived from the TSN commitment registry.

---

## Cranker responsibilities

| Responsibility | Description |
| --- | --- |
| Monitor intent queue | Watch TSN mempool intent work. |
| Validate intent work | Check payment intent structure, signatures where supplied, encrypted settlement-token commitment, routing, and epoch. |
| Earn claim points | Intent verification earns points that unlock later claim work. |
| Acquire claim leases | A claim lease spends claim points and grants temporary settlement execution rights. |
| Enforce OTDT | OTDT hash is written before settlement-token decryption to block duplicate claims. |
| Execute settlement | Decrypt settlement token in memory, execute settlement/payout work, and generate a settlement commitment hash. |
| Submit proof | Record proof so the commitment registry can mark the transfer recoverable. |
| Run recovery | Complete recovery jobs that return recoverable funds to liquidity and earn recovery rewards. |

---

## End-to-end operator flow

```text
1. TINS resolves recipient identity.
2. TSN creates a payment intent and encrypted settlement-token commitment.
3. Cranker verifies intent work.
4. Cranker receives claim points.
5. Claim points unlock a claim lease.
6. Claim lease issues an OTDT hash.
7. Cranker decrypts the settlement token in memory.
8. Cranker executes settlement work and submits proof.
9. Commitment registry marks the transfer recoverable.
10. Recovery queue receives open work.
11. Smart recovery prioritizes jobs based on liquidity pressure.
12. Eligible Cranker completes recovery and returns liquidity.
```

---

## Claim points and claim leases

Crankers must complete intent work before they can perform settlement work.

```text
intent verification -> +1 claim point
claim lease         -> -1 available claim point
```

A claim lease is a temporary right to settle one transfer. It exists so the network can prevent a Cranker from repeatedly attempting the same settlement or racing a duplicate proof after a transfer is already recoverable.

A claim lease is refused when:

- the commitment registry entry does not exist;
- the transfer is already recoverable;
- an OTDT hash already exists;
- the Cranker has no available claim points.

---

## OTDT enforcement

OTDT means **One-Time Decryption Token**. In this implementation, the runtime stores an OTDT hash in the commitment registry before settlement-token decryption. The actual token secret is not written to the registry.

The OTDT sequence is:

```text
check registry recoverable=false
check registry otdtHash is empty
spend claim point
create claim lease
create OTDT hash
write otdtHash to registry
decrypt settlement token in Cranker memory
submit settlement proof with matching OTDT hash
```

If the registry already has `recoverable=true` or `otdtHash`, the Cranker must not decrypt or settle the transfer again.

---

## Commitment registry privacy boundary

The commitment registry is public settlement-verification state. It stores transfer commitments, not private settlement data.

### The registry stores

- transfer ID
- encrypted settlement token
- commitment hash of the decrypted token
- timestamp
- epoch
- recoverable flag
- intent verifier pubkey
- settlement proof reference
- settlement commitment hash
- OTDT hash
- recovery proof reference

### The registry must not store

- sender wallet
- recipient main wallet
- decrypted settlement token
- phone number
- WhatsApp identifier
- token balances
- SAS PII or raw attestation payloads

This privacy boundary is central to TrustLink Pay. A Cranker may need operational data to complete settlement, but that data must not be written into public registry state.

---

## Smart recovery

After settlement proof is accepted, TSN derives recovery state from the commitment registry and enqueues recovery work. Recovery jobs are competitive open work.

Smart recovery considers:

- active liquidity
- pending intent demand
- vault balance
- settlement velocity
- liquidity consumption rate
- time and priority pressure through the queue score

A recovery job records:

- transfer ID
- epoch
- recoverable amount
- vault source
- recovery reward
- priority score
- lease/completion status
- recovery proof reference

The priority score increases when liquidity falls below the configured threshold or pending settlement demand is high. This helps depleted Crankers and liquidity pools recover operational capacity faster.

---

## TypeScript Cranker/runtime components

The TypeScript TSN SDK provides the mempool and API surface used by Crankers and backend services.

Key files:

| File | Role |
| --- | --- |
| `tsn-sdk/src/settlement-token.ts` | Settlement-token encryption/decryption, commitment hashes, Cranker DNA hash, OTDT hash helper. |
| `tsn-sdk/src/mempool.ts` | JSON mempool, commitment registry, claim points, claim leases, proof acceptance, recovery queue, liquidity metrics. |
| `tsn-sdk/src/server.ts` | HTTP API around the mempool runtime. |
| `tsn-sdk/src/contracts.ts` | Public TSN types for intents, registry entries, leases, recovery jobs, metrics, and proofs. |

Useful operations:

```ts
await tsn.postIntent(intentRequest);
await tsn.submitIntentVerification(intentId, crankerPubkey);
await tsn.acquireClaimLease(intentId, crankerPubkey);
await tsn.postProof(proofRequest);
await tsn.listRecoveryQueue({ status: "open" });
await tsn.completeRecoveryJob(jobId, crankerPubkey, proofTx);
```

---

## Python Cranker daemon

The Python daemon is provided for autonomous queue processing and operator automation.

Path:

```text
tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

### Run once

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
TSN_CRANKER_ONCE=true \
python tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

### Run continuously

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
npm --prefix tsn-cranker-op-daemon run crank:python
```

### Python daemon tasks

1. Load the TSN mempool file.
2. Verify pending intents.
3. Award claim points.
4. Acquire leases for eligible claims.
5. Write OTDT hashes.
6. Decrypt settlement tokens in memory.
7. Submit settlement proof references.
8. Mark registry entries recoverable.
9. Enqueue recovery work.
10. Complete priority recovery jobs.
11. Update liquidity metrics.

---

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `TSN_SETTLEMENT_TOKEN_MASTER_KEY` | Yes | Secret used to derive settlement-token encryption/decryption keys. Use deployment secrets. |
| `TSN_CRANKER_DNA` | Yes | Cranker DNA input; only its hash appears in encrypted token envelopes. |
| `TSN_MEMPOOL_FILE` | Local JSON mode | Path to local mempool state file. |
| `TSN_MEMPOOL_URL` | HTTP mode | URL of the TSN mempool server. |
| `TSN_LOW_LIQUIDITY_THRESHOLD` | Recommended | Minimum liquidity target for smart recovery scoring. |
| `TSN_RECOVERY_REWARD_BPS` | Recommended | Recovery reward in basis points. |
| `TSN_CRANKER_POLL_SECONDS` | Python daemon | Continuous loop interval. |

---

## Security and operating rules

1. Do not write sender wallets, recipient wallets, decrypted settlement tokens, phone numbers, balances, or SAS PII to the commitment registry.
2. Keep the settlement-token master key outside git and outside shared logs.
3. Treat Cranker DNA as an operator authorization secret.
4. Verify SAS attestations without storing raw private attestation payloads in TSN state.
5. Treat WhatsApp as social confidence verification only, not as the protocol identity.
6. Monitor recovery queue growth and liquidity metrics continuously.
7. Rotate secrets through a controlled operator process.
8. Keep proof generation deterministic enough for audit but private enough not to reveal wallet routing.

---

## Testing notes

Recommended local checks:

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> npm --prefix tsn-sdk run build
npm --prefix backend run typecheck
python -m py_compile tsn-cranker-op-daemon/scripts/cranker_daemon.py
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> TSN_CRANKER_ONCE=true python tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

Recommended integration assertions:

- a new TSN intent creates a commitment registry entry;
- registry entry contains no sender wallet, recipient wallet, phone number, or decrypted token;
- intent verification awards claim points;
- claim lease acquisition writes an OTDT hash;
- duplicate lease/decryption attempts fail after OTDT issuance;
- settlement proof marks registry entry recoverable;
- recovery queue receives a job;
- recovery completion updates liquidity metrics and recovery proof reference.

---

## Related documents

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PROTOCOL.md](./PROTOCOL.md)
- [TINS.md](./TINS.md)
- [LIQUIDITY.md](./LIQUIDITY.md)
- [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md)
- [OTDT-SMART-RECOVERY.md](./OTDT-SMART-RECOVERY.md)
