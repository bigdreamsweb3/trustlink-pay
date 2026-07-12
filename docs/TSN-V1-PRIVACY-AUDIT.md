# TSN V1 Privacy Architecture Audit

**Date:** 2026-07-10  
**Status:** DRAFT - Requires Migration  
**Scope:** Full codebase audit for privacy-violating patterns

---

## Executive Summary

This audit identifies all locations in the TrustLink Pay / TSN codebase where private settlement information is created, stored, returned, or displayed in violation of the TSN V1 Privacy Architecture principles.

**Critical Finding:** The current architecture violates the core privacy principle: **Applications integrating with TSN must never become custodians of private settlement truth.**

---

## 1. Current Architecture Flow (Violations)

### 1.1 Settlement Information Creation

| File | Information Created |
|------|-------------------|
| `backend/app/services/tsn.ts` | `PaymentIntentRecord` with `escrow_tx_sig`, `claim_tx_sig`, `proof_tx_sig` |
| `backend/app/services/payments.ts` | `PaymentRecord` with `sender_wallet`, `receiver_wallet`, all signatures |
| `tsn-protocol/tsn-sdk/src/private-settlement.ts` | `PrivatePayoutPermit` with `recipientWallet` |

### 1.2 Settlement Information Storage (Database)

**File:** `backend/app/db/schema.sql`

#### Plaintext Storage Violations:

| Table | Column | Privacy Risk |
|-------|-------|-------------|
| `users` | `wallet_address` | User wallet exposed |
| `users` | `settlement_wallet_pubkey` | Settlement infrastructure exposed |
| `users` | `recovery_wallet_pubkey` | Recovery wallet exposed |
| `users` | `privacy_view_pubkey` | Privacy key exposed |
| `users` | `privacy_spend_pubkey` | Privacy spend key exposed |
| `payments` | `sender_wallet` | Sender wallet exposed |
| `payments` | `receiver_wallet` | Receiver wallet exposed |
| `payments` | `deposit_signature` | Transaction signature exposed |
| `payments` | `release_signature` | Transaction signature exposed |
| `payments` | `refund_release_signature` | Transaction signature exposed |
| `payments` | `ephemeral_pubkey` | Ephemeral key exposed |
| `payments` | `refund_ephemeral_pubkey` | Ephemeral key exposed |
| `payment_intents` | `escrow_tx_sig` | TSN escrow signature exposed |
| `payment_intents` | `claim_tx_sig` | TSN claim signature exposed |
| `payment_intents` | `proof_tx_sig` | TSN proof signature exposed |
| `payment_intents` | `assigned_cranker_pubkey` | Cranker identity exposed |
| `claim_requests` | `destination_wallet` | **CRITICAL:** Settlement destination exposed |

### 1.3 Settlement Information Returned (APIs)

**File:** `backend/app/services/payment-views.ts`

```typescript
// Lines 184-201: sanitizePaymentForViewer()
sender_wallet: viewerRole === "sender" ? payment.sender_wallet : null,
deposit_signature: viewerRole === "sender" ? payment.deposit_signature : null,
released_to_wallet: viewerRole === "receiver" ? payment.released_to_wallet : maskWalletAddress(payment.released_to_wallet),
```

**File:** `backend/app/services/payment-views.ts`

```typescript
// Lines 270-307: Returns trace object with ALL signatures
trace: {
  depositSignature: safePayment.deposit_signature,
  releaseSignature: payment.release_signature,
  tsnEscrowSignature: safePayment.tsn?.escrowTxSig ?? null,
  tsnClaimSignature: viewerRole === "receiver" ? safePayment.tsn?.claimTxSig ?? null : null,
  tsnProofSignature: viewerRole === "receiver" ? safePayment.tsn?.proofTxSig ?? null : null,
}
```

### 1.4 Frontend Display of Private Information

**File:** `frontend/src/components/experiences/transaction-detail-experience.tsx`

```tsx
// Lines 335-420: Displays ALL transaction signatures publicly
{label: "Deposit tx", sig: detail.trace.depositSignature, url: detail.trace.depositExplorerUrl},
{label: "TSN escrow tx", sig: detail.trace.tsnEscrowSignature, ...},
{label: "Receiver payout tx", sig: detail.trace.releaseSignature, ...},
{label: "TSN payout lease", sig: detail.trace.tsnClaimSignature, ...},
{label: "TSN settlement proof", sig: detail.trace.tsnProofSignature, ...},
{label: "Released to", sig: detail.receiver.releasedWallet, ...},
```

### 1.5 Type Definitions Containing Private Data

**File:** `frontend/src/lib/types.ts`

