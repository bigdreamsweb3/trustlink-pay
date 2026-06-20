# Deployment

This document explains how to deploy TrustLink Pay programs safely.

## What Is This?

TrustLink Pay has two active Solana programs:

- TINS: payment identity
- TSN: settlement

Both must be built with a Solana/SBF toolchain that devnet supports.

## Why Deploys Were Failing

The error:

```text
Detected sbpf_version required by the executable which are not enabled
```

means the compiled `.so` requires an sBPF version that the target cluster has not enabled.

This is a toolchain problem, not a program authority problem.

## Required Deploy Toolchain

Use:

```bash
solana --version            # solana-cli 1.18.x
cargo build-sbf --version   # solana-cargo-build-sbf 1.18.x
anchor --version            # anchor-cli 0.30.1
cargo --version             # host Cargo can be newer, but do not let it rewrite deploy lockfiles
rustc --version             # host Rust can be newer; SBF uses the Solana 1.18 builder
```

The program crates remain pinned to `1.18.26`, but the deploy toolchain may be any compatible Solana/SBF `1.18.x` release.

Do not deploy to devnet with Solana/SBF 3.x or standalone `cargo-build-sbf 4.x` until the target cluster supports that bytecode.

Do not set `solana_version` inside `Anchor.toml`. Anchor can try to auto-download Solana through `solana-install`, which makes deploys depend on network access and can fail before the real build starts. TrustLink Pay uses `npm run deploy:doctor` to verify the active Solana/SBF toolchain instead.

## Why The `edition2024` Error Happens

Solana/SBF 1.18 uses an older Cargo internally.

Some newer Rust crates now publish manifests that require Rust edition 2024. The older Cargo bundled with Solana/SBF 1.18 cannot even parse those manifests, so builds fail with:

```text
feature `edition2024` is required
```

This does not mean the program needs edition 2024. It means a transitive dependency resolved too new for the deploy builder.

The deploy lockfiles are intentionally stabilized:

- `Cargo.lock` format stays at version 3.
- `blake3` stays on `1.5.5`.
- `zeroize_derive` stays on `1.4.3`.
- `proc-macro-crate` stays on `3.3.0` so it uses the `toml_edit 0.22.x` chain instead of `toml_parser 1.x`.
- Anchor stays on `0.30.1`.
- Solana program crates stay on `1.18.26`.

If a dependency update changes the lockfiles, run:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

## Preflight Check

From the repository root:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

If this fails, fix the toolchain before deploying.

## Deploy TINS

```bash
npm run tins:deploy:checked
```

## Deploy TSN

```bash
npm run tsn:program:deploy:checked
```

## Close Failed Buffers

Failed deploys can leave buffer accounts that hold SOL.

List them:

```bash
solana program show --buffers --url devnet
```

Close each one:

```bash
solana program close <BUFFER_ADDRESS> --buffer-authority ~/.config/solana/id.json --url devnet
```

Only close deploy buffers that belong to your authority. Do not close deployed program IDs.

## After Deploy

Rebuild SDKs and restart services:

```bash
npm run sdk:refresh
npm run sdk:build:all
npm run dev:backend
npm run dev:frontend
npm run dev:tsn:stack
npm run tsn:cranker:start
```
