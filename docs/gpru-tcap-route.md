# GPRU derivation and TCap TIN routes

**Protocol version:** GPRU V1 / TCap route V1. **Commit reference:** 394c4f9 (GPRU and TCap implementation).

## Summary

GPRU is a TSN-derived settlement identity. We derive it from a TIN privacy-receiving root, a settlement commitment, epoch context, and authorization scope. It is deliberately **not** a wallet, token-account owner, receiving wallet, or balance container. Actual settlement remains inside TSN escrow and settlement-token primitives.

TCap route V1 replaces public/static ZK-PRU route material on a TIN with an opaque relationship commitment, relationship reference, and policy commitment. Encrypted TIN metadata remains committed as before. The on-chain registry never receives policy plaintext, a static PRU list, pre-generated receiving wallets, or a maximum-PRU field.

## Implementation notes

TypeScript exports `deriveGpruIdentity`, canonical authorization-message construction, binding verification, and Ed25519 signature verification from `@trustlink/tsn-sdk/gpru`. The canonical bytes frame each value with a four-byte big-endian length, preventing ambiguous concatenation.

The TIN Registrar appends TCap fields to `TinAccount` so existing accounts can migrate through the update processor. Route version `0` is reserved for legacy ZK-PRU compatibility. TCap V1 requires non-zero relationship/reference/policy commitments and rejects legacy PRU configuration and route-envelope data. The staged update processor applies the same route constraints.

The Python Cranker daemon has no custody role here: it may carry opaque TCap references and submit owner-authorized updates, but cannot derive a GPRU without the user-controlled TIN privacy-receiving root or use one to control a token account.

## Usage

```ts
import { deriveGpruIdentity, createCanonicalGpruAuthorizationMessage } from "@trustlink/tsn-sdk/gpru";
const gpruIdentity = deriveGpruIdentity({ tinPrivacyReceivingRoot, settlementCommitment, epochContext, authorizationScope });
const message = createCanonicalGpruAuthorizationMessage({ tinPrivacyReceivingRoot, settlementCommitment, epochContext, authorizationScope, gpruIdentity });
```

A Cranker submits the usual owner-signed TIN update transaction; it does not create any receiving wallet or token account for the GPRU.

## Security and privacy considerations

The derivation uses separate domain tags for identity derivation and authorization signing. Settlement commitment, epoch, and scope are bound to both identity and authorization. TCap stores only fixed-length commitments/references. TIN encrypted metadata stays encrypted off chain; public account state carries only its hash. Legacy ZK-PRU fields are rejected for TCap routes, preventing accidental mixed-mode public route inventories.

## Testing notes

Run `npm test` from `tsn-protocol/tsn-sdk` for deterministic derivation, canonical-byte signature verification, and existing TSN tests. Run `cargo check` from `transfer-identity-protocol/tin-registrar/program` to check the TIN Registrar processor and account serialization changes.
