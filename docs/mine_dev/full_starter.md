Run these from the repository root in **PowerShell/CMD**.

**1. Configure Security Keys**

```bat
npm run tsn:security:keys
```

Copy the generated:

- Public key → `frontend/.env.local` as `NEXT_PUBLIC_TSN_ROUTE_ENCRYPTION_PUBLIC_KEY`
- Secret key → `tsn-mempool-backend/.env` as `TSN_ROUTE_ENCRYPTION_SECRET_KEY`
- Permit signer secret → `tsn-mempool-backend/.env` as `TSN_PERMIT_SIGNER_SECRET_KEY`
- Shared worker API key → `backend/.env.local`, `tsn-mempool-frontend/.env.local`,
  `tsn-mempool-backend/.env`, and `tsn-cranker-op-daemon/.env`

**2. Structural Checks**

```bat
npm run tsn:check:types
cargo check --manifest-path tins-registrar/program/Cargo.toml
cargo check --manifest-path tsn/protocol/programs/trustlink-escrow/Cargo.toml
```

**3. Build TSN Program and SDKs**

```bat
npm run tsn:secure:rebuild
```

This builds the TSN program, TSN SDK, Cranker SDK, reinstalls SDKs in consumers, and clears Next.js caches.

**4. Run Cryptographic Tests**

```bat
npm run tsn:security:test
```

**5. Run TSN Anchor Tests**

```bat
npm run tsn:program:test
```

**6. Deploy TSN**

```bat
npm run tsn:secure:deploy
```

Or deploy without rebuilding everything:

```bat
npm run tsn:program:deploy
npm run tsn:sdk:refresh
```

Configure the deployed private-settlement permit signer:

```bat
npm run tsn:private:configure -- <mother-authority-keypair.json> <permit-signer-pubkey> <rpc-url>
```

The permit signer public key is printed by `npm run tsn:security:keys`.

**7. Build and Deploy TINS**

```bat
npm run tins:build
npm run tins:deploy
npm run tsn:sdk:refresh
```

**8. Start Application Stack**
Terminal 1:

```bat
npm run dev:tsn:stack:+mempool-be
```

Terminal 2:

```bat
npm run tsn:cranker:start
```

Alternatively, run everything including the Cranker:

```bat
npm run dev:tsn:fullstack
```

**9. Monitor the System**

```bat
npm run tsn:mempool:status
npm run tsn:verifier:info
npm run tsn:treasury:info
```

Open:

```text
Frontend:    http://localhost:3001
Backend:     http://localhost:3000
Mempool API: http://localhost:8000
Mempool UI:  http://localhost:3002
```

**10. End-to-End Test Order**

1. Create/send payment in frontend.
2. Sign sender authorization and escrow transaction.
3. Confirm mempool reports a pending intent.
4. Start Cranker.
5. Confirm status progresses through `pending → escrowed → executed`.
6. Confirm the authenticated claim lease and payout nullifier appear in Cranker logs.
7. Confirm recipient receives payout.
8. Confirm recovery job appears.
9. Confirm escrow liquidity returns to the settlement Cranker vault.
10. Run:

```bat
npm run tsn:mempool:status
npm run flow:check
```

Do not use `tsn:mempool:cancel` during this test unless you intentionally want to clear failed work.
