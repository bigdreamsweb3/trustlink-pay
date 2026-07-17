# TSN Private View implementation backlog

**Archived:** 2026-07-17  
**Status:** Architecture exists; live frontend integration is incomplete  
**Priority:** Security-critical

## Decision

TrustLink Pay must not reveal a settlement wallet merely because an application login session exists. Sensitive identity data is displayed only through TSN Private View after an owner-authorized device proves possession of its device key.

Until that complete path is implemented, the product may display **Privately verified**, but it must not expose the underlying settlement or recovery wallet address. A cosmetic eye button or a browser-only visibility toggle is not private authorization.

## Already implemented

- TSN device-registration challenge API.
- Wallet-rooted device authorization claims and signature verification.
- Authorized-device persistence using public keys, fingerprints, commitments, permissions, and status.
- Device proof-of-possession private-session API.
- Private-session and request-nonce persistence.
- Encrypted receipt and device key-envelope persistence contracts.
- TSN SDK authorization, session, encryption, and private-view foundations.
- A frontend `TsnPrivateView` shell, currently disconnected and containing placeholder TODOs.

Primary references:

- [`docs/TSN-DEVICE-AUTHORIZATION.md`](../TSN-DEVICE-AUTHORIZATION.md)
- [`docs/TSN-USER-OWNED-PRIVATE-DATA.md`](../TSN-USER-OWNED-PRIVATE-DATA.md)
- [`docs/audits/TSN-V1-PRIVACY-CURRENT-STATE.md`](../audits/TSN-V1-PRIVACY-CURRENT-STATE.md)
- [`frontend/src/components/tsn-private-view/TsnPrivateView.tsx`](../../frontend/src/components/tsn-private-view/TsnPrivateView.tsx)

## Remaining implementation

1. Generate a device signing key and device encryption key in the browser.
2. Store private device keys in a user-controlled browser key store; private keys must be non-exportable where platform support allows it.
3. Bind the device identifier and public-key fingerprints to the authenticated account session.
4. Require the TIN owner wallet to sign the canonical TSN device-authorization message.
5. Register the device through the existing challenge and registration APIs.
6. Create private sessions using a device-signed proof-of-possession request.
7. Require device-signed proofs for every sensitive read; an application access token alone is insufficient.
8. Encrypt settlement-wallet and recovery-authority private-view payloads and create envelopes for authorized devices.
9. Fetch ciphertext and the correct device envelope, unwrap and decrypt locally, and render plaintext only inside Private View.
10. Clear decrypted values on close, timeout, session expiry, device revocation, logout, and page teardown.
11. Connect automatic Private View containers in Identity and Security only after steps 1–10 work end to end.
12. Add device listing, revocation, replacement-device authorization, and recovery UX.

## Mandatory-login policy

- WhatsApp authentication and PIN establish the TrustLink application session.
- A successful new application login invalidates older application sessions.
- Device authorization is mandatory before private identity values can be revealed.
- Public pages must never initialize wallet connection or device authorization.
- Wallet connection is requested only inside the protected authorization flow.
- A device that is not authorized sees **Privately verified**, never the private value.
- An authorized device with an active private session automatically decrypts and renders permitted values; no eye button or second wallet signature is required.

## Acceptance criteria

- The backend never returns plaintext settlement or recovery wallet data through the ordinary `/api/identity` response.
- A copied access token cannot reveal private data without a valid device key and device-signed proof.
- An authorized device can reveal its permitted data after local decryption.
- Private View containers reveal automatically when device and session authorization are valid.
- A revoked or replaced device cannot create a new private session or receive future envelopes.
- A second completed login invalidates the first application session.
- Private values disappear after the configured viewing window and are not persisted in React state, local storage, logs, analytics, or caches.
- Automated tests cover signature substitution, replay, expired nonce, wrong TIN, wrong device, revoked device, expired session, and ciphertext tampering.

## Do not ship

- Do not reveal a wallet from `user.walletAddress`, `settlement_wallet_pubkey`, or another legacy database field based only on application authentication.
- Do not call a value private merely because it is masked with CSS.
- Do not store decrypted wallet values in local storage, session storage, query caches, logs, or analytics.
- Do not make wallet connection global or initialize it on public pages.
- Do not add redundant eye-button authorization after the device has already been authorized.
