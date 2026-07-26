# Implementation Status

## Phase 1: Adaptive ZK-PRU Accumulation (COMPLETED)

### Core Algorithm Fixes
- ✅ `zk-pru-execution-planner.ts`: 8-priority spend selection, 3-case tranche, unified fees
- ✅ `zk-pru-state-manager.ts`: Mutation bugs fixed, return types corrected
- ✅ `zk-pru-receive-accumulator.ts`: Large-receipt isolation, reserve consumption, batch processing
- ✅ `tin-balance-spend-planner.ts`: v1 types removed

### Simulation and Testing
- ✅ `zk-pru-simulator.ts`: 5 scenarios created
- ✅ 15 new tests added (R-AA)
- ✅ 71/71 tests passing
- ✅ `npm run simulate` script added

## Phase 2: Cleanup and Launch Reset (IN PROGRESS)

### Security Hardening
- ✅ Deprecation comments added to legacy security paths
- ⏳ Full removal of server-side decryption (requires frontend SDK wiring)
- ⏳ Full removal of Cranker key access (requires scoped signature flow)

### Legacy Code Removal
- ✅ `ZK-PRU/` standalone directory deleted
- ✅ `project_coach/` deleted
- ✅ `blogger/` deleted
- ✅ `.logs/` deleted
- ✅ `temp_logs/` deleted
- ✅ `protocol-test-runs/` deleted
- ✅ `packages/passkey-wallet/` deleted
- ✅ `tsn-protocol/tsn-epoch-records/` deleted
- ✅ `docs/bkup/` deleted
- ✅ `docs/archive/` deleted
- ✅ `.backups/` deleted
- ✅ `frontend-dev.log` deleted
- ✅ `git-hygiene-report.txt` deleted
- ✅ `project-coach-observations.md` deleted
- ✅ `install-tsn.sh.bak-before-light` deleted
- ✅ `tsconfig.tsbuildinfo` files deleted
- ✅ `backend/test-ledger/*.log` deleted
- ✅ `tsn-mempool-backend/.mempool-store.json` deleted
- ✅ `tsn-cranker-op-daemon/operator-state.json` deleted

### Documentation Cleanup
- ✅ Obsolete docs deleted (66 files)
- ✅ Canonical documentation created:
  - `docs/protocol-architecture.md`
  - `docs/zk-pru.md`
  - `docs/execution-plan-v2.md`
  - `docs/runtime-components.md`
  - `docs/security-model.md`
  - `docs/operations-and-testing.md`
  - `docs/implementation-status.md`

### Nonce Fix
- ✅ One-byte nonce fixed to 4 bytes in `frontend/src/lib/tin-spend-planner.ts`

## Known Issues

### Server-Side Decryption (DEPRECATED)
- `_decrypt_tin_master_seed_payload`: Still active in production
- `_derive_pru_secret_key_base64`: Still active in production
- Required for current PRU spend permit flow
- Will be removed after frontend SDK local decryption is wired

### Cranker Key Access (DEPRECATED)
- `secretKeyBase64`: Still passed in work items
- `Keypair.fromSecretKey`: Still used for user PRU signing
- Will be removed after scoped signature flow is implemented

### Legacy Authorization Format
- `pru_private_commitment_v1`: Still accepted in frontend, backend, Cranker
- Will be removed after v2 adoption is complete

## Next Steps

1. Wire frontend SDK local decryption/derivation
2. Implement scoped spend signature flow
3. Remove deprecated server-side security functions
4. Remove Cranker key access
5. Remove legacy authorization formats
6. Complete remaining cleanup (Sections 3-13)
