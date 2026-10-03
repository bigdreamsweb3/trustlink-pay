# Create and recover a TIN: code map

This map separates the code shown in TSN XP from the SDK API developers can call directly. The current XP uses the SDK to read the owner recovery account and select the versioned wallet message; it then decrypts the recovery envelope in the browser. The direct SDK helper performs those steps as one call.

## XP flow captured in the recording

1. `protocol-tests/ui/public/tsn-dapp.js` — `connectWallet()` reconnects the owner wallet and calls `recoverConnectedTin()`.
2. `protocol-tests/ui/server.mjs` — `GET /api/tsn/sdk/owner-tin-recovery` calls `getTinV1OwnerRecoveryEnvelope()` and `getTinV1OwnerRecoveryMessageForEnvelope()` from `@trustlink/tsn-sdk`.
3. `protocol-tests/ui/public/tsn-dapp.js` — `recoverConnectedTin()` asks the wallet to sign the recovery message, then `decryptTinRecovery()` decrypts the V4 `{ tin, displayName }` envelope locally.
4. `tsn-protocol/sdks/tsn-sdk/src/tins.ts` — `recoverTinV1IdentityForOwner()` is the direct SDK API for applications that want the SDK to fetch and decrypt the owner recovery record.

The signature authorizes local recovery. The recovery signature and plaintext identity are not sent to the Receiver or Node, and recovery does not submit a Solana transaction.

## Direct SDK example

```ts
const identity = await recoverTinV1IdentityForOwner({
  connection,
  ownerPubkey,
  programId,
  signMessage: async (message) => {
    const signed = await wallet.signMessage(message, "utf8");
    return signed.signature;
  },
});

if (!identity) throw new Error("No TIN recovery record exists for this wallet");
console.log(identity.tin, identity.displayName);
```

## Creation and settlement code path

- `tsn-protocol/sdks/tsn-sdk/src/tins.ts` — TIN V1 creation serialization, owner recovery envelope creation, and owner recovery APIs.
- `tsn-protocol/services/tsn-receiver/app/api/tin-operations/route.ts` — Receiver TIN operation ingress.
- `tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts` — Node work lease and result transitions.
- `tsn-protocol/services/tsn-node/server.py` — Node verification and signed verification attestation.
- `tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts` — staged TIN V1 Solana submission.
- `tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs` — on-chain registry creation.

## Evidence boundary

The Receiver evidence records the encrypted recovery envelope during ingress and the Node verification decision. After completion, its work record may omit transient Node and Cranker leases. The final signed transaction, finalized staging transactions, TIN registry account, and owner recovery account are captured separately in this pack. The plaintext TIN and display name remain visible in the recording; they are not copied out of the encrypted Receiver payload into these evidence files.
