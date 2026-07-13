# TIN Registrar

TIP means **Transfer Identity Protocol**.

It creates 10-digit payment identities for TrustLink Pay and other integrations.

## What Is This?

A TIN is a public payment identity.

Users can share a TIN instead of a wallet address. Apps can resolve the TIN to safe public identity information before payment.

## Why It Exists

Wallet addresses are hard to read and easy to track.

A TIN gives users a portable identity layer while allowing wallets, social identities, and verification records to stay behind the protocol.

## What The Program Stores

TIP stores identity records such as:

- TIN number
- SHA-256 owner pubkey commitment
- public display or legal-name status
- verification status
- encrypted social identities
- sensitive encrypted fields
- verification platform proof references

## Identity Encryption

Social identities such as WhatsApp, email, and X should be stored encrypted.

Sensitive data requires stronger access. It should require the TIN plus explicit user authorization before decryption.

## Verification Platforms

The program supports registered verification platform keys.

These platforms can sign identity proofs off-chain. The program can verify that the proof came from an authorized platform key.

## Devnet Program ID

```text
TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT
```

## Deploy Toolchain

Use the devnet-compatible Solana/SBF toolchain:

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

Run:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
npm run tip:deploy:checked
```

Do not deploy with Solana/SBF 3.x or standalone `cargo-build-sbf 4.x` until the target cluster supports that sBPF bytecode.

## Failed Deploy Buffers

If deploy fails after creating a buffer, close the buffer before retrying:

```bash
solana program show --buffers --url devnet
solana program close <BUFFER_ADDRESS> --buffer-authority ~/.config/solana/id.json --url devnet
```

## Related Docs

- `docs/TIP.md`
- `docs/DEPLOYMENT.md`
- `docs/INTEGRATION.md`
