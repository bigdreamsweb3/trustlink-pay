# TrustLink Pay WhatsApp Authentication Flow Documentation

## Overview

This document describes the new WhatsApp-based authentication flow for TrustLink Pay, which replaces the traditional OTP system with a more secure and user-friendly session code mechanism.

## The Problem with Traditional OTP

The current flow requires users to:
1. Type their phone number
2. Wait for WhatsApp opt-in
3. Receive an OTP
4. Copy and paste the OTP back into the app

This creates friction and potential security issues.

## The New Solution: Session Code Authentication

The new flow uses unique, time-limited session codes that users send via WhatsApp to verify their identity automatically.

### Key Benefits

- **Zero Typing**: Users scan QR codes or click links
- **Device-Aware**: Different flows for mobile vs desktop
- **More Secure**: Session-specific codes prevent replay attacks
- **Professional UX**: Similar to WhatsApp Web/Discord login
- **Real-time**: Instant login upon verification using Server-Sent Events
- **Fallback Resilient**: Automatic polling if SSE fails

## Technical Architecture

### 1. Session Code Generation

**Location**: `backend/app/lib/session-codes.ts`

```typescript
// Generates codes like "TL-8821"
const sessionCode = generateSessionCode(); // TL-8821
```

- **Format**: TL-XXXXXX (6 characters)
- **Expiry**: 10 minutes
- **Storage**: In-memory (replace with Redis/DB in production)
- **Prefix**: TL for TrustLink branding

### 2. Device Detection

**Location**: `frontend/src/lib/device-detection.ts`

```typescript
const deviceInfo = detectDevice();
const useQRCode = shouldUseQRCode(deviceInfo);
```

- **Mobile**: Direct WhatsApp link
- **Desktop**: QR code display
- **Fallback**: Manual code entry

### 3. Authentication Flow

#### Phase A: Session Initiation

1. User clicks "Sign in with WhatsApp"
2. Frontend generates unique session ID
3. Backend creates session code (e.g., TL-8821)
4. Code stored with 10-minute expiry

#### Phase B: Device-Aware Verification

**Mobile Users:**
- Display "Open WhatsApp to Verify" button
- Link: `https://wa.me/{businessNumber}?text=Verify%20TLinkPay%20Code:%20TL-8821`
- User taps send, verification happens automatically

**Desktop Users:**
- Display QR code containing the same WhatsApp link
- User scans with phone camera
- Alternative: Manual code entry instructions

#### Phase C: Webhook Processing

**Location**: `backend/app/services/whatsapp-webhook.ts`

```typescript
// Pattern matching for session codes
const sessionCodeMatch = inboundText.match(/Verify\s+TLinkPay\s+Code:\s+(TL-[A-Z0-9]{6})/i);
```

1. WhatsApp webhook receives message
2. Extracts session code and phone number
3. Verifies code is valid and unexpired
4. Links phone number to browser session
5. Issues auth challenge token

#### Phase D: Real-time Login

**Location**: `frontend/src/lib/session-events.ts`

- **Primary**: Server-Sent Events (SSE) for instant updates
- **Fallback**: Polling `/api/auth/session/verify` every 10 seconds
- **Proxy Configuration**: Frontend middleware routes `/backend/*` to backend port 3000
- **Error Handling**: Enhanced logging with URL and readyState information
- **Auto-redirect**: Stops when verification is successful, redirects to dashboard

#### SSE Connection Details

```typescript
// EventSource connection with backend proxy
const eventsUrl = `/backend/api/auth/session/events?sessionId=${this.sessionId}`;
this.eventSource = new EventSource(eventsUrl);

// Enhanced error logging
this.eventSource.onerror = (error) => {
  console.error(`[SessionEvents] EventSource error:`, error);
  console.error(`[SessionEvents] URL attempted:`, eventsUrl);
  console.error(`[SessionEvents] ReadyState:`, this.eventSource?.readyState);
  // Start fallback polling if SSE fails
};
```

## API Endpoints

### POST /api/auth/session
Creates a new session code.

**Request:**
```json
{
  "sessionId": "uuid-string"
}
```

**Response:**
```json
{
  "success": true,
  "sessionCode": "TL-8821",
  "expiresAt": "2024-04-30T12:00:00Z"
}
```

### GET /api/auth/session/events
Real-time session events via Server-Sent Events.

**Request:**
```
GET /api/auth/session/events?sessionId=uuid-string
```

**Response (SSE stream):**
```
data: {"type": "connected"}

data: {"type": "verified", "challengeToken": "jwt-token", "user": {...}, "stage": "pin_verify"}

```

