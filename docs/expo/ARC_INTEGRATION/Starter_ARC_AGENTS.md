# AGENTS.md — TrustLink Pay / DIP-Arc

You are working in the TrustLink Pay repository. This file is your standing brief: read it fully before
touching code, and re-read the "Hard constraints" section before any commit.

---

## 0. Before you write anything

Report back, in one short block, what you found:

1. Framework, package manager, TypeScript config, and the wallet library already in use (read
   `package.json`, `tsconfig.json`, and one existing page).
2. Directory conventions (is this a monorepo? where do new features live?).
3. Test runner and lint command, and whether the repo currently passes them.
4. Any existing Arc, CCTP, or USDC code — do not duplicate what is already there.

Then follow the repo's existing conventions, not your defaults. If a convention conflicts with this brief,
ask before choosing.

---

## 1. What this repository is

TrustLink Pay is the payment application surface for TSN (Transfer Settlement Network) by TrustLink Labs.
TSN is a settlement network: identity (TIP/TIN), guarded privacy routing (GPRU), and confidential asset
accounting (TCAP) live on Solana. Records are coordinated by a Node, submitted by a Cranker, and the
internal ledger is a TCAP commitment state with encrypted balances.

Authoritative documentation (read these before designing anything):

- Protocol docs index: https://trust-link-tsn.mintlify.site/llms.txt
- Full docs text: https://trust-link-tsn.mintlify.site/llms-full.txt
- Architecture source of truth: https://github.com/Trustlink-Labs/TSN-Protocol
  (`tsn-docs/`, `services/tsn-node/`, `services/tsn-crosschain/`, `sdks/tsn-sdk/`)

If the network is unavailable, ask for the local copy of `tsn-docs/` rather than guessing protocol
behaviour. **Never invent protocol behaviour.** If a fact is not in the docs or the code, say so.

---

## 2. What we are building now: DIP-Arc

**DIP (Deposit Ingress Protocol)** is the identity-free window where external stablecoin value becomes an
internal TSN liability. DIP-Arc is its first implementation, on Arc.

Flow, in one paragraph: a user holding USDC on Arc enters a 10-digit TIN. The TSN Node resolves it to an
opaque `routeCommitment`. The DIP Router on Arc takes the USDC, calls CCTP `depositForBurn` with the mint
recipient set to the **TSN reserve**, and emits an intent keyed by that commitment. On Solana, CCTP mints
into the reserve and TSN credits the recipient's private balance. The only link between the two chains is
the `routeCommitment` plus the Node's records.

Full specification: `tsn-docs/layers/dip.mdx` in the TSN-Protocol repo (page `layers/dip`). Read it before
writing the contract; the invariants below are the short version.

### Scope of this work

IN SCOPE
- Arc-side deposit router contract (Solidity) and its tests.
- App surface: TIN entry, resolve step, deposit with CCTP burn, receipt list, handoff payload export.
- README and evidence log.

OUT OF SCOPE — do not touch
- Any Solana program, Rust, or Anchor code. The Solana side is an existing system.
- The existing TSN credit path, Node, Receiver, or Cranker services.
- Existing TrustLink Pay flows: this is **additive only**. Do not refactor, rename, or restyle what is
  already shipped unless the change is strictly required for the new feature, and then ask first.

---

## 3. Hard constraints

These are the product, not implementation detail. Violating any of them means the feature provides no
privacy at all.

1. **No TIN on chain.** No TIN, recipient address, or plaintext identity in contract state, events,
   calldata, or function arguments. Only `bytes32` commitments.
2. **Mint recipient is the shared reserve**, configured at deploy time, never derived from a commitment or
   a recipient. If any code path can change that per-deposit, stop and escalate.
3. **No route allowlist on chain.** The chain never decides whether a TIN is valid; the Node does. Junk
   deposits are acceptable by design.
4. **No admin path moves user funds.** The router holds no balance between transactions.
5. **USDC decimals.** Arc's USDC has an 18-decimal native view and a 6-decimal ERC-20 interface at
   `0x3600000000000000000000000000000000000000`. **All accounting uses the 6-decimal ERC-20 interface.**
   Never mix the two. A 10^12 error here is silent and fatal.
