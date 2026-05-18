# Backend Cleanup - Remove Deployment Code

## What's Removed

### Deployment Scripts to Remove

These files are deployment-specific and not needed for runtime:

```
backend/scripts/
├── deploy-mainnet.sh          # ❌ Remove
├── deploy-devnet.sh           # ❌ Remove  
├── upgrade-program.sh        # ❌ Remove
├── verify-deployment.sh      # ❌ Remove
└── migrate-state.sh          # ❌ Keep only if migration needed
```

### Anchor Artifacts

Remove build artifacts - they should be rebuilt from source:

```
backend/
├── target/                   # ❌ Remove (rebuild from source)
├── .anchor/                # ❌ Remove
└── programs/               # If any local program code - move to tsn/protocol/
```

### Build Scripts

```
backend/scripts/build.sh      # ❌ Remove (use npm run build)
backend/scripts/clean.sh     # ❌ Remove 
```

## What's Kept

Runtime essential scripts:

```
backend/scripts/
├── init-db.ts              # ✅ Keep - database setup
└── migrate.ts             # ✅ Keep - if migration needed
```

## TINS Program ID Reference

| Program | Devnet | Mainnet |
| --- | --- | --- |
| TINS | `5D2zKog251d6KPCyFyLMt3KroWwXXPWSgTPyhV22K2gR` | TBD |
| Escrow | `Gx4M8KpDqJ2qJqJ2qJqJ2qJ2qJ2qJqJ2qJ2qJ2` | TBD |

## Commands to Build Programs

```bash
# TINS
cd transfer-identity-number-system-\(TINS\)/program
cargo build-bpf
solana program deploy target/deploy/tins.so --url devnet --keypair <keypair>

# TSN Escrow  
cd tsn/protocol/programs/trustlink-escrow
cargo build-bpf
solana program deploy target/deploy/trustlink_escrow.so --url devnet --keypair <keypair>
```