```typescript
// Lines 78-149: PaymentRecord exposes ALL sensitive fields
export interface PaymentRecord {
  sender_wallet: string | null;           // VIOLATION
  receiver_wallet: string | null;         // VIOLATION
  deposit_signature: string | null;        // VIOLATION
  release_signature: string | null;        // VIOLATION
  escrow_account: string | null;           // VIOLATION
  escrow_vault_address: string | null;     // VIOLATION
  tsn?: {
    destinationWallet: string | null;      // CRITICAL VIOLATION
    assignedCrankerPubkey: string | null;
    escrowTxSig: string | null;            // VIOLATION
    claimTxSig: string | null;             // VIOLATION
    proofTxSig: string | null;             // VIOLATION
  };
}

// Lines 178-237: PaymentDetailResponse exposes trace data
export interface PaymentDetailResponse {
  trace: {
    depositSignature: string | null;       // VIOLATION
    tsnEscrowSignature: string | null;    // VIOLATION
    tsnClaimSignature: string | null;      // VIOLATION
    tsnProofSignature: string | null;      // VIOLATION
  };
  receiver: {
    releasedWallet: string | null;        // CRITICAL VIOLATION
  };
}
```

### 1.6 TSN SDK Exposing Private Data

**File:** `frontend/src/lib/tsn.ts`

```typescript
// Lines 15-23: TsnMempoolPaymentStatus exposes settlement data
export type TsnMempoolPaymentStatus = {
  assignedCrankerPubkey: string | null;   // VIOLATION
  escrowTxSig: string | null;             // VIOLATION
  claimTxSig: string | null;              // VIOLATION
  proofTxSig: string | null;              // VIOLATION
};

// Lines 86-101: toPaymentTsnState passes destinationWallet
export function toPaymentTsnState(
  status: TsnMempoolPaymentStatus,
  destinationWallet: string | null = null,  // VIOLATION
): PaymentRecord["tsn"]
```

**File:** `tsn-protocol/tsn-sdk/src/private-settlement.ts`

```typescript
// Lines 42-52: PrivatePayoutPermit exposes recipientWallet
export type PrivatePayoutPermit = {
  recipientWallet: string;  // CRITICAL VIOLATION
  permitSignatureBase64: string;
  // ...
};
```

### 1.7 Mempool Frontend Display

**File:** `tsn-protocol/tsn-mempool-frontend/app/page.tsx`

```typescript
// Lines 30-38: Claim type exposes destinationWallet
type Claim = {
  destinationWallet: string | null;  // VIOLATION
  // ...
};

// Lines 308-319: Displays destinationWallet
title="Private settlement route"
subtitle={`${truncate(claim.id, 18)} | ${timeAgo(claim.postedAt, now)}`}
```

---

## 2. Complete Flow Analysis

### Current (Violating) Flow:

```
Frontend (transaction-detail-experience.tsx)
    ↓
Backend API (/api/payment/[id])
    ↓
payment-views.ts → getPaymentDetailForViewer()
    ↓
Returns: trace { depositSignature, tsnEscrowSignature, tsnClaimSignature, tsnProofSignature }
Returns: receiver.releasedWallet
    ↓
Frontend receives PaymentDetailResponse with ALL signatures
    ↓
Frontend displays:
- "Deposit tx" with signature link
- "TSN escrow tx" with signature link
- "Receiver payout tx" with signature link
- "TSN payout lease" with signature link
- "TSN settlement proof" with signature link
- "Released to" wallet address
```

### Required (Privacy-Preserving) Flow:

```
Settlement Execution (on-chain)
    ↓
TSN Mempool (creates encrypted Private Receipt)
    ↓
Encrypted Storage (ciphertext only in database)
    ↓
Owner Authorization (wallet signature)
    ↓
Device Authorization (device key)
    ↓
Private Session (time-limited, scoped)
    ↓
TSN Private View SDK (openPrivateView(receiptId))
    ↓
Local Decryption (device-only)
    ↓
Temporary Display (in-memory, no persistence)
```

---

## 3. Required Migration Components

### 3.1 Database Migration

| Action | Table | Field | New Storage |
|--------|-------|-------|--------------|
| REMOVE | payments | sender_wallet | Hash commitment only |
| REMOVE | payments | receiver_wallet | Never stored |
| REMOVE | payments | deposit_signature | Encrypted in receipt |
| REMOVE | payments | release_signature | Encrypted in receipt |
| REMOVE | payment_intents | escrow_tx_sig | Never stored |
| REMOVE | payment_intents | claim_tx_sig | Never stored |
| REMOVE | payment_intents | proof_tx_sig | Never stored |
| REMOVE | claim_requests | destination_wallet | Encrypted in receipt |
| REMOVE | users | settlement_wallet_pubkey | Never stored |
| REMOVE | users | recovery_wallet_pubkey | Encrypted backup only |

