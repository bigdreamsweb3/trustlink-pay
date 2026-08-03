# TSN Receiver

The Receiver is the durable Firebase-backed ingress, status, and work-publication service for TSN. It does not verify cryptographic plans, decrypt TIN data, derive ZK-PRUs, sign transactions, or hold protocol authority.

State flow:

`RECEIVED -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED -> SUBMITTED -> CONFIRMED`

The TSN Node is the only service allowed to move work from `RECEIVED` to `VERIFIED`. Crankers can lease only `VERIFIED` work. All leases and transitions use Firestore transactions and monotonic state versions.

The service is suitable for Vercel's Node.js runtime. Firebase credentials and both service credentials are server-only environment variables. Browsers receive none of them.
