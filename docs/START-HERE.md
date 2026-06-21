# Start Here

This document explains TrustLink Pay without assuming you know Solana.

## What Is TrustLink Pay?

TrustLink Pay is a payment system that lets a person receive money through a 10-digit **Transfer Identity Number**, called a **TIN**.

The TIN is the public identity. The wallet address stays behind the payment system.

## Why It Exists

Crypto payments are still too address-first.

A wallet address is hard to read, hard to verify, and easy to track once it becomes public. TrustLink Pay gives users a simpler payment identity and uses TSN settlement to avoid showing a simple direct sender-to-recipient payment path.

## The Real-World Analogy

Think of a TIN like an account number.

When someone pays a bank account, they do not need to know the bank's internal ledger process. They only need enough information to trust that they are paying the right person.

TrustLink Pay tries to bring that kind of experience to stablecoin payments.

## The Main Parts

### TINS

TINS is the **Transfer Identity Number System**.

It creates and resolves 10-digit TINs. A TIN can have public identity context, such as a display name or verification status. Social links can be encrypted and attached to the identity.

### TSN

TSN is the **Transfer Settlement Network**.

It handles the payment settlement path. It separates sender funding from recipient payout.

### Crankers

Crankers are settlement operators.

They watch for valid work, check that payment instructions have not been tampered with, execute payouts, and compete to recover or reimburse vaults.

### Liquidity Vaults

Vaults hold liquidity used for recipient payouts.

They let the recipient receive funds quickly while the protocol reconciles the sender-side escrow through settlement records.

### Epochs And PEAs

An epoch is a time window for settlement accounting.

Each epoch has a **PEA**, which is an isolated reservoir for that epoch. Keeping epochs separate makes accounting safer and easier to audit.

### Commitments

A commitment is a public hash.

It proves that something exists without revealing everything inside it. TrustLink Pay uses commitments to prove settlement work while keeping private routes out of public records.

## Example Payment Flow

1. Alice enters Bob's TIN.
2. TrustLink resolves Bob's public identity details.
3. Alice reviews the identity and approves the payment.
4. The payment enters TSN as settlement work.
5. A Cranker validates the work.
6. Sender-side funds move into the escrow path.
7. A Cranker pays Bob from vault liquidity.
8. The system records commitments and epoch accounting.
9. Recovery or reimbursement happens through the epoch process if needed.

## What The Public Chain Sees

The chain sees transactions, accounts, and commitments.

The design avoids publishing the full private payment route. It does not claim that all activity is invisible. It reduces the easy graph that would normally connect a sender wallet directly to a recipient wallet.

## What The App Shows

The app should show users:

- the recipient TIN
- the recipient display name if available
- verification status if available
- payment status
- escrow or payout transaction references where appropriate

The app should not expose raw private routing data, phone numbers, or internal Cranker-only payloads.

## Community And Ecosystem

TrustLink Pay is also shaped by public feedback, research, and external discussion.

- [Community Mentions](./MENTIONS.md): meaningful posts, write-ups, and public discussions about TrustLink Pay.

## Where To Go Next

- [Architecture](./ARCHITECTURE.md)
- [TINS](./TINS.md)
- [TSN commitment settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker guide](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)
- [Security](./SECURITY.md)

## Developer Toolchain

Devnet deploys are pinned for stability.

Use Solana/SBF `1.18.x` and Anchor `0.30.1`. Do not deploy with Solana/SBF `3.x` or standalone `cargo-build-sbf 4.x` yet because those builders can emit bytecode devnet rejects.

Before deploying, run:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

The deploy lockfiles also avoid newer Rust crates that require edition 2024. That keeps builds compatible with the Cargo version bundled inside the Solana/SBF 1.18 builder.

## Development Observability

TrustLink Pay has development-only tracing for payment, TIN, TSN, Cranker, API, wallet, and notification flows.

It is off by default. It is also disabled in production.

Enable backend and daemon tracing:

```bash
DEBUG_TRACE=true TRACE_LEVEL=debug npm run backend:dev
DEBUG_TRACE=true TRACE_LEVEL=debug npm run tsn:cranker:start
```

Enable frontend tracing:

```bash
NEXT_PUBLIC_DEBUG_TRACE=true NEXT_PUBLIC_TRACE_LEVEL=debug npm run frontend:dev
```

Trace levels:

- `info`: important protocol and API boundaries.
- `debug`: normal development tracing.
- `verbose`: deeper payload summaries.
- `full`: maximum detail after sanitization.

Secrets are redacted. The tracer masks private keys, seeds, mnemonics, bearer tokens, cookies, passwords, signatures, sessions, API keys, and access tokens.

Example wrapper:

```ts
import { traceFunction } from "../utils/observability/tracer";

export const resolveTin = traceFunction(
  async function resolveTin(tin: string) {
    return tinsClient.resolve(tin);
  },
  {
    name: "resolveTin",
    namespace: "TINS",
    module: "services/tins/resolveTin.ts",
    level: "debug",
    includeReturn: false,
  },
);
```

Example trace:

```text
[TRACE] TSN:createSettlementAuthorization
  Module: services/tsn/payment-service.ts
  Args: { amount: "1.25 SOL", senderTin: "123****890", recipientTin: "987****210" }
  Started: 2026-06-19T...
  Duration: 184ms
  Depth: 2
  Status: success
```

Fee accounting is also available for local development:

```ts
import { logFeeBreakdown } from "../utils/observability/fee-tracker";

logFeeBreakdown({
  flow: "TSN Settlement",
  userAmountLamports,
  networkFeeLamports,
  senderFeeLamports,
  claimFeeLamports,
});
```

Run the local fee dashboard:

```bash
npm run debug:fee-summary
```

Example fee log:

```text
[FEE] TSN Settlement
User paid: 1.000000000 SOL
Actual network cost: 0.000005000 SOL
Protocol earned: 0.003000000 SOL
Net protocol result: +0.002995000 SOL
Split:
  LPs: 0.002550000 SOL
  Operators: 0.000240000 SOL
  Treasury: 0.000150000 SOL
  Recovery Bonus: 0.000060000 SOL
```

## TSN + Cranker mediated TINS operations

### Summary

Start new TINS work from the TSN Mempool runtime. Direct user-submitted TIN creation is disabled. Owners sign intent hashes, Crankers verify and relay, and TINS enforces owner authority on-chain.

### Implementation notes

Creation and update begin as `POST /tin-operations` requests in the TSN mempool. The reference Cranker daemon verifies the owner intent, records the fee commitment, then submits `tin_creation_registry` or `tin_update` to TINS.

Run the normal Cranker daemon after the mempool is online:

```bash
npm run tsn:cranker:start
```

### Security & privacy considerations

The owner remains the only authority. Crankers only pay and relay transactions. TINS checks owner-signed intent hashes before creating or updating records.

### Testing notes

Run `npm --prefix tins-sdk run build` and `cargo test --manifest-path tins-registrar/program/Cargo.toml --lib` before changing TINS flows.
