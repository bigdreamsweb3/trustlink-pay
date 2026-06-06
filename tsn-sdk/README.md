# TSN SDK

TypeScript SDK for the TSN (Transfer Settlement Network) protocol on Solana.

## Installation

```bash
npm install @trustlink/tsn-sdk
```

## Usage

```typescript
import { TsnHttpClient, buildCreateIntentRequest, computeTsnUiStage } from "@trustlink/tsn-sdk";

// Create a mempool client
const client = new TsnHttpClient({ baseUrl: "http://localhost:8787" });

// Build an intent request
const request = buildCreateIntentRequest({
  paymentId: "...",
  recipientHash: "...",
  tokenMintAddress: "...",
  amount: 1000,
});

// Post to mempool
await client.postIntent(request);
```

## Modules

- `contracts` - Type definitions for TSN contracts and records
- `client` - HTTP client for TSN mempool operations
- `mempool` - Mempool implementations (JSON file and HTTP)
- `quote` - Transfer fee quoting utilities
- `settlement-economics` - Settlement economics evaluation
- `program` - Program constants and ID verification
- `blockchain/solana-core` - Core Solana utilities
- `blockchain/solana-tsn` - TSN-specific blockchain operations

## TIN Resolution And Encrypted Identities

The TSN SDK includes TINS helpers so payment applications can resolve a 10-digit TIN without reimplementing TINS internals.

Social identities are encrypted with a key derived from the TIN. Anyone who knows the TIN can decrypt these social routes:

```ts
import {
  encryptTinSocialIdentity,
  getTinsRegistryPda,
  buildLinkSocialIdentityInstruction,
  resolveTIN,
} from "@trustlink/tsn-sdk";

const tin = "1000000008";
const encrypted = await encryptTinSocialIdentity({
  tin,
  value: "+2349037334349",
});

const ix = buildLinkSocialIdentityInstruction({
  owner: wallet.publicKey,
  registry: getTinsRegistryPda({ tin }),
  identityType: "whatsapp",
  label: "Primary WhatsApp",
  nonce: encrypted.nonce,
  ciphertext: encrypted.ciphertext,
  metadata: JSON.stringify({ display: "WhatsApp" }),
});

const resolved = await resolveTIN({ tin, connection });
console.log(resolved.socialIdentities);
```

Sensitive fields are encrypted with TIN + explicit user authorization. Without the user signature, `resolveTIN` returns the encrypted sensitive records but does not decrypt them:

```ts
import {
  buildSensitiveAuthorizationMessage,
  encryptTinSensitiveField,
  resolveTIN,
} from "@trustlink/tsn-sdk";

const message = buildSensitiveAuthorizationMessage({
  tin,
  fieldType: "kyc_document_hash",
  nonce: "session-123",
});
const userSignature = await wallet.signMessage(new TextEncoder().encode(message));

const encryptedKyc = await encryptTinSensitiveField({
  tin,
  fieldType: "kyc_document_hash",
  value: "sha256:kyc-document-hash",
  userSignature,
});

const resolvedWithSensitiveData = await resolveTIN({
  tin,
  connection,
  sensitiveAuthorizations: {
    kyc_document_hash: userSignature,
  },
});
```

## Platform Verification

Verification platforms are registered on-chain in the TINS `PlatformRegistry` PDA. A platform verifies a social identity off-chain, signs a proof message, and the TINS program validates the Ed25519 proof against registered platform keys.

```ts
import {
  buildPlatformSignedProofMessage,
  buildLinkVerifiedSocialIdentityInstructions,
} from "@trustlink/tsn-sdk";

const proofMessage = buildPlatformSignedProofMessage({
  tin,
  identityType: "whatsapp",
  label: "Primary WhatsApp",
  encryptedPayloadHash,
  subjectWallet: wallet.publicKey,
  issuedAt: BigInt(Math.floor(Date.now() / 1000)),
});

const instructions = buildLinkVerifiedSocialIdentityInstructions({
  owner: wallet.publicKey,
  registry: getTinsRegistryPda({ tin }),
  platformPubkey,
  platformSignature,
  proofMessage,
  identityType: "whatsapp",
  label: "Primary WhatsApp",
  nonce: encrypted.nonce,
  ciphertext: encrypted.ciphertext,
});
```

The first instruction verifies the platform signature with Solana’s Ed25519 program. The second instruction stores the encrypted identity only if the platform key is active in the Platform Registry and the TIN owner signed the transaction.

## Local Demo

From the repository root:

```bash
npm run tins:identity:demo -- 1000000008 +2349037334349 sha256:demo-kyc
```

This builds the TSN SDK, encrypts/decrypts a WhatsApp identity with the TIN, and encrypts/decrypts `kyc_document_hash` with TIN + user authorization material.
