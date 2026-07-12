# Session Flow

The session flow lets a user approve a TrustLink login or sensitive action through WhatsApp.

WhatsApp helps confirm the user is controlling the phone number.

WhatsApp does not prove TIN ownership by itself.

## Full Flow

1. Backend creates a session code.
2. Frontend shows WhatsApp handoff options.
3. User opens WhatsApp.
4. User sends the session code to the TrustLink WhatsApp number.
5. Meta sends the inbound message to the backend webhook.
6. SDK reads the session code from the message.
7. SDK finds the session through the sessions port.
8. SDK sends a session review request.
9. User replies APPROVE SESSION or DECLINE SESSION.
10. SDK verifies the pending session through the sessions port.
11. SDK asks the host app to issue a challenge token.
12. SDK asks the host app to notify the waiting frontend session.

## Frontend Responsibility

The frontend should:

- request a session code from the backend
- show a WhatsApp link or QR code
- wait for backend confirmation
- continue only after the backend confirms the session

The frontend should not:

- verify WhatsApp webhooks
- issue challenge tokens
- mark sessions approved
- call backend SDK functions directly

## Backend Responsibility

The backend should:

- create session codes
- store session records
- configure SDK ports
- receive Meta webhooks
- verify webhook signatures
- process webhook payloads with the SDK
- notify the waiting frontend session after approval

## Session Code

The SDK session code format is:

    TLS + 6 random uppercase characters

Example:

    TLSA1B2C3

Legacy codes with the old prefix can still be detected if supported by the SDK parser.

## Review Message

After receiving a valid session code, the SDK sends a review message asking the user to approve or decline.

The approval reply is:

    APPROVE SESSION

The decline reply is:

    DECLINE SESSION

## Approval Result

When a session is approved, the SDK calls:

    auth.issueChallengeToken
    auth.sanitizeUser
    auth.notifySessionVerification

The host app decides what the challenge token means.

## Decline Result

When a session is declined, the SDK calls:

    sessions.markSessionDeclined

Then it sends a decline confirmation message.

## Expired Or Invalid Session

If a session code is expired, invalid, or missing, the SDK sends an invalid session message.

The host app remains the source of truth for session status.

## Security Rule

A WhatsApp approval only approves the host app session flow.

It must not directly create a TIN, move funds, derive PRUs, or authorize TSN settlement.
