# Devnet build and deploy

TrustLink program builds and deployments are Devnet-only. There is no localnet
workflow for these programs.

## Why `--no-idl`

The deploy artifact is the SBF `.so`. Full Anchor IDL generation can fail on a
host Rust 1.94 toolchain with Anchor 0.30.1 and the `proc-macro2` macro chain.
The supported deployment path therefore stabilizes lockfiles, runs the deploy
doctor, builds with `anchor build --no-idl`, and deploys the resulting SBF
artifact. The helper prints:

> IDL generation skipped due to host toolchain compatibility; deploying SBF artifact only.

## One-click commands

The helper uses the existing cross-platform WSL forwarding pattern. When
invoked from Windows, it forwards lockfile stabilization, doctor checks,
Anchor/SBF builds, and Solana deployment commands into Ubuntu/WSL before any
Devnet action starts. No localnet path exists.

From the repository root in Ubuntu/WSL, configure the existing Devnet RPC and
authorized upgrade wallet:

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export SOLANA_WALLET="$ANCHOR_WALLET"
```

You may explicitly enter Ubuntu first if needed:

```powershell
wsl.exe -d Ubuntu
```

Then run the npm command inside the Ubuntu prompt. The repository path is
normally `/mnt/c/Users/codepara/Desktop/trust-link`.

Deploy both programs, TSN first and TCAP (Transfer Confidential Asset Protocol) second:

```bash
npm run programs:devnet:deploy
```

Deploy one program:

```bash
npm run tsn:program:deploy:devnet
npm run tcap:program:deploy:devnet
```

Build only (no Devnet write):

```bash
npm run tsn:program:build:devnet
npm run tcap:program:build:devnet
```

Each command runs `deploy:lockfiles:stabilize`, `deploy:doctor`,
`anchor build --no-idl`, `solana program deploy`, and `solana program show`.
It prints the working directory, safely redacted RPC host, wallet path,
program ID, artifact path, build mode and deploy result.

The expected Devnet program IDs are:

```text
TSN  TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
TCAP TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x
```

### Required upgrade gate before credit bootstrap

Run the TCAP deploy command after any change to the on-chain account layout or
instruction ABI. In particular, `migrate_tcap_config_layout_v1` is required to
convert the older Devnet config account. Running the bootstrap before this
upgrade produces `InstructionFallbackNotFound`; that means the old bytecode is
still deployed and no migration occurred.

Verify the deployed program after the upgrade and record the new `Last Deployed
In Slot` value before continuing:

```bash
solana program show TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x \
  --url "$ANCHOR_PROVIDER_URL"
```

Only after the slot changes should you run the config migration/bootstrap.

The deploy helper uses RPC submission, `confirmed` commitment, and 20 signing
attempts by default because large SBF upgrades can exceed a single blockhash
window. It only pre-extends an existing ProgramData account when the artifact
does not fit; an artifact that already fits skips the extension transaction.
Set `TRUSTLINK_DEPLOY_TRANSPORT=quic` to try QUIC instead of RPC; use only one
transport. `TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS` can override the default retry
count when Devnet is congested.

Do not run these commands against localnet. After deployment, run only Devnet
preflight, simulation and explicitly approved Devnet transactions.

## TCAP credit bootstrap defaults

`npm run tcap:credit:bootstrap:devnet` automatically loads the checked-in
non-secret record directory at
`protocol-tests/tcap-credit-devnet.defaults.env`. It contains the current
Devnet program IDs, governed Stable-TCAP mint and stable PDA addresses so the
bootstrap can be run as one command. Shell environment values still override
the defaults for an intentional record update.

The bootstrap derives every canonical PDA and verifies that the corresponding
Devnet account exists and is owned by the expected program. Defaults do not
provide private keys, authorization commitments, roots, nullifiers or intent
data; those remain explicit owner/TSN inputs and the bootstrap refuses to
fabricate them. When governed Devnet records or program deployments change,
update the defaults file and re-run the bootstrap verification before using
the generated `protocol-tests/tcap-credit-devnet.env`.

When `TCAP_INTENT_COMMITMENT` is not supplied, bootstrap derives the controlled
Devnet payment commitment as SHA-256 over the domain
`TSN_PAYMENT_INTENT_COMMITMENT_V1`, followed by the ordered fields
`epoch_id`, `amount`, `token_id`, token mint, tip-root commitment, policy
commitment, replay nonce, validity window, TSN settlement commitment, asset
commitment and GPRU-scope commitment. These fields must still be supplied by
the authorized Devnet payment setup. The resulting intent is funded and
accepted in one transaction containing `tsn_fund_epoch_treasury` followed by
`tsn_accept_intent`; if the wallet token account or balance is absent, the
bootstrap fails instead of fabricating a payment.

The checked-in Devnet defaults use `TCAP_AMOUNT=1`, one base unit. The governed
Stable-TCAP fixture uses two decimals, so this represents `0.01 TCAP`;
bootstrap verifies the mint account's live decimals before it
can submit funding. Change the amount or `TCAP_MINT_DECIMALS` only when the
governed Devnet mint record changes, and do not add authorization secrets to
the defaults file.
