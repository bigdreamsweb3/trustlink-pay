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
window. Set `TRUSTLINK_DEPLOY_TRANSPORT=quic` to try QUIC instead of RPC; use
only one transport. `TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS` can override the
default retry count when Devnet is congested.

Do not run these commands against localnet. After deployment, run only Devnet
preflight, simulation and explicitly approved Devnet transactions.
