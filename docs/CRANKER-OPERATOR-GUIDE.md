# TSN Cranker Operator Guide

This guide explains how to run an independent **TSN Cranker** for TrustLink
Labs' Transfer Settlement Network (TSN) on Devnet. A Cranker is an operator
process, not a public API and not a Solana program deployment. It watches the
TSN Receiver for non-secret work, leases work that the TSN Node has verified,
and submits the exact authorized transaction. The owner pays its funding fee; Cranker pays native settlement fees.

This guide covers current operator tooling for the wallet-to-TIN funding and
GPRU/TCAP settlement path. The separate epoch-treasury flow has its own
instruction family and must not be mixed with this credit path. This guide does
not claim mainnet production readiness or replace a Devnet program, Receiver,
or Node deployment.

## Cranker role

The current execution boundary is:

```mermaid
flowchart TD
    R["TSN Receiver - verified non-secret work"]
    N["TSN Node - verification and lease eligibility"]
    C["Cranker - lease and submit exact work"]
    S["Solana Devnet - TSNP program and controlled accounts"]
    R --> N --> C --> S
```

The Cranker may:

- lease Node-verified `AUTHORIZED_FUNDING` work and internally-created
  `SETTLEMENT` work that is already eligible;
- submit the exact sender-signed TCAP reserve-funding transaction, then the
  exact GPRU/TCAP settlement transaction authorized by the protocol;
- pay native settlement fees from its operator wallet, while owner-signed funding retains its owner fee payer;
- report transaction signatures and retry safe failures;
- submit only explicitly authorized funding or settlement work; refunds are a
  Node/Mother operation.

The Cranker must not:

- decrypt a user's master seed or reconstruct a user's private commitment key;
- choose a different source, recipient, amount, tranche, fee, or change route;
- sign as a user, a user authorization, or any Mother-controlled settlement authority;
- mark an intent paid, recoverable, or reimbursable by itself;
- expose Receiver API keys, operator secret keys, or private route material.

Epoch-treasury funding, opaque claim slots, Mother DNA vouchers, and Cranker
Vault reimbursement belong to a separate instruction family. Their accounts
are not part of the current wallet-to-TIN credit transaction unless that
transaction explicitly invokes those instructions.

## What must already exist

Before an operator starts a Cranker, the deployment owner must provide:

1. Deployed matching TIP, TSNP, TCAP and GPRU programs, current SDK/account ABI and initialized funded-note roots/verifier. IDL generation is not required by the supported SBF deployment helper.
2. A reachable TSN Receiver with Cranker work endpoints.
3. A running or reachable TSN Node that verifies and publishes work.
4. The pinned public Node verification key and a registered on-chain Cranker identity. Receiver admission uses signed challenge/session requests, not a shared Cranker API credential.
5. A configured Devnet RPC gateway with working account, simulation and submission methods. Current funding and settlement confirmation use HTTP; WebSocket readiness is a separate optional integration.
6. A funded operator keypair. Use a dedicated keypair, never the upgrade
   authority, a user wallet, or a TIN commitment key.
7. A supported token mint and enough Devnet SOL for fees and account creation.
   If policy requires a funded Cranker Vault, initialize and fund it first.

Set explicit deployment URLs and public key pins. Current startup pins a ready local Receiver, with hosted fallback only when explicitly enabled. Use [Build and operate your own TSN](RUN-YOUR-OWN-TSN.md) for the full reference/independent-deployment setup.

## Deployment boundary

There is no separate “Cranker program” to deploy. The Cranker is a signed
operator process that uses the already deployed TSNP program. Only the
deployment owner should build or upgrade the on-chain program:

```bash
npm run tsn:program:build
npm run tsn:program:deploy:devnet
```

Run those commands from the project's supported Solana/Anchor environment,
verify the resulting Program ID, and initialize Mother Escrow before asking
independent operators to register. A Cranker operator normally needs only the
operator package, its keypair, the Node public verification pin, and the public
program/cluster configuration.

## Install the operator

From the repository root:

```powershell
npm --prefix tsn-protocol/services/tsn-cranker-op-daemon install
```

Or from inside the operator package:

```powershell
cd tsn-protocol/services/tsn-cranker-op-daemon
npm install
```

The daemon runs on an operator workstation, VM, or private worker. It does
not need to be hosted as a public HTTP service. Keep one long-running process
per operator identity to avoid competing leases.

## Create the operator keypair

Run this once on the machine that will operate the Cranker. These commands are
instructions for the operator; this guide does not run them.

```bash
cd tsn-protocol/services/tsn-cranker-op-daemon
mkdir -p keys
solana-keygen new --outfile keys/cranker-keypair.json --no-bip39-passphrase
chmod 600 keys/cranker-keypair.json
solana-keygen pubkey keys/cranker-keypair.json
solana airdrop 2 "$(solana-keygen pubkey keys/cranker-keypair.json)" --url devnet
```

On Windows, protect the file with equivalent filesystem ACLs. The repository
ignores `keys/*.json` and local operator state, but verify that before making
a deployment image.

