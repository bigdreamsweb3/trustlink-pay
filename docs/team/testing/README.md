# Testing and release guides

Use this category for Devnet evidence, test sequences, deployment review, and
release gates.

- [Devnet build and deploy](../../DEVNET-BUILD-DEPLOY.md)
- [Operations and testing](../../operations-and-testing.md)
- [TCAP Devnet credit smoke](../../tcap-devnet-credit-smoke.md)
- [TCAP v2 Devnet](../../TCAP-V2-DEVNET.md)
- [Protocol TCAP credit smoke](../../protocol-tests-tcap-credit-smoke.md)

Tests are evidence-producing procedures. A build proves compilation; a
simulation proves local behavior; only confirmed Devnet/Testnet transactions
prove an on-chain path. Guides must print real signatures and explorer links,
never placeholders.

## Windows and WSL signer context

When the repository is operated from Windows with the Solana CLI installed in
WSL, run Solana commands inside WSL so the configured signer is preserved:

```bash
wsl.exe bash -lc 'solana config get; solana address; solana balance'
```

The WSL signer is normally stored at `/home/<user>/.config/solana/id.json`.
Do not replace it with a Windows-side keypair merely because the Windows CLI
cannot see the WSL configuration. Confirm the RPC is Solana Devnet and record
only the public address and balance in team evidence; never copy the private
key or seed phrase into logs or documentation.

## TSN Devnet deployment gate

The TSN program ID is
`TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V`. A program account on Devnet
proves that some version of the program is deployed; it does not prove that
the current local Rust source and `.so` binary are the version on-chain.

Verify the existing Devnet deployment before attempting a new deployment:

```powershell
solana program show TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V --url devnet
```

The current observed account is owned by the upgradeable BPF loader and has a
program-data account, so the TSN program exists on Devnet. The local Windows
deployment gate currently stops before building when `cargo build-sbf` is not
installed. Do not claim that the latest source is deployed until the pinned
Devnet toolchain is available and the following sequence completes:

```powershell
npm run deploy:doctor
npm run tsn:program:build:devnet
npm run tsn:program:deploy:devnet
solana program show TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V --url devnet
```

If the Windows toolchain is incomplete, run the same guarded sequence in the
WSL environment that owns the funded Devnet signer. Record the resulting
deployment signature and program-data state before creating a debit intent.
The next cross-chain gate remains separate: Creditcoin's
`latestObservation(routeId)` must also be current before the Node exposes the
destination route.

## TIN program deployment gate

The private TIN registry is a separate Solana program from the TSNP settlement program:

```text
Program ID: TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

After the repository reorganization, the Anchor workspace is located at
`tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program`.
The old repository-root path `/transfer-identity-protocol/tin-registrar/program`
must not be used.

Verify it independently:

```powershell
solana program show TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT --url devnet
```

The observed Devnet account is owned by the upgradeable BPF loader and has
program data, so the TIN program is deployed. That does not mean a particular
private TIN exists: the TIN registry state and the private TIN PDA must still
be initialized/created through the TIN SDK and program instruction before a
TIN debit intent can reference it.

### Observed TIN upgrade status

The upgraded TIN binary was deployed successfully to the existing program ID
at Devnet slot `498316930`, whose block time was `2026-09-14T15:58:57Z`.
`solana program show` confirmed the same program ID, upgradeable loader,
program-data account, and upgrade authority. The build emitted legacy
`num_derive` non-local-impl warnings and reported that no Anchor IDL exists;
neither prevented deployment because this is a native Solana program rather
than an Anchor IDL-driven program.

The next gate is state initialization and creation of a fresh private TIN PDA.
Program deployment alone does not create a TIN registry account.
