# TrustLink Pay Integration Guide

TrustLink Pay integrations should be TIN-first.

The user-facing recipient is a 10-digit Transfer Identity Number. TSN handles private settlement behind the scenes.

---

## Install

```bash
npm install @trustlink/tsn-sdk
```

Package names may change as the SDKs are published. In this repository, the active package surfaces are `tsn-sdk` and `tins-sdk`.

---

## Basic Flow

```ts
import {
  buildCreateTinInstruction,
  getTinsRegistryPda,
} from "@trustlink/tsn-sdk/tins";

import {
  buildTsnSponsoredSettlementTransaction,
} from "@trustlink/tsn-sdk/sponsored-settlement";

import {
  submitPaymentAuthorizationToMempool,
} from "@trustlink/tsn-sdk/payment-authorization";
```

### 1. Resolve Recipient TIN

```ts
const recipientTin = "1000000008";
const registryPda = getTinsRegistryPda({ tin: recipientTin });
```

The application resolves the TIN to a settlement route using TINS/app state.

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

```ts
await submitPaymentAuthorizationToMempool({
  mempoolUrl,
  paymentId,
  recipientHash,
  tokenMintAddress,
  senderWallet,
  senderAuthorizationMessage,
  senderAuthorizationSignature,
  senderAuthorizationNonce,
  senderAuthorizationIssuedAt,
  senderAuthorizationExpiresAt,
  senderSignedSettlementTransaction: signedTransactionBase64,
  senderSignedSettlementFeePayer: settlement.crankerFeePayer,
  senderSettlementMode: "sponsored_sender_cosigned",
  senderTokenAccount: settlement.senderTokenAccount,
  settlementVault: settlement.paymentVault,
  settlementTokenAccount: settlement.paymentVaultTokenAccount,
  settlementPaymentIntentId: settlement.paymentIntentId,
  amount: 5,
  recipientAmount: 5,
  autoclaim: true,
});
```

### 4. Track Status

| Status | User Meaning |
| --- | --- |
| `pending` | Awaiting cranker verification |
| `escrowed` | Funds are in TSN escrow/vault path |
| `claimed` | Claim work is being processed |
| `executed` | Recipient payout completed |
| `failed` | Retry may be needed, especially for recipient claim |
| `canceled` | Payment work was rejected or expired |

Sender UX should treat escrowed funds as escrowed, not failed, even if recipient-side claim execution needs retry.

---

## API Role

Backend APIs should store product state and user history.

The frontend/SDK should handle TSN-specific signing and settlement preparation. The backend can receive:

- payment id,
- TIN/recipient identity metadata,
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
