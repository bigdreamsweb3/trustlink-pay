# TIN Creation Lifecycle

This folder documents the complete program-assigned TIN creation lifecycle.
The current verified boundary is browser -> SDK -> TSN Node. The remaining
stages must be documented and verified before the flow is called complete.

## Stages

1. **Browser and SDK construction**
   - Connect the owner wallet.
   - Build and sign the owner-encryption message.
   - Encrypt the random master seed locally.
   - Build the program-assigned creation intent.
   - Sign the readable owner-intent message.

2. **Receiver ingress**
   - Receive the signed SDK payload first.
   - Store durable `TIN_OPERATION` work with an idempotent work ID.
   - Mark the work `RECEIVED`.
   - Wake the Node verifier.

3. **Node verification**
   - Lease `RECEIVED` work as `NODE_VERIFYING`.
   - Decode and type-check the JSON fields.
   - Recompute the intent hash from bytes.
   - Verify the owner signature against the exact signed message.
   - Check expiry, route commitments, and required fields.
   - Return the verified result to the Receiver.

4. **Receiver verified storage**
   - Store the Node verification result.
   - Redact private fields from Cranker work views where required.
   - Mark the work `VERIFIED`.

5. **Cranker lease**
   - Assign verified work to an eligible Cranker.
   - Bind the lease to the operation and expiry.
   - Prevent duplicate or concurrent execution.

6. **On-chain finalization**
   - Serialize the exact TIN creation instruction.
   - Add the owner Ed25519 proof required by the deployed program.
   - Submit with the Cranker operator signer.
   - Decode the created PDA and assigned 10-digit TIN.

7. **Evidence and reporting**
   - Report the Solana signature, registry PDA, assigned TIN, and final status.
   - Record the explorer URL and the exact source/version used.

## Current State

The current direct browser-to-Node stage is documented in:

- [TIN creation intent handoff](../../TSN-TIN-CREATION-INTENT-HANDOFF.md)

Current result from the protocol test UI:

```text
Browser wallet connected: yes
Owner encryption envelope created: yes
Intent hash created: yes
Node accepted and returned intentId: yes
Receiver-first TIN ingress: not yet wired
Cranker lease through Receiver: not yet verified
Solana transaction: not yet submitted
TIN assigned on-chain: no
```

Do not move the operation to the next stage until the current stage has
explicit evidence. In particular, Node acceptance is not on-chain creation.

## Required Next Documents

- `01-receiver-ingress.md`: Receiver-first submission and durable work creation;
- `02-node-verification.md`: Node lease, normalization, and rejection rules;
- `03-cranker-lease.md`: Receiver lease and Cranker work view;
- `04-onchain-finalization.md`: instruction bytes, accounts, proof, and PDA;
- `05-evidence.md`: commands, signatures, decoded result, and acceptance gate.
