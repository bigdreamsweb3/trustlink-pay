# TSN Epoch Records

Immutable on-chain and off-chain settlement records for the Transfer Settlement Network (TSN) epoch system.

## What it stores

- **Epoch settlements**: Each epoch cycle (7-hour window) settlement data
- **Cranker payouts**: Which cranker executed which payment intents
- **Proof submissions**: Proof of Payment records for reimbursement
- **Vault reimbursements**: Liquidity provider epoch reconciliation
- **Audit trails**: Complete settlement audit log

## Data Structure

```
epoch-records/
└── epochs/
    └── {epoch_number}/
        ├── settlement.json    # Epoch settlement summary
        ├── cranker-payouts/  # Per-cranker execution records
        ├── proofs/           # Proof of Payment submissions
        └── vaults/           # Vault reimbursement data
```

## Purpose

TSN uses a 7-hour epoch reimbursement cycle. This folder stores:
- Historical settlement data for dispute resolution
- Analytics on Cranker performance
- Vault liquidity tracking
- Audit records for compliance

## Related

- [trustlink-pay](https://github.com/bigdreamsweb3/trustlink-pay) - Main project
- [tsn](https://github.com/bigdreamsweb3/tsn) - TSN protocol
- [cranker-op-daemon](https://github.com/bigdreamsweb3/cranker-op-daemon) - Cranker operations