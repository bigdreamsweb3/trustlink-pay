# TCAP V2 Devnet preparation

The V2 funding runner requires the canonical TCAP asset infrastructure before
it can deposit liquidity. The required accounts are the asset state, reserve
state, reserve authority PDA, and governed token vault derived from the
classic SPL token program and `TCAP_MINT`.

The setup command is intentionally separate from the V2 funding/credit test.
It submits only TCAP's `initialize_asset_state_v1` infrastructure instruction.
The `v1` suffix names the account layout; this command does not create a V1
payment intent, AcceptedIntent, epoch, receipt, nullifier, TIN, route, or
ZK-PRU account.

## Dry-run the setup

Run from the repository root. Shell values override the checked-in defaults;
the defaults file fills values that are not set. Use a Helius or another
provider Devnet RPC rather than the browser gateway for this operator command.

```bash
export TCAP_RPC_URL="https://devnet.helius-rpc.com/?api-key=<your-key>"
export TCAP_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
export TCAP_TOKEN_PROGRAM="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export TSN_MOTHER_AUTHORITY_WALLET="tsn-protocol/tsn-node/keys/tsn-mother-authority.json"

npm run tcap:asset-state:v2:init:devnet
```

The dry-run prints the canonical addresses and does not write to Devnet. The
command is idempotent: an already-valid set is reported as
`ALREADY_INITIALIZED`; a partial or malformed set fails closed.

## Submit the one-time initialization

Review the dry-run output, then explicitly add `--confirm`:

```bash
npm run tcap:asset-state:v2:init:devnet -- --confirm
```

The payer must have enough Devnet SOL for rent and transaction fees. The
script prints only public addresses and the sanitized transaction signature.
It validates the account owners, discriminators, mint, token program, reserve
binding, and vault authority after confirmation.

## Run the V2 funding and credit scenario

Once setup reports `INITIALIZED` or `ALREADY_INITIALIZED`, run:

```bash
npm run tcap:credit:v2:devnet
```

That scenario performs `deposit_asset_v2` followed by the TSN V2 wrapper and
TCAP `credit_tcap_tin_tip_v2`. It derives the Mother's associated token account
when `TCAP_SOURCE_TOKEN_ACCOUNT` is not set and loads the Devnet tip root from
`protocol-tests/tcap-credit-devnet.defaults.env` when no explicit root is
provided.

The credit transaction is checked against a strict V2 account and instruction
allowlist. Funding token accounts, asset state, reserve state, vault, mint,
epoch/receipt/nullifier PDAs, TIN/route accounts, and ZK-PRU accounts must not
appear in that credit transaction.

## Canonical addresses for the current fixture

These are derived by the setup command for the current Devnet mint; they are
not substitutes for an on-chain presence check:

| Account | Address |
| --- | --- |
| TCAP config | `2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY` |
| Asset state | `Bg2ZJq8jgrjz5iYo5r3LtwSyZFGeMCjyFhfnzzk74iq` |
| Reserve state | `3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d` |
| Reserve authority | `GA9tyfeGYQWa7bcAhY8qQEKvYkjxDze9vSWqvVcueLs7` |
| Governed vault | `2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh` |