## Security Considerations

### 1. Code Expiration
- Session codes expire after 10 minutes
- Automatic cleanup every 5 minutes

### 2. One-Time Use
- Codes are marked as "verified" after first use
- Prevents replay attacks

### 3. Rate Limiting
- Implement rate limiting on session generation
- Prevents database bloat

### 4. Secure Tokens
- Auth challenge tokens use JWT
- Never expose raw phone numbers

## Implementation Files

### Backend
- `backend/app/lib/session-codes.ts` - Session code management
- `backend/app/services/whatsapp-webhook.ts` - WhatsApp message processing
- `backend/app/api/auth/session/route.ts` - Session creation API
- `backend/app/api/auth/session/verify/route.ts` - Session verification API
- `backend/app/services/session-cleanup.ts` - Cleanup service

### Frontend
- `frontend/src/lib/device-detection.ts` - Device detection utilities
- `frontend/src/lib/session-events.ts` - Real-time session management with SSE
- `frontend/src/components/qr-code-display.tsx` - QR code component
- `frontend/src/components/experiences/new-auth-experience.tsx` - New auth UI
- `frontend/middleware.ts` - Backend proxy configuration for SSE connections

## Migration Guide

### 1. Update Auth Routes
Replace existing auth routes with new session-based flow:

```typescript
// Old route
<AuthExperience redirectTo="/dashboard" />

// New route  
<NewAuthExperience redirectTo="/dashboard" />
```

### 2. Environment Variables
Add business number configuration:

```env
TRUSTLINK_BUSINESS_NUMBER="+1234567890"
```

### 3. Database Schema (Future)
For production, replace in-memory storage with database:

```sql
CREATE TABLE session_codes (
  id UUID PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  status VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);
```

## Testing

### 1. Unit Tests
- Session code generation and validation
- Device detection logic
- QR code data generation

### 2. Integration Tests
- Full authentication flow
- WhatsApp webhook processing
- Real-time polling

### 3. Manual Testing
- Mobile device flow
- Desktop QR code flow
- Fallback manual entry

## Performance Considerations

### 1. Session Storage
- Use Redis for production session storage
- Implement proper connection pooling

### 2. Real-time Communication
- **Primary**: Server-Sent Events for instant updates
- **Fallback**: Exponential backoff polling (10s, 20s, 30s max)
- **Connection Management**: Automatic cleanup on disconnect
- **Proxy Configuration**: Frontend middleware handles backend routing

### 3. QR Code Generation
- Use proper QR code library (qrcode.js)
- Cache generated codes
- Include WhatsApp deep link for mobile scanning

## Monitoring

### 1. Metrics to Track
- Session generation rate
- Verification success rate
- Time to verification
- Device type distribution

### 2. Logging
- Session creation events
- Verification attempts
- Cleanup operations
- Error conditions

## Future Enhancements

### 1. WebSocket Integration
Replace polling with real-time WebSocket connections for instant updates.

### 2. Enhanced QR Codes
- Add TrustLink logo to QR codes
- Use branded colors
- Implement error correction

### 3. Analytics Dashboard
Track authentication patterns and user behavior.

### 4. Multi-Device Support
Allow users to verify across multiple devices simultaneously.

## Troubleshooting

### Common Issues

1. **Session Code Not Working**
   - Check if code expired
   - Verify webhook is receiving messages
   - Check session storage

2. **QR Code Not Scanning**
   - Ensure QR data is properly encoded
   - Check QR code size and contrast
   - Test with different devices

3. **Real-time Updates Not Working**
   - Verify SSE connection is established
   - Check frontend middleware proxy configuration
   - Ensure backend is running on port 3000
   - Fallback polling should activate automatically
   - Check browser console for EventSource errors

### Debug Mode

Enable debug logging:

```typescript
logger.setLevel("debug");
```

This will provide detailed information about the authentication flow.

## Recent Improvements

### SSE Integration
- **Real-time Updates**: Server-Sent Events provide instant verification
- **Proxy Configuration**: Frontend middleware routes backend requests
- **Enhanced Error Handling**: Better logging and fallback mechanisms
- **Connection Management**: Automatic cleanup and reconnection logic

### Architecture Updates
- **Port Configuration**: Frontend (3001) ↔ Backend (3000) communication
- **Middleware Setup**: `/backend/*` routes to backend server
- **Event Source**: Dedicated SSE endpoint for session events
- **Fallback System**: Polling activates if SSE fails

### Development Setup
Ensure both servers are running:
```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend (port 3001)  
cd frontend && npm run dev
```

The middleware.ts in the frontend handles proxying requests between the servers.
