# TrustLink Pay Vercel Deployment Notes

**Version / commit reference:** deployment hotfix after `78a0e59` (`TSN: Add settlement-token/OTDT, claim-lease & recovery runtime + Python cranker daemon; frontend send refactor and docs`)  
**Scope:** Frontend and backend Next.js builds that consume local TINS, SAS, TSN, Cranker, OTDT, and settlement-token packages in the TrustLink Pay monorepo.

## Summary

TrustLink Pay deploys as a monorepo: the public app lives in `frontend`, the API runtime lives in `backend`, and both consume the local `@trustlink/tsn-sdk` package from `tsn-sdk`. The TSN SDK now includes settlement-token primitives, OTDT helpers, mempool runtime types, and Cranker-facing operations. That is the correct architecture, but it also means Vercel must compile and trace local packages that sit outside the individual Next.js project directory.

This hotfix makes the Next.js deployment boundary explicit. We trace files from the repository root, transpile the local TSN SDK and Solana token package where the browser app needs them, and keep server-only Solana packages externalized in the backend so Vercel does not try to over-bundle the TSN control plane.

## What changed

### Frontend deployment boundary

The frontend `next.config.mjs` now derives the repository root from the config file path instead of relying on the process working directory. This matters because local builds, `npm --prefix frontend run build`, and Vercel monorepo builds can start from different working directories.

The frontend build now transpiles:

- `trustlink-whatsapp-sdk` for WhatsApp-only social confidence verification.
- `@trustlink/tsn-sdk` for TINS and TSN browser subpath imports such as `@trustlink/tsn-sdk/tins`, `@trustlink/tsn-sdk/payment-authorization`, and `@trustlink/tsn-sdk/sponsored-settlement`.
- `@solana/spl-token` because sponsored TSN settlement transaction construction imports SPL token helpers inside the browser bundle.

The browser webpack fallback explicitly blocks accidental bundling of Node-only modules such as `fs`, `net`, `tls`, `dns`, and `child_process`. Those modules belong in TSN server, mempool, and Cranker runtimes, not in the user-facing browser bundle.

### Backend deployment boundary

The backend `next.config.mjs` now also traces from the repository root and transpiles `@trustlink/tsn-sdk`. It externalizes Solana runtime packages used by TSN server code:

- `@solana/web3.js`
- `@solana/spl-token`
- `@coral-xyz/anchor`

This keeps backend API routes aligned with the TSN SDK while reducing the chance that Vercel serverless bundling rewrites Solana or Anchor internals incorrectly.

## Implementation notes

### TypeScript / Next.js components

- `frontend/next.config.mjs` is browser-runtime oriented. It supports TINS resolution, SAS-facing UI flows, and TSN send authorization without exposing raw wallet addresses, balances, or phone numbers in the UI.
- `backend/next.config.mjs` is server-runtime oriented. It keeps TSN, mempool, SAS validation, and Cranker-facing operations on the server side.
- `sync-sdk.js` remains the local SDK refresh step. The frontend and backend `prebuild` scripts run it before `next build`, ensuring the local `@trustlink/tsn-sdk/dist` artifacts match the current branch.

### Python Cranker daemon

The Python Cranker daemon is not part of the Vercel browser deployment. Operators run it separately so it can monitor the TSN mempool runtime, verify intent work, acquire claim leases, use OTDT-gated settlement-token decryption, submit settlement proofs, and execute smart recovery jobs. Keeping it outside Vercel protects Cranker DNA secrets and settlement-token master material from the public web runtime.

## Usage examples

### Frontend deployment build

```bash
npm --prefix frontend install
TSN_SETTLEMENT_TOKEN_MASTER_KEY=local-development-only npm --prefix frontend run build
```

### Backend deployment typecheck

```bash
npm --prefix backend install
npm --prefix backend run typecheck
```

### TSN SDK refresh

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=local-development-only npm --prefix tsn-sdk run build
```

### Python Cranker daemon syntax check

```bash
python -m py_compile tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

## Security and privacy considerations

- The browser bundle must only use TINS and TSN SDK subpaths that are safe for user-side authorization and transaction construction.
- Node-only TSN operations, including JSON mempool persistence, settlement-token master-key operations, OTDT issuance, Cranker DNA checks, and recovery execution, remain server or daemon concerns.
- The frontend must never display raw wallet addresses, balances, phone numbers, or decrypted settlement payloads. The UI should continue to speak in TINS identities, SAS verification state, and TSN settlement state.
- WhatsApp remains the only social confidence channel. Any phone data handled by the backend must remain encrypted at rest and gated by wallet authorization.
- Confidential transfer TF flows remain conceptual and must not be wired to live swaps or real asset movements until audited.

## Testing notes

Use these checks before opening or merging a deployment hotfix:

1. Build the TSN SDK so local `dist` artifacts match the current branch.
2. Typecheck the backend API runtime.
3. Compile the Python Cranker daemon to catch syntax errors in operator automation.
4. Run the frontend build in an environment where frontend dependencies can be installed from npm. If the local environment cannot access the npm registry, treat the install/build as an environment warning and rely on Vercel logs plus the config checks above.

The expected end-to-end TSN runtime remains unchanged: payment intent creation creates an encrypted settlement token, intent work grants claim points, claim leases gate OTDT use, settlement proofs mark registry entries recoverable, and smart recovery returns liquidity through Cranker-executed recovery work.
