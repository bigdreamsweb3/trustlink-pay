# Start Here

This document explains TrustLink Pay without assuming you already know Solana payment architecture.

## What Is TrustLink Pay?

TrustLink Pay is an identity-first Web3 payment system that lets a person receive stablecoins through a **Transfer Identity**.

A Transfer Identity can contain a 10-digit **TIN** (**Transfer Identity Number**), public-safe identity context, verification fields, and PRU routing commitments. The wallet address stays behind the payment system.

## Why It Exists

Crypto payments are still too address-first.

A wallet address is hard to read, hard to verify, and easy to track once it becomes public. TrustLink Pay gives users a simpler payment identity and uses TSN settlement to avoid showing a simple direct sender-to-recipient payment path.

## The Real-World Analogy

Think of a TIN like an account number inside a broader identity profile.

When someone pays a bank account, they do not need to know the bank's internal ledger process. They only need enough information to trust that they are paying the right person.

TrustLink Pay tries to bring that kind of experience to stablecoin payments.

## The Main Parts

### TIS: Transfer Identity System

TIS is the identity layer.

It creates and resolves Transfer Identities. A Transfer Identity can have a 10-digit TIN, public identity context, a display name, verified legal-name status, encrypted social links, and PRU commitments.

### PRUs

PRU means **Privacy Receiving Unit**.

Every upgraded Transfer Identity has 30 PRUs by default. Recipient payouts land in PRU routes instead of the public owner wallet. The user's TIN balance is the sum of supported token balances across those PRUs.

### TSN

TSN is the **Transfer Settlement Network Protocol**.

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
7. A Cranker pays Bob into a PRU route.
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
- TIN balance and wallet balance as one usable payment balance where appropriate
- escrow or payout transaction references where appropriate

The app should not expose raw private routing data, phone numbers, or internal Cranker-only payloads.

## Protocol Boundary

TIN creation, upgrade, and update follow one rule:

- frontend signs the owner intent
- frontend sends that signed intent directly to the TSN mempool backend
- TSN mempool backend assembles private TIN payloads
- Crankers perform the on-chain Transfer Identity mutation

TrustLink backend is not a bridge for TSN protocol work. It can store app-local identity state and display status, but it must not proxy TIN upgrade or creation requests into TSN.

Payment execution follows the same boundary. The frontend signs canonical TSN messages. TSN mempool and Crankers handle settlement work. TrustLink backend records product state and display-safe status; it does not become the settlement protocol.

## Developer Mental Model

Use this rule when deciding where code belongs:

| Concern | Belongs in |
| --- | --- |
| User screens, confirmation, and status display | TrustLink frontend |
| App records, notifications, payment history | TrustLink backend |
| TIN creation or upgrade intents | TSN mempool |
| PRU route material and spend permits | TSN mempool and Crankers |
| On-chain settlement execution | TSN program and Crankers |
| Transfer Identity registry mutation | TIS program through Crankers |
| Solana RPC routing | TSN RPC gateway |

## Community And Ecosystem

TrustLink Pay is also shaped by public feedback, research, and external discussion.

- [Community Mentions](./MENTIONS.md): meaningful posts, write-ups, and public discussions about TrustLink Pay.

## Where To Go Next

- [Architecture](./ARCHITECTURE.md)
- [Transfer Identity System](./TRANSFER-IDENTITY.md)
- [TSN](./TSN.md)
- [Developer Guide](./DEVELOPER.md)
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

## RPC Routing

TrustLink Pay now resolves Solana RPC through one shared gateway entry point.

Set the app-facing URL once:

```bash
TSN_SOLANA_RPC_URLS=http://127.0.0.1:8787
```

The frontend reads the same shared value automatically at build time.

The gateway then reads its upstream list:

```bash
TSN_SOLANA_RPC_UPSTREAM_URLS=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY,https://api.devnet.solana.com
```

Inspect the current selection:

```bash
npm run rpc:inspect
npm run rpc:gateway:inspect
```

Start the local gateway:

```bash
npm run rpc:gateway:dev
```

This keeps the protocol on one controlled RPC path while still letting the gateway route to the fastest or healthiest upstream provider.

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
    namespace: "Transfer Identity",
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


## PRU Architecture v1: 30 private routes per TIN

### Summary

We treat a TIN as a static identity record plus exactly **30 token-agnostic PRUs**. The TIN Registry stores the identity PDA, encrypted TIN Master Seed blob, and commitments. TSN stores or derives lifecycle state for receipt, spend, sweep, and lazy ATA activation.

### TIN creation flow

The user signs a TIN creation intent. The frontend sends it directly to the TSN mempool. The mempool and Cranker layer generate the TIN Master Seed, derive exactly 30 token-agnostic PRUs, encrypt private material, and publish only commitments through Cranker-submitted registry transactions.

### Implementation notes

- TypeScript: the frontend signs owner intents and payment authorizations. It does not derive PRUs, generate TIN Master Seeds, or handle PRU configuration.
- TIN balance: after authentication, the frontend asks the TSN mempool for the finalized public PRU address list using the owner's hash commitment, then sums supported token accounts across those 30 PRUs through the RPC gateway.
- Python Cranker daemon: verify intent, submit Transaction 1 fee commitment, submit Transaction 2 registry call, and keep PRU seeds out of logs.

### Security & privacy considerations

Do not expose raw wallet addresses, balances, PRU private material, phone numbers, or public PRU arrays to unauthenticated users. Authenticated owners can load their own public PRU addresses for balance reads. Deterministic allocation is replayable for verification; randomized PRU signing is local to the SDK and prevents a single always-active wallet pattern.

### Usage and testing

```text
Frontend signs owner intent
TSN mempool assembles encrypted TIN Master Seed and PRU commitment
Cranker A records fee commitment
Cranker B submits the registry mutation
```

```bash
npm --prefix tsn-protocol/tsn-sdk test
npm --prefix tin-system/tins-sdk run build
```

## TSN + Cranker Mediated Transfer Identity Operations

### Summary

Start new Transfer Identity work from the TSN Mempool runtime. Direct user-submitted TIN creation is disabled. Owners sign intent hashes, Crankers verify and relay, and the Transfer Identity program enforces owner authority on-chain.

### Implementation notes

Creation and update begin as `POST /tin-operations` requests in the TSN mempool. The reference Cranker daemon verifies the owner intent, records the fee commitment, then submits `tin_creation_registry` or `tin_update` to the Transfer Identity program.

Run the normal Cranker daemon after the mempool is online:

```bash
npm run tsn:cranker:start
```

### Security & privacy considerations

The owner remains the only authority. Crankers only pay and relay transactions. The Transfer Identity program checks owner-signed intent hashes before creating or updating records.

### Testing notes

Run `npm --prefix tin-system/tins-sdk run build` and `cargo test --manifest-path tin-system/tins-registrar/program/Cargo.toml --lib` before changing Transfer Identity flows.