### 3.2 New Database Tables Required

```sql
-- Encrypted Private Receipts
CREATE TABLE private_receipts (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  tin_reference VARCHAR(64) NOT NULL,
  ciphertext BYTEA NOT NULL,
  encryption_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Device Registry
CREATE TABLE device_registry (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  device_id VARCHAR(128) NOT NULL,
  device_signing_public_key VARCHAR(64) NOT NULL,
  device_encryption_public_key VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, device_id)
);

-- Private Sessions
CREATE TABLE private_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  device_id VARCHAR(128) NOT NULL,
  tin VARCHAR(32) NOT NULL,
  permissions JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 API Changes Required

| Endpoint | Current Behavior | Required Behavior |
|----------|-----------------|------------------|
| `GET /api/payment/[id]` | Returns all signatures | Returns `receipt_id` only |
| `GET /api/payment/[id]/trace` | Returns trace data | **REMOVE ENDPOINT** |
| TSN Private View SDK | N/A | New `openPrivateView(receiptId)` |

### 3.4 Frontend Changes Required

| Component | Current | Required |
|-----------|---------|----------|
| `transaction-detail-experience.tsx` | Displays signatures | Uses `TSNPrivateView` component |
| `PaymentRecord` type | Contains all private fields | Contains `receiptId` only |
| `PaymentDetailResponse.trace` | Contains all signatures | **REMOVE** |
| React state | Stores private settlement data | Never stores |

### 3.5 New TSN Private View SDK Structure

```typescript
// tsn-sdk/src/private-view/index.ts

// State machine for private view lifecycle
export type PrivateViewState = 
  | { status: "locked" }
  | { status: "authorized"; sessionId: string }
  | { status: "available"; decryptedReceipt: PrivateReceipt }
  | { status: "expired" };

// Open private view - returns state machine, not raw data
export async function openPrivateView(params: {
  receiptId: string;
  deviceAuthorization: DeviceSignature;
}): Promise<PrivateViewState>;

// Never expose this to applications
function decryptReceipt(ciphertext: Uint8Array): PrivateReceipt {
  // Device-only decryption
}
```

---

## 4. Logging Violations

**File:** `utils/observability/tracer.ts`

The tracer attempts to sanitize but the patterns are incomplete:

```typescript
// Line 22: SENSITIVE_KEY_PATTERN misses some patterns
const SENSITIVE_KEY_PATTERN = /(privatekey|private_key|secret|seed|mnemonic|token|bearer|authorization|cookie|password|signature|session|apikey|api_key|accesstoken|access_token|refreshtoken|refresh_token)/i;

// Missing patterns:
// - destination_wallet
// - destinationWallet  
// - escrow_tx_sig
// - claim_tx_sig
// - proof_tx_sig
// - released_to_wallet
// - settlement_wallet
```

---

## 5. WhatsApp-Only Login Violation

**Finding:** Users authenticated via WhatsApp-only (no wallet) can currently access payment views.

**Required:** WhatsApp-only auth must have NO access to private settlement information.

---

## 6. Device Identity System - Missing

The architecture requires but currently lacks:

1. **Device Registration Flow:**
   - Device key generation (platform secure storage)
   - Owner signature authorization
   - TSN Device Registry integration

2. **Device Authorization:**
   - Device signature validation
   - Nonce and replay protection
   - Expiration enforcement

3. **Missing from Frontend:**
   - `frontend/src/lib/device.ts` - does not exist
   - No WebAuthn/Passkey integration
   - No secure credential storage

---

## 7. Private Receipt Architecture - Missing

### Current: Direct API Returns

```typescript
// backend/app/services/payment-views.ts
return {
  payment: safePayment,  // Contains ALL private data
  trace: { ... },        // Contains ALL signatures
  // ...
};
```

### Required: Encrypted Receipt Flow

```typescript
// New: backend/app/services/private-receipts.ts
export async function createPrivateReceipt(params: {
  paymentId: string;
  settlementData: SettlementData;
  recipientTin: string;
}): Promise<{ receiptId: string; ciphertext: Uint8Array }> {
  // 1. Build receipt with settlement details
  // 2. Encrypt with ECDH + HKDF-SHA256 + AES-256-GCM
  // 3. Store ciphertext, NOT plaintext
  // 4. Return receipt_id
}