## Configure the environment

Create `tsn-protocol/services/tsn-cranker-op-daemon/.env` from `.env.example`. Use
real values only on the private operator machine:

```dotenv
SOLANA_MOCK_MODE=false
TSN_RPC_URL=http://127.0.0.1:8787
TSN_RPC_FALLBACK_URL=https://api.devnet.solana.com
# Optional; use a direct Solana provider websocket only when subscriptions are enabled.
# SOLANA_WS_URL=wss://<solana-provider-websocket-endpoint>
PROGRAM_ID=TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
TINS_PROGRAM_ID=TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
KEYPAIR_PATH=./keys/cranker-keypair.json
TSN_ENABLED=true
TSN_CREATE_INTENTS_ONCHAIN=true
TSN_RECEIVER_URL=https://tsn-receiver-kappa.vercel.app
TSN_LOCAL_RECEIVER_URL=http://127.0.0.1:8010
TSN_NODE_VERIFICATION_PUBLIC_KEY=<base64-public-node-verification-key>
TSN_CRANKER_KEYPAIR_PATH=./keys/cranker-keypair.json
TSN_CRANKER_POLL_MS=2000
TSN_CRANKER_MAX_IDLE_POLL_MS=60000
```

Optional fee and policy settings are documented in `.env.example`. Do not
commit `.env`, `.env.local`, keypair JSON, Receiver credentials, or
`operator-state.json`. Never put them in frontend configuration.

## Mother Escrow “DNA”

The following settlement-DNA voucher derivation belongs to the retained epoch/payout family. Native funded-note settlement uses the current Mother co-signature and TSNP/TCAP/GPRU account/proof checks described in [the credit ABI](laboratory/credit-abi.md); it does not create a DNA payout voucher. The retained voucher's
PDA derivation is public, but its fields are accepted only after Mother
authority materializes the account and the TSNP program verifies the permit.
It is not a private key or a secret credential. The Mother address is
determined by the deployed TSNP program ID and this fixed seed:

```text
motherEscrow = PDA(["tsn_mother_escrow"], TSN_PROGRAM_ID)
```

The one-time settlement DNA PDA is derived from the Mother Escrow and opaque
claim slot:

```text
settlementDna = PDA(
  ["tsn_settlement_dna", motherEscrow, opaqueSlot],
  TSN_PROGRAM_ID
)
```

The lease version is stored inside that PDA and is signed in the permit. The
operator-specific Cranker PDA is derived from the Mother Escrow and the
operator public key:

```text
cranker = PDA(
  ["tsn_cranker", motherEscrow, operatorPublicKey],
  TSN_PROGRAM_ID
)
```

The setup code derives token vault accounts as follows:

```text
crankerVault      = PDA(["tsn_cranker_vault", cranker, tokenMint], program)
vaultAuthority    = PDA(["tsn_cranker_vault_authority", crankerVault], program)
vaultTokenAccount = PDA(["tsn_cranker_vault_token", crankerVault], program)
liquidityPosition = PDA(
  ["tsn_liquidity_position", crankerVault, funderPublicKey],
  program
)
```

These seeds must remain identical to the deployed program. Do not manually
choose an address or paste one from another cluster. The CLI derives and
records the addresses in local `operator-state.json`.

## Initialize the shared Mother Escrow

Mother Escrow initialization is a deployment-owner operation, not something
every untrusted operator should repeat. Run it once for a new Devnet program
or when the TSNP program explicitly requires migration:

```powershell
npm run tsn:mother:init
# Only when the deployed program requires an account-layout migration:
npm run tsn:mother:migrate
```

The signer must have the authority required by the deployed TSNP program. A
Cranker operator cannot initialize or migrate Mother Escrow merely because it
has an operator keypair. Confirm program ID and cluster before signing.

## Register a Cranker

Registration creates or updates the operator-specific Cranker PDA using the
operator keypair in `KEYPAIR_PATH`:

```powershell
npm run tsn:cranker:register
```

The command records the derived context locally. The public operator key,
Mother Escrow PDA, and Cranker PDA may be shared as verification metadata. The
keypair must never be shared.

To inspect available setup commands:

```powershell
npm run tsn:cranker:help
```

## Initialize and fund a token vault

The guided setup exposes registration, funding-policy configuration, vault
initialization, vault funding, withdrawals, and epoch settlement:

```powershell
npm run tsn:cranker:setup
```

Raw commands are available inside the operator package:

```powershell
cd tsn-protocol/services/tsn-cranker-op-daemon
npm run setup:raw -- init-vault <TOKEN_MINT_OR_SYMBOL>
npm run setup:raw -- fund-cranker <TOKEN_MINT_OR_SYMBOL> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCOUNT> <BASE_UNITS>
npm run policy:open
```

Only enable external funding after the deployment policy and accounting model
have been reviewed. To close it again:

```powershell
npm run policy:closed
```

Do not describe a funded vault as a user wallet or as the TSNP program itself.
The vault is a controlled settlement account whose authority is enforced by
the deployed program.

## Run the Cranker

Start the daemon from the repository root:

