# TrustLink Protocol Workspace

This is the standalone Anchor workspace for TrustLink escrow + TSN program code.

## Layout

- `Anchor.toml`
- `Cargo.toml`
- `programs/trustlink-escrow`
- `tests/`

## Build And Deploy

```bash
cd tsn/protocol
anchor build
anchor deploy
```

## Test

```bash
cd tsn/protocol
anchor test
```

Backend no longer owns protocol source files; it consumes the deployed program and TSN interfaces.