export async function getEncryptedReceipt(params: {
  receiptId: string;
  tin: string;
}): Promise<{ ciphertext: Uint8Array; metadata: EncryptionMetadata }> {
  // Returns encrypted blob only
  // Decryption happens on device
}
```

---

## 8. Migration Checklist

### Phase 1: Database (Critical)

- [ ] Create `private_receipts` table
- [ ] Create `device_registry` table
- [ ] Create `private_sessions` table
- [ ] Add `private_receipt_id` to `payments` table
- [ ] Remove `destination_wallet` from `claim_requests`
- [ ] Remove `escrow_tx_sig`, `claim_tx_sig`, `proof_tx_sig` from `payment_intents`
- [ ] Remove `settlement_wallet_pubkey`, `recovery_wallet_pubkey` from `users`
- [ ] Data migration: encrypt existing receipts

### Phase 2: Backend API

- [ ] Create `PrivateReceiptService`
- [ ] Create `DeviceRegistryService`
- [ ] Create `PrivateSessionManager`
- [ ] Remove `getPaymentDetailForViewer` trace exposure
- [ ] Add device authorization middleware
- [ ] Add private session validation
- [ ] Update logging patterns

### Phase 3: TSN SDK

- [ ] Create `tsn-sdk/src/private-view/` module
- [ ] Implement `openPrivateView()` function
- [ ] Implement device key storage (WebAuthn)
- [ ] Implement ECDH + AES-256-GCM encryption
- [ ] Remove `destinationWallet` from public types

### Phase 4: Frontend

- [ ] Create `TSNPrivateReceipt` component
- [ ] Create `TSNPrivateHistory` component
- [ ] Create `TSNPrivateBalance` component
- [ ] Remove `transaction-detail-experience.tsx` signature display
- [ ] Update `PaymentRecord` type
- [ ] Remove private data from React state
- [ ] Add device registration flow

### Phase 5: Testing

- [ ] Database compromise test
- [ ] Wrong device rejection test
- [ ] Replay signature rejection test
- [ ] Expired session rejection test
- [ ] Revoked device rejection test
- [ ] WhatsApp-only login restriction test
- [ ] Frontend state inspection test
- [ ] Plaintext storage scan test

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `backend/app/db/schema.sql` | New tables, remove columns |
| `backend/app/types/payment.ts` | Remove private fields |
| `backend/app/services/payment-views.ts` | Remove trace exposure |
| `backend/app/db/tsn.ts` | Remove destination_wallet |
| `backend/app/db/users.ts` | Remove settlement_wallet |
| `frontend/src/lib/types.ts` | Remove private types |
| `frontend/src/components/experiences/transaction-detail-experience.tsx` | Use TSNPrivateView |
| `frontend/src/lib/tsn.ts` | Remove destinationWallet exposure |
| `tsn-protocol/tsn-sdk/src/private-settlement.ts` | Internal only |
| `utils/observability/tracer.ts` | Add missing patterns |

## 10. Files to Remove

| File | Reason |
|------|--------|
| `frontend/src/lib/tin-balance.ts` (lines 90-95) | Exposes PRU public keys |
| `tsn-protocol/tsn-mempool-frontend/app/page.tsx` (lines 308-331) | Displays destinationWallet |

## 11. Files to Create

| File | Purpose |
|------|---------|
| `tsn-sdk/src/private-view/index.ts` | Private view SDK |
| `tsn-sdk/src/device/index.ts` | Device management |
| `tsn-sdk/src/sessions/index.ts` | Private session management |
| `tsn-sdk/src/encryption/index.ts` | ECDH + AES-256-GCM |
| `frontend/src/components/tsn-private-view/` | Private view components |
| `frontend/src/lib/device.ts` | Device registration |

---

## 12. Security Considerations

### What Must NEVER Be Exposed:

1. Transaction signatures (deposit, release, escrow, claim, proof)
2. Settlement wallet addresses
3. PRU route addresses
4. Destination wallet
5. Ephemeral keys
6. Private settlement metadata

### What CAN Be Exposed:

1. Payment ID (opaque reference)
2. Amount (after settlement)
3. Status (generic: pending, settled, etc.)
4. Receipt ID (encrypted reference)
5. Explorer links (user-initiated)

### Cryptographic Requirements:

- Use ECDH for key exchange
- Use HKDF-SHA256 for key derivation
- Use AES-256-GCM for encryption
- Bind context: receipt ID + TIN + device + protocol version
- Never store decryption keys in database

---

## 13. Remaining Questions

1. How should PRU public addresses be handled for balance queries?
2. What is the timeout for private sessions?
3. Should we support key rotation for devices?
4. How do we handle device recovery?
5. Should we support multiple devices per TIN?
6. What's the encrypted receipt storage retention policy?

---

## 14. Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)
- [TSN.md](./TSN.md)
- [TSN-COMMITMENT-SETTLEMENT.md](./TSN-COMMITMENT-SETTLEMENT.md)
- [TRANSFER-IDENTITY.md](./TRANSFER-IDENTITY.md)
