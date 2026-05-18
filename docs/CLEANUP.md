# Backend Cleanup

## Current State

The backend is already clean. Anchor programs are in `tsn/protocol/programs/`:
- ✅ `trustlink-escrow` - TSN payment escrow
- ✅ **NEW**: `tins` - TINS identity program

## Optional Cleanup (for production)

### Test/Dev Scripts
```
backend/scripts/
├── test-*.ts         # ❌ Remove in production
├── reset-db.ts      # ❌ Remove in production
```

### Legacy Docs
```
backend/README.md    # ✅ Can remove (docs/ have full coverage)
```

## Keep (Runtime Essential)

```
backend/scripts/
├── init-db.ts              # ✅ Required - database setup
├── autoclaim-worker.ts   # ✅ Required - if using auto-claim
```

## TINS Program

**Location**: `tsn/protocol/programs/tins/`

**Build**:
```bash
cd tsn/protocol/programs/tins
cargo build-bpf
```

**Deploy**:
```bash
solana program deploy target/deploy/tins.so --url devnet
```

**Features**:
- Secure TIN generation (HMAC-based, non-sequential)
- Display name for anti-scam verification  
- Privacy keys (derived from main wallet)
- Rate limiting (100 TINs/hour per owner)