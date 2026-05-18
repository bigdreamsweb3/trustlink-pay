# TrustLink Pay Integration Guide

## Prerequisites

- Node.js 20+
- npm
- Solana wallet (for on-chain operations)

## Installation

```bash
npm install @trustlink/tsn
```

## Basic Integration

### 1. Initialize Payment

```typescript
import { createPaymentIntent } from '@trustlink/tsn';

const payment = await createPaymentIntent({
  recipient: '+2348012345678',  // Phone number
  amount: 50,                  // USDC
  token: 'EPjFWdd5AufqSSqeV6Z8oB2cX3Lv9iZ9pKQv2dNqV1mXg', // USDC
});
```

### 2. Handle Webhook

```typescript
import { processWebhook } from '@trustlink/tsn';

app.post('/webhook', async (req) => {
  const event = await processWebhook(req.body);
  
  switch (event.type) {
    case 'payment.created':
      // Notify recipient
      break;
    case 'payment.claimed':
      // Update UI
      break;
  }
});
```

## API Endpoints

| Endpoint | Method | Description |
| --- | ---: | --- |
| `/api/payment/create` | POST | Create payment intent |
| `/api/payment/estimate` | POST | Get fee estimate |
| `/api/payment/claim/request` | POST | Submit claim request |
| `/api/payment/history` | GET | Payment history |
| `/api/identity/verify` | POST | Verify phone number |

## Types

```typescript
interface CreatePaymentRequest {
  recipient: string;
  amount: number;
  tokenMint: string;
}

interface PaymentIntent {
  id: string;
  sender: string;
  recipient: string;
  amount: number;
  status: 'pending' | 'claimed' | 'settled' | 'expired';
  createdAt: number;
}

interface ClaimRequest {
  paymentId: string;
  receiverWallet: string;
}
```

## Error Handling

```typescript
try {
  await createPaymentIntent(request);
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    // Handle insufficient funds
  } else if (error.code === 'INVALID_RECIPIENT') {
    // Handle invalid phone number
  }
}
```

## Testing

```bash
# Run test suite
npm test

# Test specific flow
npm run test:payment
```