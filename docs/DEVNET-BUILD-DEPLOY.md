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

## TIP-only retry and visible upload progress

`npm run programs:devnet:deploy:all` runs TIP first, then the separate TSNP/TCAP/GPRU wrapper. A successful TIP build does not establish a successful deploy, and an interrupted TIP stage prevents that invocation from reaching the later wrapper. If the other three binaries already match chain, retry TIP alone from the same configured WSL prompt:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
TRUSTLINK_DEPLOY_TRANSPORT=quic \
TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS=5 \
npm run tip:deploy
```

The TIP script accepts explicit RPC/transport/signing-round overrides while preserving configured wallet and program identity. Its default remains RPC transport with twenty signing rounds. `--use-rpc` sends writes through the RPC provider; QUIC sends through validator TPU connections. The Solana CLI describes each signing round as roughly one blockhash lifetime, about a minute; twenty rounds can therefore mean a long upload retry period. Five rounds bounds that retry budget more tightly, and actual completion depends on network/provider conditions.

Verbose CLI output and a fifteen-second elapsed-time heartbeat distinguish an active child process from a completed result; the heartbeat does not measure upload percentage. RPC/QUIC failures must still be reconciled with deployed program state. A CLI success or byte match does not initialize the verifier, activate a TCAP root, update Node settings or migrate an old TIN. Use the [documentation/verification ledger](DOCUMENTATION_STATUS.md) for the latest dated program observation and remaining first-credit gates.

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

Deploy TSNP, TCAP (Transfer Confidential Asset Protocol) and GPRU using the root wrapper:

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
TCAP tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF
```

### Required upgrade gate before credit bootstrap

Run the TCAP deploy command after any change to the on-chain account layout or
instruction ABI. In particular, `migrate_tcap_config_layout_v1` is required to
convert the older Devnet config account. Running the bootstrap before this
upgrade produces `InstructionFallbackNotFound`; that means the old bytecode is
still deployed and no migration occurred.

Verify the deployed program after the upgrade and record `Last Deployed
In Slot`, program authority and matching binary evidence before continuing:

```bash
solana program show tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF \
  --url "$ANCHOR_PROVIDER_URL"
```

Only after verifying the intended binary and actual old account layout should you perform a required config migration. The historical bootstrap below is separate from current native funded-note setup.

## Current credit source and hidden-head status

The TSN CPI wrapper and TCAP shared-root Memo-credit instruction are present in
source. Verify the affected program builds and the matching binaries are
deployed before treating this as a live transfer path. The retained legacy V1 receipt smoke helpers require
`TCAP_ALLOW_LEGACY_V1=1` and are not current root-package credit aliases.
Do not enable them for a new funded-note transfer.

The current funded-note path verifies the unchanged sender deposit, confirms
funding, then uses Node's root-selected witness/prover and Mother-authorized
TSNP -> TCAP -> GPRU validation. TCAP changes shared state and liability
classification only after proof verification. The funding root, thirteen-input
V2 verifier/key and persistent Node artifacts require separate initialization.
Use [Build and operate your own TSN](RUN-YOUR-OWN-TSN.md) for the complete
sequence and [the credit ABI](laboratory/credit-abi.md) for account constraints.
Compilation and deployment remain separate from a live credit.

The deploy helper uses RPC submission, `confirmed` commitment, and 20 signing
attempts by default because large SBF upgrades can exceed a single blockhash
window. It only pre-extends an existing ProgramData account when the artifact
does not fit; an artifact that already fits skips the extension transaction.
Set `TRUSTLINK_DEPLOY_TRANSPORT=quic` to try QUIC first; the helper automatically
falls back to RPC and retries both transports up to three rounds when upload or
blockhash errors occur. `TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS` can override the
per-upload signing retry count, and `TRUSTLINK_DEPLOY_RECOVERY_ROUNDS` can set
the transport recovery rounds from 1 to 5.

Before uploading, the helper creates or reuses a protected persistent buffer
signer in the system temporary directory. This prevents an interrupted upload
from losing the buffer recovery keypair. A successful deployment removes an
automatically created signer; after all recovery attempts fail, the signer is
left in place and its path is printed so the next invocation can resume it.
Set `TRUSTLINK_DEPLOY_BUFFER_SIGNER` to take ownership of a specific signer
path. Never publish the signer file or its seed phrase.

Do not run these commands against localnet. After deployment, run only Devnet
preflight, simulation and explicitly approved Devnet transactions.

## Historical TCAP credit bootstrap defaults

The following retained epoch/AcceptedIntent fixture describes a separate historical smoke-test family. Its commands are not the current funded-note installation procedure and are not present as root-package credit aliases. Use [the current operator guide](RUN-YOUR-OWN-TSN.md) for new native credits.

`npm run tcap:credit:bootstrap:devnet` is retained only as a legacy migration
diagnostic and is fail-closed by default. It automatically loads the checked-in
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