6. **Never pay `address(0)`** — on Arc that reverts instead of succeeding.
7. **No refund path after burn.** Once USDC is burned it is in the other domain. Do not invent a refund
   function; document the gap instead.
8. **TIN handling in the app.** The TIN may exist in memory during resolve. It must never reach
   `localStorage`, cookies, logs, analytics, query strings, error reports, or a screenshot-visible DOM
   node after the resolve step.
9. **No secrets in the repo.** No private keys, no mnemonics, no funded test keys committed.

### Arc facts

| Item | Value |
| - | - |
| Chain ID | 5042 |
| RPC | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.arc.io |
| Gas token | USDC (not ETH) |
| USDC ERC-20 interface | 0x3600000000000000000000000000000000000000 (6 decimals) |
| CCTP TokenMessengerV2 | 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d |
| CCTP MessageTransmitterV2 | 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64 |
| Arc CCTP domain | 26 |
| Solana CCTP domain | 5 — verify against Circle's domain table before config, do not assume |
| maxFeePerGas floor | 20 gwei |
| Finality | sub-second; no confirmation count needed |

Source for these: https://docs.arc.io/arc/references/contract-addresses.md and
https://docs.arc.io/arc/references/connect-to-arc.md.

---

## 4. Build path — Arc Studio owns the onchain work

The contracts, their tests, and the app are built in **Arc Studio** (the onchain coding agent), then
exported to GitHub. This repository receives the exported code. Two consequences:

- Prefer changes that survive an Arc Studio export: one contract file per contract, tests beside it,
  no bespoke build tooling, no generated files that conflict with the Studio workspace.
- **Arc Studio deploys to testnet only.** Mainnet deployment is a manual, human-executed step with
  arc-foundry. Never attempt a mainnet deploy, never ask for a funded key, never add a script that would
  do it automatically.

Work order: contract and tests → app → README → evidence log. Keep commits small and named for the
behaviour they add.

---

## 5. Definition of done

- [ ] Contract compiles with no warnings; tests cover: happy path, zero amount, zero commitment, past
      expiry, duplicate intent, messenger revert (payer keeps funds), insufficient approval, reentrancy
      attempt, paused router, owner-only setters, and an assertion that the deposit event ABI contains no
      field other than the payer that could identify anyone.
- [ ] App: resolve → deposit → receipt works end to end against Arc testnet; the handoff JSON is
      copyable and matches the schema in `layers/dip`.
- [ ] README documents the flow, addresses, the no-refund property, the decimal rule, and the trust model
      (money leg is CCTP-attested; identity leg is Node-bound and never on chain).
- [ ] `EVIDENCE.md` logs each milestone with tx hashes and explorer links as they are produced.
- [ ] Lint and tests pass; no secrets in the diff.

---

## 6. Context you need about the round we are shipping for

Arc Microgrants: "Built with Arc Studio" (DoraHacks `arc-microgrants-2`). Eight 500 USDC grants, closes
**1 November 2026**, reviewed in batches. Scoring, in order: real USDC moving on Arc mainnet (30%),
Arc Studio used across contracts + tests + app (25%), a working product (25%), potential to go further
(20%). Submission requires the Arc Studio project URL, a live app link, contract addresses plus an example
mainnet tx hash, a public repo, and a video walkthrough.

What this means for your decisions: a small, complete, verifiable feature beats a large unfinished one.
Anything that cannot be demonstrated with a mainnet transaction hash does not count. Optimise for the demo
path being reproducible by a human following the README.

---

## 7. How to work

- Ask before changing anything architectural. Do not ask about naming, formatting, or file placement
  inside agreed conventions.
- Prefer the smallest change that satisfies the invariant. No speculative abstraction, no new dependencies
  without a stated reason.
- When you discover a conflict between this brief and the existing code, stop and report it rather than
  silently choosing one.
- Escalate immediately if a task appears to require: changing the mint recipient semantics, touching
  decimals handling, holding a key, deploying anywhere, or modifying the TSN protocol services.
- State evidence levels honestly in docs and comments: source, build, deployment, and confirmed
  transaction are different things. Do not describe anything as live until a transaction proves it.
