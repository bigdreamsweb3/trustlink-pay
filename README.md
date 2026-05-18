# Transfer Identity Number System (TINS)

> Payment-ready identity for Solana. Receive funds using a 10-digit number instead of a wallet address.

TINS is a production-ready identity system on Solana. Users create a TIN (Transfer Identity Number) and receive payments privately - the main wallet stays completely off-chain.

## Why TINS

- **10-digit identity** like bank account numbers
- **Privacy-first** - main wallet never on-chain
- **Verification** - see recipient name before sending
- **Multi-sig recovery** - 2/3 wallets to change

## Quick Start

```bash
# Build program
cd transfer-identity-number-system-\(TINS\)/program
cargo build-bpf

# Deploy
solana program deploy target/deploy/tins.so --url devnet
```

## Create a TIN

```typescript
import { Tins } from '@trustlink/tins-sdk';

const tins = new Tins(connection, payerWallet);

// 1. Generate privacy key from main wallet
const privacyKey = tins.derivePrivacyKey(mainWallet);

// 2. Register TIN
const tx = await tins.registerTin({
  displayName: 'John Doe',
  privacyPubkey: privacyKey.publicKey,
  recoveryWallets: [recoveryWallet1, recoveryWallet2],
});

await tins.sendTransaction(tx);
```

## Payment Flow

```
Sender looks up TIN → Gets privacy_pubkey + display_name → Sends to escrow → Recipient claims
```

## Security

| On-Chain | Off-Chain |
|----------|-----------|
| TIN | Main wallet |
| display_name | Private keys |
| privacy_pubkey | Recovery wallets |

**Multi-sig**: Need 2/3 recovery wallets to rotate
**24hr cooldown**: Time to detect suspicious activity

## Fees

| Action | Fee |
|--------|-----|
| Create TIN | 0.01 SOL |
| Rotate wallet | 0.005 SOL |
| Add recovery | 0.002 SOL |

All fees go to team treasury for development/maintenance.

## Architecture (Inspired by SNS)

TINS uses Solana Name Service patterns:
- Account-based registration (familiar on Solana)
- PDA-driven registry (battle-tested)

Key difference from SNS:
- TINS uses **escrow routing** - payments go to escrow first
- **Main wallet never visible** - only derived privacy key on-chain

## Project Structure

```
trustlink-pay/
├── transfer-identity-number-system-(TINS)/  # TINS - IDENTITY
│   └── program/                              # On-chain program
├── tsn/                                    # TSN - SETTLEMENT
├── frontend/                                # dApp
├── backend/                                # API
└── docs/                                   # Documentation
```

## Documentation

| Doc | Description |
|-----|-------------|
| [TINS README](./transfer-identity-number-system-(TINS)/README.md) | Full TINS guide |
| [TINS-OPERATOR](./docs/TINS-OPERATOR.md) | Complete operator guide |
| [SECURITY](./docs/SECURITY.md) | Security model |
| [ARCHITECTURE](./docs/ARCHITECTURE.md) | System design |

## Integration

TINS integrates with **TrustLink Pay** and **TSN**:
- TINS provides identity lookup (TIN → privacy key)
- TSN routes payments through escrow
- TrustLink Pay frontend provides UX

---

*Part of TrustLink Pay ecosystem - Privacy-first payments*