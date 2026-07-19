# TCAP build environment

The repository targets the Solana/SBF 1.18.26 toolchain and Anchor 0.30.1.
The deploy doctor documents Rust 1.75 compatibility requirements for this
Solana/SBF line; CI selects Rust 1.75.0 explicitly, but the repository does not
yet declare a universal Rust toolchain for every developer workflow. Do not
replace the lockfile or install floating latest versions to work around a
build error.

## Local WSL2 Ubuntu

Enable WSL2 and install Ubuntu from an elevated PowerShell prompt if no
distribution is present:

```powershell
wsl --install -d Ubuntu
```

Restart if Windows requests it, then open Ubuntu and use the repository at:

```bash
cd /mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol
```

Install the repository Rust toolchain and verify it:

```bash
rustup toolchain install 1.75.0
rustup default 1.75.0
rustc --version
cargo --version
```

Install the pinned Solana/SBF release and Anchor version using the same pinned
versions as CI:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cargo +stable install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1
```

Then verify:

```bash
solana --version
cargo-build-sbf --version
anchor --version
```

Run the locked validation commands:

```bash
cargo fmt --check
cargo metadata --locked --no-deps
cargo check --locked
cargo test --locked
anchor build --no-idl
```

Building inside the Linux filesystem (for example under `~/src/trust-link`)
may be faster than building through `/mnt/c`, but this guide does not move or
copy the repository automatically.

## GitHub Actions Linux CI

The workflows [tcap-cargo.yml](../.github/workflows/tcap-cargo.yml) and
[tcap-sbf.yml](../.github/workflows/tcap-sbf.yml) run on Ubuntu with locked
dependencies. The Cargo workflow validates formatting, metadata, compilation,
and tests. The SBF workflow selects Rust 1.75.0 for CI, installs Node 20 as a
CI-only choice because the root package only declares `node >=18`, installs
Solana 1.18.26 and Anchor 0.30.1, prints the selected versions, and runs
`anchor build --no-idl` separately.

Neither workflow changes `Cargo.lock`, deploys a program, uses secrets, or
claims production readiness.
