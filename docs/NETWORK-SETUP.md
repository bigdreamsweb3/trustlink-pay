# Devnet network setup

The scripts in this document are Devnet-only. They use the existing `TCAP_RPC_URL`, `ANCHOR_PROVIDER_URL`, or `SOLANA_RPC_URL` conventions and never print secret key material.

## Key ownership

- TCAP governance: the `governance_authority` in the live TCAP global config; it approves assets and initializes reserve/vault policy accounts.
- Mother/Node authority: the authority stored in the TSN Mother Escrow; it signs accepted-intent creation.
- Cranker: the TSN cranker operator key configured for the daemon; it performs operational settlement work only.
- Fixture wallet: the test payer and token holder used by the credit bootstrap; it is not a substitute for governance or Mother authority.

Inspect the live identities before operating:

```powershell
npm run network:status
```

## Clean Devnet order

1. Deploy the pinned TCAP and TSN programs with the repository Devnet deployment workflow.
2. Initialize or migrate TCAP config, the asset registry, and commitment root with the TCAP governance wallet.
3. Confirm the live governance and registry authorities; do not assume a local key is authorized.
4. Register a mint with `network:init-asset`. The command validates the mint owner, requires six decimals for the Devnet USDC example, and runs the governance lifecycle only after simulation succeeds.
5. Write checked-in, non-secret account defaults with `npm run network:set-defaults -- --mint=<mint>`.
6. Do not run the legacy credit bootstrap for a new transfer. The V2 credit
   source is not yet deployable as an end-to-end TSN funding/settlement flow;
   use the build/deploy gates in [Devnet build and deploy](./DEVNET-BUILD-DEPLOY.md)
   and wait for the V2 Node-proof bridge before submitting a transaction.

## Register a new mint

Use the governance keypair explicitly when it is not already configured:

```powershell
$env:TCAP_GOVERNANCE_KEYPAIR='C:\secure\keys\tcap-governance.json'
npm run network:init-asset -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
npm run network:init-asset -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --confirm
npm run network:set-defaults -- --mint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

The first command previews and simulates. `--confirm` is required to submit. The current ABI creates the V1 entry together with V2 governance and extension policy accounts, then initializes the reserve and canonical token vault before enabling deposits. If the config names a missing or different authority, the command stops with an authority error; never work around that by signing with a fixture wallet.

Legacy or compact entries are not migrated implicitly by credit code. A current entry must have the full serialized `TcapAssetEntryV1` layout, the expected mint/token-program bindings, V2 policy accounts, and linked reserve infrastructure. Bootstrap fails closed otherwise.

## Credit bootstrap (legacy diagnostic only)

After the asset and defaults are live, the old receipt bootstrap is available
only for migration diagnostics. It is intentionally disabled by default:

```powershell
npm run tcap:credit:bootstrap:devnet
```

Without `TCAP_ALLOW_LEGACY_V1=1`, the command stops before any RPC write and
reports that the legacy `AcceptedIntentV1`/TCAP receipt path is disabled. Do not
enable that escape hatch for new funding or settlement tests.
