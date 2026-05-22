# WhatsApp + TrustLink Seamless Payment Flow

## Concept

Users send payments directly from WhatsApp using TrustLink as the "secure signing layer". When a transaction needs signing, the TrustLink app UI automatically pops up for biometric authentication - making it feel like WhatsApp Pay.

**Key Differentiator:** TrustLink uses **phone numbers** or **TIN (Transfer Identity Number)** as recipients - NOT wallet addresses. Users never need to know or share complex Solana addresses.

```
┌─────────────────────────────────────────────────────────────┐
│                      WhatsApp                               │
│                                                             │
│  User sends: "Send ₦500 to +2348034567890"                 │
│              or "Send $10 to TIN: 1234567890"              │
│                                                             │
│  TrustLink resolves phone/TIN → recipient wallet          │
│  User only sees: Phone Number or TIN (familiar)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Separation

```
┌───────────────────────────────────────────────────────────────────┐
│                     packages/passkey-wallet/                       │
│                                                                   │
│  PURPOSE: Pure wallet library (no app logic)                       │
│                                                                   │
│  Public API:                                                      │
│  - new PasskeyWallet(config)                                      │
│  - .register(options)                                             │
│  - .authenticate(options)                                         │
│  - .signTransaction(request)                                      │
│  - .getAddress()                                                  │
│  - .serialize() / .restore()                                      │
│  - usePasskeyWallet() ← React hook                               │
│                                                                   │
│  ⚠️ Does NOT contain:                                              │
│  - WhatsApp flow                                                  │
│  - Sign confirmation UI                                           │
│  - Push notifications                                             │
│  - WebSocket connections                                          │
└───────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Imported by
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                        TrustLink App                              │
│                                                                   │
│  CONTAINS:                                                        │
│  ├── trustlink-whatsapp-sdk/ (WhatsApp integration)             │
│  ├── frontend/app/sign/ (Sign confirmation UI)                   │
│  └── mobile/TLPay/ (Mobile app with auto-pop)                   │
│                                                                   │
│  USES PasskeyWallet SDK for:                                      │
│  - Creating passkey credentials                                    │
│  - Authenticating users (biometric)                               │
│  - Signing transactions                                           │
└───────────────────────────────────────────────────────────────────┘
```

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌────────────────┐
│   WhatsApp  │────▶│TrustLink Bot │────▶│TrustLink Backend   │────▶│TrustLink App  │
│   (User)    │     │  (Initiate)  │     │  (Queue & Push)    │     │  (Auto-Pop)   │
└─────────────┘     └──────────────┘     └────────────────────┘     └────────────────┘
      │                                           │                     │
      │                                           │                     │
      │  "Send ₦500 to +234..."                  │                     ▼
      │  ◄──────────────────────────              │            ┌────────────────┐
      │                                           │            │ Passkey Sign   │
      │  "Authorize Payment?"                     │            │ (Biometric)    │
      │  ◄──────────────────────────              │            └────────────────┘
      │                                           │                     │
      │  ✅ "Payment Sent!"                       │                     ▼
      │  ◄──────────────────────────              │            ┌────────────────┐
      │                                           │            │ Submit Tx      │
      │                                           │            │ (Solana)       │
      │                                           │            └────────────────┘
```

## Architecture Components

### 1. WhatsApp Side
- TrustLink WhatsApp bot handles payment initiation
- User enters amount, recipient phone number
- Shows payment confirmation before signing

### 2. TrustLink Backend
- WebSocket connection for real-time sign requests
- Push notification via Firebase Cloud Messaging (FCM)
- Deep link handling to auto-open TrustLink app

### 3. TrustLink App
- Receives push notification with sign request
- Auto-opens payment confirmation UI
- Passkey authentication for signing
- Returns signed transaction to backend

## Implementation

### Sign Request Flow