```powershell
npm run tsn:cranker:start
```

Or inside its package:

```powershell
cd tsn-protocol/services/tsn-cranker-op-daemon
npm run crank:start
```

Healthy startup logs identify the operator, Receiver source, execution mode,
Mother Escrow, and Cranker PDA. A healthy process may be idle when the
Receiver has no verified funding or settlement work; idle polling is not a
failed deployment.

The normal lifecycle is:

```mermaid
sequenceDiagram
    participant R as TSN Receiver
    participant N as TSN Node / Mother authority
    participant C as Cranker
    participant S as Solana programs
    R->>R: Store funding and linked RECEIVED settlement
    N->>R: Lease and verify owner-approved funding
    N-->>R: Signed VERIFIED funding decision
    C->>R: Lease verified funding
    C->>S: Submit unchanged funded-note TCAP deposit
    C->>R: Report funding confirmation
    N->>R: Lease independently eligible settlement
    N-->>R: Current-root proof and signed VERIFIED transition
    C->>R: Lease settlement and request Mother co-signature
    R->>N: Check lease and exact settlement message
    N-->>C: Lease-bound Mother signature through Receiver
    C->>S: TSNP -> TCAP -> GPRU credit and Memo
    S-->>C: Confirmed atomic state/liability transition
    C->>R: Report settlement confirmation
```

The Cranker does not replan work between the Receiver and Solana. If a lease
expires, Receiver/Node policy decides whether to requeue, recover, or reject
it; the Cranker must not invent a new route.

## Verify the deployment

Use the same Devnet RPC and program ID as the operator environment:

```bash
solana address -k tsn-protocol/services/tsn-cranker-op-daemon/keys/cranker-keypair.json
solana account <MOTHER_ESCROW_PDA> --url devnet
solana account <CRANKER_PDA> --url devnet
solana program show TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V --url devnet
```

Keep startup output and every submitted transaction signature as operator
evidence. A successful signature proves Solana accepted a transaction; it does
not alone prove authorization or recipient credit. Confirm Receiver state,
TSN Node decision, program logs, and token balances together.

## Troubleshooting

**Receiver returns 401.** Check that `TSN_RECEIVER_URL` is
`https://tsn-receiver-kappa.vercel.app`, the operator keypair is readable, and
the operator has registered its Cranker PDA on Solana Devnet. Receiver admission
uses the on-chain Mother DNA; there is no per-operator allowlist or Cranker API
key. Remove accidental surrounding quotes from environment values and restart.

**Mother Escrow or Cranker PDA is not initialized.** Verify program ID, cluster,
operator keypair, and seed recipe. Ask the deployment owner to run authorized
`mother:init` or migration, then run registration.

**No settlement is leased.** Confirm Receiver reachability, TSN Node verification,
Cranker registration, and an eligible Receiver work state. Do not bypass
verification by submitting directly from the Cranker.

Idle Crankers use bounded fallback backoff, with an optional authenticated Realtime Database wake stream carrying only a control marker. Receiver leases remain authoritative; the wake channel does not provide work payloads or bypass admission.

**Blockhash or send failures.** Check actual gateway RPC methods, bank visibility, payer SOL and transaction lifetime. The gateway and funding-specific Cranker fallback retry identical owner-signed bytes; expired funding requires a fresh wallet signature after original-attempt reconciliation. Node temporary HTTP 5xx/transport failures retry within its active processing lease. A confirmed deposit with incomplete settlement must be recovered as existing work.

**Vault has insufficient funds.** Fund the configured Cranker Vault through the
reviewed setup path. Do not load a user private key or make the Cranker a user
private commitment authority.

## Security checklist

- Use a dedicated operator keypair per Cranker instance.
- Keep keypair files, `.env`, Receiver API keys, and operator state private.
- Never paste secrets into issue reports, logs, screenshots, or frontend config.
- Run one daemon per operator identity to avoid lease races.
- Pin the TSNP program ID and Solana cluster in deployment configuration.
- Review Mother Escrow, Cranker PDA, and vault addresses before funding.
- Stop the daemon and rotate credentials if a key or API secret may be exposed.

## Operator evidence to retain

For each Devnet run, retain:

- cluster and RPC endpoint label (never the API key);
- TSNP program ID;
- operator public key, Mother Escrow PDA, Cranker PDA, and vault PDAs;
- registration and vault initialization signatures;
- Receiver work/lease identifiers;
- settlement and reimbursement signatures, if any;
- source, vault, and recipient balances before and after;
- daemon version/commit and configuration template used.

Do not represent a live settlement or production readiness without
the corresponding on-chain and Receiver evidence.

## Related documentation

- [Service hosting map](./SERVICE-HOSTING.md)
- [Live testing and contributor guide](./GETTING-STARTED-LIVE.md)
- [TSN operations and testing](./operations-and-testing.md)
- [TSN receiver and node architecture](./tsn-receiver-node-architecture.md)
- [TSN security model](./security-model.md)
- [Cranker source package](../tsn-protocol/services/tsn-cranker-op-daemon/)
