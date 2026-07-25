# Stable-TCAP Devnet Design Gate

Status: faucet program deployed; reserved mint account confirmed absent; TCAP
V2 governance and Token-2022 funding upgrade implemented in source but not yet
built, deployed, or proven callable on Devnet. Nothing in this document treats
source presence as deployed evidence.

## Canonical identity

- Name: Stable-TCAP
- Symbol: STCAP
- Network: Solana Devnet only
- Value: none; protocol testing only
- Decimals: 6
- Token program: Token-2022 (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)
- Mint identity: `5N1ZUFJEnN5yhSwb8yezd8BwQozVNtydppCNroNwLP1E`
- Faucet program identity:
  `E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h`
- These public keys are allocated identities only. They are not deployment
  evidence until the matching accounts are verified on Devnet.
- Metadata address and deployment signatures: not yet available

## Current TCAP compatibility decision

The currently deployed TCAP binary does **not** accept Token-2022.

`register_asset_v1`, `deposit_asset_v1`, and
`deposit_with_funding_commitment_v1` compare the submitted token program to
the classic SPL Token ID. `initialize_reserve_vault_v1` also uses the classic
`Program<Token>` account type. `TokenInterface` account wrappers therefore do
not make Token-2022 callable: the explicit program-ID checks reject it.

The source tree now contains a versioned governed-asset model, strict
Token-2022 extension policy, public `deposit_asset_v2`, and governed
`deposit_with_funding_commitment_v2`. The currently deployed TCAP binary has
not yet been upgraded or probed for those V2 handlers. The live statuses are
therefore `MINT_NOT_CREATED` and `TCAP_V2_NOT_DEPLOYED`; Stable-TCAP must not be
registered until mint creation plus the V2 build, upgrade, and Devnet probe
all pass.

## Institutional mint-account profiles

The Test Lab uses these user-facing terms:

- **Standard public-balance mint** — conventional public balances and public
  transfer amounts. This is the institutional equivalent of the earlier “normal mint”
  wording.
- **Confidential-transfer-enabled mint** — a Token-2022 mint whose immutable
  Confidential Transfer capability is initialized when the mint account is
  created. Account addresses remain public. This does not mean TCAP
  confidential ownership exists.

The selection is an issuance-time profile, not a per-transfer privacy switch.
An existing mint cannot acquire the Confidential Transfer mint extension
later. Stable-TCAP is permanently configured for the second profile. Its
reserved mint account is still absent, so no creation, faucet request, or TCAP
registration action is enabled in the Test Lab.

## Mint extensions

The proposed mint contains only:

- `ConfidentialTransferMint`;
- `MetadataPointer`, pointing to the mint's own Token-2022 metadata;
- `TokenMetadata` with name `Stable-TCAP`, symbol `STCAP`, and a canonical URI.

Policy:

- mint authority: faucet-authority PDA;
- freeze authority: none;
- confidential-transfer configuration authority: TrustLink Devnet governance;
- confidential accounts: auto-approved;
- auditor ElGamal key: none for the first Devnet version;
- transfer fees: disabled;
- transfer hooks: disabled;
- permanent delegate: disabled;
- default account state: disabled;
- non-transferable: disabled;
- interest bearing: disabled.

An auditor can decrypt confidential amounts. Because no durable auditor-key
custody design is approved, Phase 1 chooses no auditor rather than silently
creating an unrecoverable or exposed key.

Token-2022 Confidential Transfer encrypts amounts and balances. Token-account
addresses remain public. This is distinct from TCAP reserve-backed confidential
ownership and does not prove transaction unlinkability.

## Faucet program design

Program name: `stable_tcap_faucet`.

The faucet is a dedicated test-infrastructure program, not TCAP settlement
logic. Its mint authority is a PDA and Token-2022 `mint_to_checked` is invoked
with `invoke_signed`.

PDA seeds:

- faucet state: `["stable-tcap:faucet:v1"]`;
- mint authority: `["stable-tcap:mint-authority:v1"]`;
- wallet rate state: `["stable-tcap:wallet:v1", wallet]`;
- request receipt: `["stable-tcap:request:v1", wallet, request_id]`.

Request policy:

- requester must sign;
- recipient must equal requester for the public faucet;
- amount is 10,000 through 1,000,000,000,000 base units (0.01 through
  1,000,000 STCAP);
- a wallet nonce advances exactly once;
- the receipt PDA makes each request ID single-use;
- one-slot minimum cooldown prevents accidental tight loops without blocking
  normal stress testing;
- requester pays the transaction fee and ATA rent;
- ATA address and creation cost are displayed before approval;
- no automatic retry or submission;
- versioned request event records wallet, receipt, amount, nonce and mint.