```typescript
// 1. WhatsApp initiates payment - uses PHONE or TIN, NOT wallet address!
interface WhatsAppSignRequest {
  requestId: string;
  fromUserId: string;
  
  // RECIPIENT: Phone number OR TIN (never wallet address)
  recipientPhone?: string;     // "+2348034567890"
  recipientTIN?: string;      // "1234567890" (10-digit)
  
  amount: number;
  token: string; // USDC, etc
  message?: string;
  timestamp: number;
  expiresAt: number;
}

// 2. Backend resolves recipient (phone/TIN → wallet address)
async function initiateWhatsAppPayment(request: WhatsAppSignRequest) {
  // Resolve recipient's wallet from phone/TIN
  const recipientWallet = await resolveRecipient({
    phone: request.recipientPhone,
    tin: request.recipientTIN
  });
  
  // Build transaction with resolved wallet
  const tx = await buildTransferTransaction({
    from: await getUserPasskeyWallet(request.fromUserId),
    to: recipientWallet.address,      // Resolved internally
    amount: request.amount,
    token: request.token
  });

  // Store pending sign request
  await db.signRequests.create({
    id: request.requestId,
    userId: request.fromUserId,
    transaction: tx.serialize(),
    status: 'pending',
    expiresAt: request.expiresAt,
    recipientDisplay: request.recipientPhone || `TIN:${request.recipientTIN}`
  });

  // Send push notification to user's device
  await fcm.send({
    token: await getUserFCMToken(request.fromUserId),
    data: {
      type: 'SIGN_TRANSACTION',
      requestId: request.requestId,
      deeplink: 'trustlink://sign?requestId=' + request.requestId
    }
  });
}

// 3. App shows SIGN CONFIRMATION with phone/TIN (not wallet address)
function SignConfirmationScreen({ request }) {
  return (
    <div className="sign-confirmation">
      <h2>Authorize Payment</h2>
      
      {/* User sees FAMILIAR identifiers, not wallet addresses */}
      <div className="payment-details">
        <span>Amount</span>
        <strong>{formatCurrency(request.amount)}</strong>
      </div>
      
      <div className="payment-details">
        <span>To</span>
        {/* Shows PHONE or TIN - never wallet address */}
        <strong>{request.recipientDisplay}</strong>
        {/* e.g. "+234 803 456 7890" or "TIN: 1234567890" */}
      </div>
      
      <div className="payment-details">
        <span>Via</span>
        <strong>WhatsApp</strong>
      </div>
      
      <div className="expires-warning">
        Expires in {formatTimeRemaining(request.expiresAt)}
      </div>
      
      <button onClick={() => signWithPasskey(request.requestId)}>
        Sign with Passkey
      </button>
    </div>
  );
}
```

### Recipient Resolution (Backend)

```typescript
// TrustLink resolves phone/TIN to wallet address internally
async function resolveRecipient(params: { phone?: string; tin?: string }) {
  if (params.phone) {
    // Lookup by phone number
    const user = await db.users.findOne({ phoneNumber: params.phone });
    return { address: user.walletAddress, display: params.phone };
  }
  
  if (params.tin) {
    // Lookup by TIN (Transfer Identity Number)
    const tinAccount = await db.tins.findOne({ tin: params.tin });
    return { address: tinAccount.walletAddress, display: `TIN: ${params.tin}` };
  }
  
  throw new Error('Must provide phone or TIN');
}
```

### UI Components

#### Auto-Pop Trigger
```typescript
// App entry point checks for pending sign requests
function handleAppOpen() {
  const pendingRequest = storage.getPendingSignRequest();
  
  if (pendingRequest) {
    // Show sign confirmation immediately
    showSignConfirmation(pendingRequest);
  }
}
```

#### Sign Confirmation Screen
```typescript
// /sign-transaction route
export function SignTransactionScreen({ requestId }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  
  useEffect(() => {
    loadSignRequest(requestId);
  }, [requestId]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="sign-confirmation">
      <h2>Authorize Payment</h2>
      
      <div className="payment-details">
        <span>Amount</span>
        <strong>{formatCurrency(request.amount)}</strong>
      </div>
      
      <div className="payment-details">
        <span>To</span>
        <strong>{request.recipientPhone}</strong>
      </div>
      
      <div className="payment-details">
        <span>From</span>
        <strong>WhatsApp</strong>
      </div>
      
      <div className="expires-warning">
        Expires in {formatTimeRemaining(request.expiresAt)}
      </div>
      
      <button 
        onClick={() => signWithPasskey(requestId)}
        className="sign-button"
      >
        Sign with Passkey
      </button>
    </div>
  );
}
```

### WebSocket Connection (Real-time)

```typescript
// Backend WebSocket handler
wss.on('connection', (ws, userId) => {
  // Join user's room
  ws.join(`user:${userId}`);

  // Listen for sign requests
  ws.on('signTransaction', async (data) => {
    // User is connected - send directly via WS
    // instead of push notification
    ws.send(JSON.stringify({
      type: 'SIGN_TRANSACTION',
      ...data
    }));
  });
});
```

## Deep Linking

### iOS (Universal Links)
```json
// apple-app-site-association
{
  "applinks": [{
    "domains": ["trustlink.pay"],
    "paths": ["/sign/*"]
  }]
}
```

URL: `https://trustlink.pay/sign?requestId=xxx` or `trustlink://sign?requestId=xxx`

### Android (App Links)
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <data android:scheme="trustlink" host="sign" pathPrefix="/request" />
</intent-filter>
```

## Push Notification Payload

```typescript
// FCM notification
{
  notification: {
    title: "Authorize Payment",
    body: "Send ₦500 to +234...",
    icon: "payment_icon",
    click_action: "trustlink://sign?requestId=xxx"
  },
  data: {
    type: "SIGN_TRANSACTION",
    requestId: "xxx",
    amount: "500",
    recipient: "+234...",
    deeplink: "trustlink://sign?requestId=xxx"
  }
}
```

## Sign Confirmation UI (Separate from SDK)

The **Sign Confirmation UI** is NOT part of `packages/passkey-wallet/`. It lives in the TrustLink app and uses the SDK.

```
packages/passkey-wallet/          ← Pure library
├── src/types.ts                   ← Interfaces
├── src/keys.ts                    ← Key derivation
├── src/wallet.ts                  ← PasskeyWallet class
├── src/react.ts                   ← usePasskeyWallet hook
└── src/index.ts                  ← Exports

