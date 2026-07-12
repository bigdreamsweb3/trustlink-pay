# TrustLink Protocol Workspace

This is the standalone Anchor workspace for TrustLink escrow + TSN program code.

## Layout

- `Anchor.toml`
- `Cargo.toml`
- `programs/trustlink-escrow`
- `tests/`

## Build And Deploy

Devnet currently requires a Solana/SBF toolchain that emits supported sBPF
bytecode. Do not deploy this program with Solana/SBF 3.x or standalone
`cargo-build-sbf 4.x`; those builders can emit binaries rejected by devnet with:

```text
Detected sbpf_version required by the executable which are not enabled
```

Required deploy toolchain:

```bash
solana --version            # solana-cli 1.18.x
cargo build-sbf --version   # solana-cargo-build-sbf 1.18.x
anchor --version            # anchor-cli 0.30.1
```

Program crates are pinned to `1.18.26`, but the deploy toolchain can be any compatible Solana/SBF `1.18.x` release.

`Anchor.toml` intentionally does not set `solana_version`. The repository verifies the active Solana/SBF toolchain with `npm run deploy:doctor` instead, so Anchor does not try to auto-download Solana during deploy.

The lockfile must stay compatible with the Cargo version bundled in Solana/SBF 1.18. In practice:

- keep `Cargo.lock` at format version 3
- keep `blake3` at `1.5.5`
- keep `zeroize_derive` at `1.4.3`
- keep `proc-macro-crate` at `3.3.0`

From the repository root, run the guard before any deploy:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

```bash
cd tsn/protocol
anchor build
anchor deploy --provider.cluster devnet
```

If a deploy fails after creating a buffer account, close it before retrying:

```bash
solana program show --buffers --url devnet
solana program close <BUFFER_ADDRESS> --buffer-authority ~/.config/solana/id.json --url devnet
```

## Test

```bash
cd tsn/protocol
anchor test
```

Backend no longer owns protocol source files; it consumes the deployed program and TSN interfaces.
