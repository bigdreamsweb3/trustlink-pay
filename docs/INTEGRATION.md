# TrustLink Pay Integration Guide

TrustLink Pay integrations use the TIN (Transfer Identity Number) as the protocol identity. A TIN is a 10-digit number that identifies a recipient on the TrustLink network. TSN handles private settlement behind the scenes.

Phone numbers and WhatsApp are optional application-layer conveniences -- they do not replace the TIN.

---

## Install

```bash
npm install @trustlink/tsn-sdk
```

Package names may change as the SDKs are published. In this repository, the active package surfaces are local to the monorepo under `tsn-sdk/`.

---

## Basic Flow

```ts
import {
  buildCreateTinInstruction,
  getTinsRegistryPda,
} from "tsn-sdk/src/tins";

import {
  buildTsnSponsoredSettlementTransaction,
} from "tsn-sdk/src/sponsored-settlement";

import {
  submitPaymentAuthorizationToMempool,
} from "tsn-sdk/src/payment-authorization";
```

### 1. Resolve Recipient TIN

```ts
const recipientTin = "1000000008";
const registryPda = getTinsRegistryPda({ tin: recipientTin });
```

The application resolves the TIN to a settlement route using TINS and app state.

### 2. Build Sponsored Settlement

```ts
const settlement = await buildTsnSponsoredSettlementTransaction({
  paymentId,
  crankerFeePayer,
  senderWallet,
  tokenMintAddress,
  amountUi: "5",
  senderFeeAmountUi: "0.003",
  tokenDecimals: 6,
  recipientHash,
});
```

The frontend requests the sender wallet to sign the payload. The sender does not broadcast the settlement transaction.

### 3. Submit Authorization

Call `submitPaymentAuthorizationToMempool` with the signed settlement payload and the response from step 2. See the SDK reference docs for the full parameter list and expected types.

### 4. Track Status

| Status | User Meaning |
| --- | --- |
| `pending` | Awaiting cranker verification |
| `escrowed` | Funds are in TSN escrow or vault path |
| `claimed` | Claim work is being processed |
| `executed` | Recipient payout completed |
| `failed` | Retry may be needed, especially for recipient claim |
| `canceled` | Payment work was rejected or expired |

Sender UX should treat escrowed funds as escrowed, not failed, even if recipient-side claim execution needs retry.

---

## API Role

Backend APIs should store product state and user history.

The frontend and SDK should handle TSN-specific signing and settlement preparation. The backend can receive:

- payment id,
- TIN and recipient identity metadata,
- mempool intent id,
- escrow transaction hash,
- proof transaction hash,
- final status.

---

## Optional Social Links

Applications may add:

- WhatsApp notifications,
- phone recovery,
- social profile verification,
- business identity labels.

These should point to a TIN. They should not replace the TIN as the protocol identity.
