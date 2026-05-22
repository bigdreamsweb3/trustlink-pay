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