TrustLink App (uses SDK)           ← App layer
├── frontend/app/sign/            ← Sign confirmation UI
│   ├── page.tsx                  ← Auto-pop route
│   ├── SignPrompt.tsx            ← Payment details display
│   └── SignButton.tsx            ← Triggers SDK sign
├── trustlink-whatsapp-sdk/       ← WhatsApp integration
└── mobile/TLPay/                ← Mobile app
```

### Sign Confirmation Uses SDK

```typescript
// frontend/app/sign/SignPrompt.tsx
// This is NOT in the SDK - it USES the SDK

import { usePasskeyWallet } from "@trustlink/passkey-wallet";

export function SignPrompt({ request }) {
  const { signTransaction, getAddress } = usePasskeyWallet();

  async function handleSign() {
    // Use SDK to sign
    const result = await signTransaction({
      transaction: request.transaction,
      displayData: {
        title: "Authorize Payment",
        amount: formatCurrency(request.amount),
        recipient: request.recipientDisplay,  // "+234 803 456 7890"
      }
    });

    // Submit to backend
    await api.submitSignedTransaction(request.id, result);
  }

  return (
    <div className="sign-prompt">
      <div className="amount">{request.amount}</div>
      <div className="recipient">{request.recipientDisplay}</div>
      <button onClick={handleSign}>Sign with Face ID</button>
    </div>
  );
}
```

### SDK vs App Responsibility

| Function | Location |
|----------|----------|
| Create passkey credential | SDK |
| Authenticate (biometric) | SDK |
| Derive Solana keypair | SDK |
| Sign transaction bytes | SDK |
| Handle push notifications | App |
| Auto-pop UI on sign request | App |
| Show payment details (phone/TIN) | App |
| WebSocket connection | App |
| WhatsApp bot integration | App |

## Key Differentiators

### No Wallet Addresses - Ever

| Traditional Crypto | TrustLink WhatsApp |
|-------------------|-------------------|
| "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" | "+234 803 456 7890" |
| "5xKJwTM3kWPj9YVLnG5KJ5cT5Z8pQ3r6tN2mX4kH9J" | "TIN: 1234567890" |
| User must verify/copy address | Just tap to send |
| Easy to make mistakes | No mistakes possible |

### How Resolution Works

```
User says: "Send ₦500 to +2348034567890"
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│              TRUSTLINK BACKEND                         │
│                                                        │
│  resolveRecipient("+2348034567890")                   │
│         │                                              │
│         ├──► Lookup user by phone                      │
│         │                                              │
│         ├──► Get wallet address                        │
│         │      7xKXb2...                               │
│         │                                              │
│         └──► Return resolved wallet                    │
└────────────────────────────────────────────────────────┘
```

### What User Sees vs What Happens

| User Input | Backend Resolution | UI Shows |
|------------|--------------------|----------|
| `+2348034567890` | `7xKXb2...wallet` | `+234 803 456 7890` |
| `TIN: 1234567890` | `9mN3a5...wallet` | `TIN: 1234567890` |
| `@handle` | `4kP8b3...wallet` | `@handle` |

## Security Considerations

1. **Request Expiration** - Sign requests expire after 5 minutes
2. **Biometric Required** - Every sign requires passkey/biometric
3. **Device Binding** - Only user's registered devices can sign
4. **Rate Limiting** - Max 3 sign requests per minute
5. **Amount Limits** - Large transactions require extra verification
6. **Phone Verification** - Phone number must be verified with TrustLink

## User Experience

| Scenario | Behavior |
|---------|----------|
| App closed, sign request arrives | Push notification + auto-open |
| App in background | Bring to foreground + show UI |
| App open (other screen) | Navigate to sign screen |
| User ignores request | Auto-expire after timeout |
| User denies | Notify WhatsApp of rejection |
| Invalid phone number | Show error in WhatsApp immediately |

## WhatsApp Integration Points

1. **Payment Initiation** - User sends "Send ₦500 to +234..."
2. **Validation** - Verify recipient exists on TrustLink
3. **Confirmation** - Show payment summary (amount, recipient name, fee)
4. **Sign Request** - Trigger TrustLink sign flow
5. **Result** - Show success/failure in WhatsApp with tx link

## Next Steps

1. [ ] Implement WebSocket server for real-time sign requests
2. [ ] Add FCM push notification service
3. [ ] Create deep link handling in mobile app
4. [ ] Build sign confirmation UI component
5. [ ] Add request expiration and timeout handling
6. [ ] Test flow with WhatsApp bot integration

---

*This architecture enables seamless WhatsApp payments where TrustLink acts as the secure signing layer while WhatsApp provides the familiar user interface.*