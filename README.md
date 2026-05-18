# TrustLink Pay

> Blockchain payments as familiar as mobile money. Privacy built into settlement.

TrustLink Pay brings identity-first payments to Solana. Users send stablecoins to a phone number instead of a wallet address. Funds settle privately through the Transfer Settlement Network (TSN), with liquidity provided by Cranker operators.

## The Problem

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen daily because they solved identity-first payments.

TrustLink Pay brings that UX to Solana with built-in privacy and open infrastructure.

## Quick Start

```bash
# Backend (requires Neon database)
cd backend && npm install && tsx scripts/init-db.ts && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Documentation

| Guide | Description |
| --- | --- |
| [Protocol](./docs/PROTOCOL.md) | Technical specification and payment flows |
| [Integration](./docs/INTEGRATION.md) | How to integrate TrustLink Pay |
| [API Reference](./docs/API.md) | API endpoints and types |
| [Operator Guide](./docs/OPERATOR.md) | Running a Cranker settlement node |
| [Security](./docs/SECURITY.md) | Security model and disclosures |
| [Developer FAQ](./docs/FAQ.md) | Common development questions |

## Project Structure

```
trustlink-pay/
├── frontend/              # Next.js dApp
├── backend/              # API and services  
├── tsn/                  # Transfer Settlement Network
│   ├── protocol/         # Smart contracts
│   ├── cranker-sdk/      # Operator SDK
│   └── mempool/          # Mempool infrastructure
├── trustlink-whatsapp-sdk/ # WhatsApp integration
├── tsn-mempool/         # Mempool service
└── docs/                # Full documentation
```

## Key Concepts

- **Phone-Number Identity**: Send to a phone number, not a wallet
- **TSN Privacy**: Settlement separates sender and recipient wallets
- **Cranker Operators**: Execute payments, earn from volume
- **Liquidity Providers**: Fund vaults, earn 87% of fees