Solana programs cannot securely inspect a cluster name or genesis hash. The
Devnet-only guarantee is operational: deploy this program and mint only on
Devnet, pin the Test Lab to Devnet, and reject other clusters client-side.

## TCAP Token-2022 upgrade

Keep the classic asset path intact. Add a versioned Token-2022 registration
instruction and an extension-policy PDA bound to the asset entry. The policy
must record:

- exact mint and Token-2022 program ID;
- decimals;
- observed and allowed mint-extension bitmap;
- canonical vault;
- whether public reserve deposits are supported;
- hash of the approved extension configuration;
- policy version and migration status.

Registration must unpack the mint with Token-2022 `StateWithExtensions`, list
its extension types, and accept only the Stable-TCAP allowlist above. Unknown
or incompatible extensions are rejected. Deposit handlers must accept either
the classic Token program or Token-2022 only when the asset-bound policy
matches, then invoke `transfer_checked` through the recorded program. The
canonical reserve vault remains a public Token-2022 balance and is not called
a confidential ownership container.

Required negative tests include wrong token program, substituted mint,
extension-policy substitution, transfer fee, transfer hook, permanent
delegate, default frozen state, non-transferable and interest-bearing mints.

## Toolchain gate

The repository pins Anchor 0.30.1, Solana program 1.18.26, and
`spl-token-2022` 3.0.5 through `Cargo.lock`. That crate includes the ZK token
SDK, but the installed CLI and SBF builder still must be checked in WSL before
implementation. Devnet has the ZK ElGamal proof program; a stock local
validator does not, so local confidential-transfer execution needs a cloned or
forked validator rather than being claimed from ordinary localnet.

No dependency or lockfile change is authorized until the compile probe proves
the pinned crates lack a required instruction or proof API.

### Evidence received

The WSL `cargo tree --locked -p spl-token-2022 -e features` output confirms:

- `spl-token-2022` resolves under the locked Solana 1.18.26 graph;
- `solana-zk-token-sdk` is present;
- `spl-token-metadata-interface` is present;
- Token-2022's supporting POD, TLV and proof dependencies resolve.

Result: `LOCKED_LIBRARY_GRAPH_PRESENT`.

Installed WSL tools were then verified as:

- `solana-cli 1.18.26`;
- `spl-token-cli 3.4.1`;
- `anchor-cli 0.30.1`.

The installed SPL Token CLI exposes Confidential Transfer account
configuration, deposit, apply-pending, withdrawal, confidential-credit
controls, mint metadata, and `create-token --enable-confidential-transfers`.

Result: `PHASE_2_SOURCE_IMPLEMENTATION_CLEARED`.

### Faucet deployment evidence

The faucet source passed four unit tests and was built as a 329,992-byte SBF
artifact with SHA-256:

`951d453748d64d8c7dbfe8c47e0974538defe6d29e235deda63fc680d71cb1d6`

Anchor deployed that artifact to Devnet as:

- program: `E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h`;
- ProgramData: `4zNx8a3sSykoKRRLpi6h1YN1wDZniKp9y856d9qVDUBB`;
- upgrade authority: `78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX`;
- deployment slot: `478088497`;
- deployed data length: `329992` bytes.

Result: `FAUCET_PROGRAM_DEPLOYED`. This does not yet prove that the Stable-TCAP
mint or faucet state exists, or that a faucet request is callable.

SBF build, local tests, artifact hashing and a successful Devnet simulation
remain mandatory before any program or mint deployment.

## Deployment sequence and current progress

1. **Completed:** record current tool versions and run the pinned Confidential
   Transfer capability probe.
2. **Completed:** implement and test `stable_tcap_faucet` locally.
3. **Source completed; build pending:** implement TCAP Token-2022 policy and
   public-deposit support.
4. **Faucet completed; TCAP pending:** build SBF artifacts and record hashes.
5. **Completed:** deploy the faucet program to Devnet.
6. **Pending:** create Stable-TCAP with the approved extensions and 6 decimals.
7. **Pending:** assign mint authority to the faucet PDA.
8. **Pending:** initialize faucet state and probe one public request.
9. **Pending:** upgrade the existing TCAP program without changing its program ID.
10. **Pending:** register Stable-TCAP through TCAP governance, create its reserve and vault,
    then activate deposits.
11. **Pending:** run confirmed faucet and TCAP funding probes.
12. **Pending:** only then begin manual confidential-account, deposit, apply, transfer and
    withdrawal actions.

Every state-changing step requires a separate user command or Test Lab
approval and a confirmed signature.
