# Protocol-tests: TCAP credit smoke

The protocol-test orchestrator now runs the live GPRU/TCAP credit-tip smoke
through `protocol-tests/scenarios/tcap-credit-smoke.mjs`. It invokes
`tcap-protocol/scripts/devnet-credit-smoke.mjs`; it does not use the retired
funding-claim or `deposit_with_funding_commitment_v1` path.

## Wallet and RPC

Use an existing Solana JSON keypair file. Do not commit it or place it in
`protocol-test-runs`.

For a disposable local test wallet, generate one with the repository helper
(the file is intentionally local and must never be committed):

```powershell
node protocol-tests/tools/create-test-wallet.mjs
```

The default output is `protocol-tests/tcap-devnet-test-wallet.json`. Fund its
public key with Devnet SOL before submitting transactions.

```powershell
$env:TRUSTLINK_TEST_WALLET_KEYPAIR = 'C:\secure\devnet\credit-wallet.json'
# SOLANA_WALLET is accepted when TRUSTLINK_TEST_WALLET_KEYPAIR is unset.
$env:TCAP_RPC_URL = $env:ANCHOR_PROVIDER_URL
```

The wallet precedence is:

1. `TRUSTLINK_TEST_WALLET_KEYPAIR`
2. `SOLANA_WALLET`
3. the repository's normal Solana CLI wallet path (`~/.config/solana/id.json`)

RPC precedence is:

1. `TCAP_RPC_URL`
2. `ANCHOR_PROVIDER_URL`
3. `SOLANA_RPC_URL`

The wallet file must be a Solana CLI JSON secret-key array. Raw private-key
strings, base58 secrets, seed phrases, and `PRIVATE_KEY` environment variables
are intentionally unsupported.

## Preflight without submitting

```powershell
node protocol-tests/scenarios/tcap-credit-smoke.mjs --dry-run
```

This validates the configured RPC and wallet file and prints only the public
key/fingerprint. It does not contact the TCAP transaction script or submit a
transaction.

## Run the complete protocol-test orchestrator

After TSN and TCAP are deployed and the required non-secret TCAP/Mother/epoch
accounts and authorization variables are set:

```powershell
node protocol-tests/orchestrator/run-full-protocol.mjs
```

The scenario writes sanitized status/evidence through the existing
`protocol-test-runs` reporting pipeline. Private keys and snapshot secrets are
never written to reports.

The smoke still requires the non-secret TCAP authorization/account variables
listed in [tcap-devnet-credit-smoke.md](tcap-devnet-credit-smoke.md). It does
not implement confidential debits or exits and does not modify TIN ABI fields.
