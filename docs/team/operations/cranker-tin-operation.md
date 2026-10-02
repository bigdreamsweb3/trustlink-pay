# Cranker TIN-operation job

## Scope

Every online Cranker remains a generic TSN operator. The daemon leases `AUTHORIZED_FUNDING`, `SETTLEMENT`, and `TIN_OPERATION` work through the Receiver and selects the network-specific adapter only after the Node has authorized the work.

## What changed

The daemon accepts `TIN_OPERATION` work only after verifying the Node's Ed25519
receipt with `TSN_NODE_VERIFICATION_PUBLIC_KEY`. It checks the active lease and
input/evidence commitments, then recomputes the exact Cranker execution-payload
commitment before it acts. The Receiver also validates the receipt before
storing the Node decision. This receipt is separate from the Node payout
authorization that the TSN settlement program verifies on-chain.

For verified private `tin_creation` work, the daemon measures the complete
transaction first. It submits `CreateTinV1` directly if it fits Solana's
1,232-byte packet limit. Larger payloads use the TIN program's intent-bound
staging account, append encrypted identity blobs in chunks no larger than 700
bytes, and finalize with the owner Ed25519 proof. The SDK owns the instruction
byte layout; the daemon does not hand-build protocol payloads. After
finalization, it verifies the registry account under the configured TIN program
before reporting `CONFIRMED` to the Receiver.

## Privacy boundary

The lookup secret, plaintext TIN identity, and display name do not enter the Cranker view. The Node passes only the lookup commitment, owner authorization, and encrypted envelopes required by the on-chain instruction. Public operation reads expose a TIN hash and omit encrypted identity material.

## Required sequence

1. The trusted XP backend creates the TIN V1 identity envelope and issuance proof; the owner wallet authorizes the canonical intent through the SDK.
2. Receiver stores one durable work item and wakes the Node with a payload-free notification.
3. The Node leases and validates the payload, then returns a signed `VERIFIED` or `REJECTED` receipt to the Receiver.
4. The Cranker leases only verified work, validates the receipt, and uses direct or staged submission according to the transaction size.
5. The Cranker confirms the final Solana transaction, validates the TIN V1 registry account, and reports its signature and registry address to the Receiver.

See [TIN V1 on-chain finalization](../../protocol-flows/tin-creation/04-onchain-finalization.md)
and [completion evidence](../../protocol-flows/tin-creation/05-evidence.md)
for the current instruction sequence and verified Devnet reference.

## Verification checklist

- `python -m py_compile tsn-protocol/services/tsn-node/server.py`
- `npm run build` from `tsn-protocol/sdks/tsn-sdk`
- `npx tsc --noEmit -p tsconfig.json` from `tsn-protocol/services/tsn-cranker-op-daemon`
- Receiver build/deployment verification is required before claiming hosted behavior.

The referenced local Receiver record is a real confirmed TIN V1 Devnet run. Keep
the work ID, final transaction signature, registry address, and stage
signatures together when capturing another run; never treat a queued intent or
staging initialization as final issuance.
