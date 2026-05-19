# @trustlink/tsn-cranker-sdk

This package is the **standalone Cranker runner SDK** for the TSN (Proof of Payment) settlement layer.

Status: **scaffold only** — it wraps Anchor `program.methods.*` for the new TSN instructions added to the `trustlink-escrow` program.

## Quick Start

1. Install deps
2. Copy `.env.example` -> `.env`
3. Build + run:

```bash
npm install
npm run build
npm run cranker
```

## Notes

- You must provide an Anchor `Program` instance created from the program IDL.
- This SDK intentionally does **not** embed an IDL yet (keeps extraction clean later).
- In M4, pooled token liquidity is held by **program-owned Cranker vault PDAs** (not by the Cranker operator wallet). The operator wallet primarily needs SOL for transaction fees.
- For the current reference implementation and testing flow, use `/tsn/scripts/cranker.ts`, `/tsn/scripts/setup.ts`, and the TSN mempool server.
