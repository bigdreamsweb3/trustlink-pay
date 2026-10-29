# TCAP governed asset-entry Devnet flow

> **Historical debit fixture — not the current TIN settlement procedure.**
> The debit commands below depend on a TCAP TIN-tip account and an owner-local
> encrypted snapshot. Those are not used by the current TSN credit caller, and
> the current GPRU hidden-head proof source does not establish debit
> affordability or end-to-end debit/exit support. Do not run this as a live
> XP debit guide. See [current architecture](./CURRENT-ARCHITECTURE.md).

The current TCAP deposit path is keyed by the governed `asset_entry`. Its
reserve state, reserve authority, and token vault are derived from that entry;
the old standalone `initialize_asset_state_v1` instruction is not part of the
active program interface. Both active deposit instructions bind to the
governed entry: `deposit_asset_v2` for a reserve deposit and
`deposit_with_funding_commitment_v2` for a funding-commitment deposit.

Register and govern an asset with the root `network:init-asset` / asset-admin
workflow, then initialize or synchronize the governed reserve and vault. Check
the resulting on-chain state with `npm run network:status`. The XP deposit
builder supplies the TCAP program ID, governed asset entry, reserve state,
reserve authority, vault, sender token account, mint, and token program to
the selected deposit instruction.

The credit transaction is checked against a strict V2 account and instruction
allowlist. Funding token accounts, asset entry, reserve state, vault, mint,
epoch/receipt/nullifier PDAs, TIN/route accounts, and ZK-PRU accounts must not
appear in that credit transaction.

## Canonical addresses for the current fixture

These are derived by the setup command for the current Devnet mint; they are
not substitutes for an on-chain presence check:

| Account           | Address                                        |
| ----------------- | ---------------------------------------------- |
| TCAP config       | `2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY` |
| Asset state       | `Bg2ZJq8jgrjz5iYo5r3LtwSyZFGeMCjyFhfnzzk74iq`  |
| Reserve state     | `3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d` |
| Reserve authority | `GA9tyfeGYQWa7bcAhY8qQEKvYkjxDze9vSWqvVcueLs7` |
| Governed vault    | `2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh` |

## Run the V2 debit-only test

Debit requires the custody graph to be unified, a V2 tip liability to exist,
and the owner-encrypted snapshot for the live tip commitment to be available.
The runner reads the tip commitment, sequence, policy, and snapshot from the
Devnet fixture, decrypts and verifies that snapshot locally, subtracts the
requested amount, and derives the successor commitment, GPRU scope, and fresh
domain-separated nullifier. It refuses to accept caller-supplied transition
material or to continue on a snapshot/tip or custody-graph mismatch:

```bash
export TCAP_SOURCE_TIP_ROOT=9fd26b1250199d824daabae987161cdeda3861511413181704a9d424b09c5840
export TCAP_DEBIT_AMOUNT=1000000

npm run tcap:debit:v2:devnet
```

`TCAP_SNAPSHOT_KEY_HEX` and `TCAP_SNAPSHOT_STORE_DIR` must point to the same
owner-authorized encrypted snapshot store produced by the credit fixture. The
new encrypted snapshot is written only after the on-chain debit is confirmed.

The transaction is `tsn_register_tcap_debit_authorization_v2`, which CPI-calls
`debit_tcap_gpru_tip_v2`. The runner refuses split entry/state graphs and
checks the liability's available and spent amounts before and after. It also
rejects accounts outside the opaque V2 allowlist; wallet exit, V1 receipts,
epoch accounts, TIN/route accounts, and ZK-PRU accounts are not used.
