# TrustLink Transfer Settlement Network

TSN is the Transfer Settlement Network boundary for TrustLink Pay.

This package owns TSN protocol contracts, the default TSN mempool, and cranker execution surface. It must not import from `backend/app/db`, open backend database connections, or persist TrustLink Pay application records.

## Boundary

- Backend sends payment/claim inputs to TSN through explicit request contracts.
- Backend posts public intent and claim-request work to the TSN mempool.
- Crankers listen to the TSN mempool, not the TrustLink backend database.
- TSN returns protocol results such as intent metadata, settlement status, proof signatures, and cranker assignment data.
- Backend owns all persistence of returned TSN data in the backend database.
- Crankers and external workers consume TSN work through protocol/API contracts, not backend database tables.

## Verified Program

The TSN SDK pins the current verified TSN-compatible escrow program in package code:

```text
BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM
```

Apps using TSN should not pass arbitrary program IDs. If TSN migrates to a new verified program, the SDK package should be upgraded so consumers receive the new pinned program registry. Runtime environment variables are not trusted as the TSN authority source.

## Local Mempool

```bash
npm install
npm run mempool
```

The local mempool listens on `http://localhost:8787` by default and writes to `.tsn/mempool.json`.

## Cranker

```bash
npm run cranker
```

The cranker runner is intentionally inside `/tsn`; backend must not own TSN setup or cranker execution.

## Current Integration

The backend currently uses this package as an in-process protocol module while the HTTP service boundary is introduced. Backend database reads/writes remain in backend repositories only.
