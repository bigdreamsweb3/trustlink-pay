# PROTOCOL.md — what Codex needs to know to direct Arc Builder

This file is the protocol context that Arc Builder does not have and cannot infer. Arc Builder writes
onchain code well and knows nothing about TSN. Codex holds the protocol model, writes the specifications
Arc Builder executes, and reviews what comes back.

**Standing rule:** Codex never asks Arc Builder to "figure out" protocol behaviour. Every Arc Builder
request carries its own minimal context block and an explicit acceptance test. If Codex cannot state the
expected on-chain result, the spec is not ready to send.

---

## 1. The system, in the order data flows

TSN (Transfer Settlement Network) is TrustLink Labs' implementation of DESP, the Decentralized Settlement
Protocol. The design principle is that **identity, authorization, privacy routing, and asset accounting are
separate layers that never share a database**. Each layer owns specific data and nothing else.

### TIP — Transfer Identity Protocol (Solana)

Owns identity. A **TIN** is a portable 10-digit payment identity, not a key and not a token account.

Data TIP owns:
- A registry PDA derived from a **keyed lookup commitment**, not from the TIN or the owner wallet. The
  trusted issuer and the Node share a high-entropy `TINS_LOOKUP_SECRET`; without it the PDA cannot be
  derived and the identity envelope cannot be decrypted. There is no all-zero public fallback.
- The owner authorization binding a TIN to an owner wallet.
- An encrypted identity envelope (the display identity a sender confirms before paying).
- A **route commitment** per TIN, plus a versioned GPRU ElGamal scan public key and its key commitment.
- An append-only shared route Merkle root.
- A separate owner-recovery PDA.

Resolution is **by requested TIN**, never by enumeration. The Node derives the PDA, validates current
state, and returns a display identity — never seeds or child private keys.

What this means for Arc: a TIN cannot be resolved on Arc, by anyone, ever. Arc must not receive the TIN,
the registry PDA, the lookup secret, or the display identity. It receives a **route commitment**.

### TSN — coordination layer (Solana programs + services)

Owns authorization and submission, not value. A payment is a signed **intent**; the **Node** verifies it
and signs permits; the **Receiver** durably stores ingress work and issues leases; the **Cranker** submits
the exact authorized transaction and pays fees but cannot alter bound fields. The escrow program holds
intents, an epoch treasury, a cranker registry, private-settlement state, and permit logic.

### GPRU — Guarded Privacy Routing Unit (Solana program)

Owns routing privacy. Verifies a one-time ElGamal DNA key derivation and an encrypted-credit transition
(initial encrypted credit, or homomorphic addition against a supplied predecessor ciphertext). A separate
Groth16 hidden-head verifier exists in source but is **not called** by Node, SDK, Cranker, or the active
credit instruction, and the repo does not establish circuit compilation, setup, prover, or end-to-end
execution. GPRU does not custody assets.

### TCAP — Transfer Confidential Asset Protocol (Solana program)

Owns assets and liabilities. Asset registry, reserve vault, per-asset policy, one-time tips, and a **single
global commitment root** that the wired credit transition advances after checking the root predecessor and
the next global sequence. Nullifier registry for exits. The encrypted Memo payload is transaction data, not
a stored per-TIN balance account.

Known limit, inherited by everything built on top: **there is no persistent per-TIN latest-head state.**
The shared root prevents replay of a global transition but does not prove the supplied predecessor is the
latest ciphertext for that TIN. Confidential debit and exit are proof-gated and not established end to end.

### Cross-chain destination path (existing, EVM)

`services/tsn-crosschain/` holds `CreditcoinSettlementHub`, `DestinationRegistry`, `DestinationLiquidityASC`,
`DestinationLiquidityRegistry`, `TSNSettlementExecutor`, `TSNERCLiquidityVault`, and per-network adapters.
Authenticity for a destination payout comes from Attestcoin/USC proofs over a Creditcoin-anchored event.
`TSNSettlementExecutor.SettlementMessage` currently includes `tinHash` and `sealedTipHeadHash` and emits them
in `SettlementExecuted`. **That is a privacy regression on the outbound path** — see §4.

### DIP — Deposit Ingress Protocol (new, this round)

Owns the *entry* of external value. The mirror of TIP: TIP is how identity enters, DIP is how value enters,
and neither layer sees the other's data. Full specification: `tsn-docs/layers/dip.mdx`.

DIP-Arc flow: TIN entered in the app → Node resolves to `routeCommitment` → Arc router records intent, pulls
USDC through the 6-decimal ERC-20 interface, calls CCTP `depositForBurn` with `mintRecipient` = the shared
TSN reserve → CCTP attests → mint on Solana into the reserve → Receiver ingress → Node binds commitment to
route → Cranker submits the credit → TCAP root advances, recipient's encrypted balance increases → Node
issues an encrypted receipt envelope.

The only link between the chains is the `routeCommitment` plus the Node's own records.

---

## 2. Division of labour

| Party | Owns | Never does |
| - | - | - |
| **Codex** | protocol model, specifications, invariant review, repo integration, docs | invent protocol behaviour; deploy to mainnet |
| **Arc Builder** | Solidity contracts, their tests, the app, testnet deploys | decide protocol facts, touch Solana, deploy to mainnet |
| **Human** | mainnet deploy with arc-foundry, funding, submission, video | hand keys to an agent |

### The spec packet Codex sends to Arc Builder

Every request is self-contained. Arc Builder has no memory between sessions and no knowledge of TSN.

```
CONTEXT (restate every time, 10 lines max)
- TSN is a settlement network on Solana: identity (TIN), privacy routing, confidential balances.
- This app is the identity-free entry point. Arc must never learn a TIN, a recipient, or a balance.
- Arc sees: payer address, amount, one opaque bytes32 routeCommitment, expiry.
- USDC on Arc: 6-decimal ERC-20 interface at 0x3600…0000. Gas is USDC. Chain ID 5042.
- Money crosses by CCTP. Mint recipient is one shared reserve address, never a per-user address.

GOAL
<one sentence, in terms of observable on-chain effects>

CONTRACTS
<file, struct fields, function signatures, events, access control>

INVARIANTS (violating any of these means the feature is worthless)
<the applicable subset of §3>

TESTS
<each as: given / when / then, including one revert test per invariant>

ACCEPTANCE
<what Codex will check after the export: ABI shape, event fields, decimal units, no identity strings>

FORBIDDEN
<no TIN in state/events/calldata; no route allowlist; no refund path; no admin fund movement;
 no new dependencies; no Solana code; no mainnet deploy>
```

If a spec cannot fill ACCEPTANCE with something mechanically checkable, rewrite it before sending.

---

## 3. DIP invariants — the checklist Codex reviews against

1. No TIN, recipient address, or plaintext identity in state, events, calldata, or arguments.
2. `intentId` unique per (payer, commitment, amount, expiry). No reuse.
3. Mint recipient is one shared reserve, set at deploy, never derived per deposit.
4. One credit per `intentId`; the Node refuses a second authorization.
5. Credits never exceed verified reserve inflow for the epoch.
6. No admin path can move user funds; the router holds nothing between transactions.
7. Pause blocks new deposits only; burned intents still complete.
8. All accounting in 6-decimal ERC-20 units, never the 18-decimal native view.
9. Never pay `address(0)`.
10. No refund path after burn; document the gap instead of inventing a function.

**Review procedure after every Arc Builder export:** grep the diff for `tin`, `tinHash`, `recipient`,
`displayName`; decode the event ABIs and confirm no identifying field; read every arithmetic site for the
decimal view; confirm `mintRecipient` is read from config and is not assignable per call; run the tests;
then update the conformance register in §5.

---

## 4. Open protocol findings (decided, do not relitigate mid-round)

**F-1 Outbound path leaks `tinHash`.** `TSNSettlementExecutor` includes `tinHash` and `sealedTipHeadHash`
in `SettlementMessage` and emits them. Same for `SepoliaAnchor.recordTinExit`, which writes both to public
EVM state and is callable by anyone. Decision: **defer.** This is a protocol change that crosses the Solana
exit path, the anchor ABI, and the SDK's exit replay key. It cannot be validated before the submission
deadline, and shipping a half-migrated exit path is worse than shipping a documented gap.
Action: open `DIP-RFC-001 — commitment-only destination payload`, scope it as: drop `tinHash` and
`sealedTipHeadHash` from the public payload, bind both inside the attestation digest, migrate the anchor
and the SDK replay key, version the ABI. Do not start before the round closes.

**F-2 No persistent per-TIN latest head.** Inherited, not introduced. DIP does not fix it and must not
claim to.

**F-3 APS is not live.** Arc's own docs state privacy features are on the roadmap. Never claim confidential
amounts on Arc. Data minimisation is the claim; APS is the roadmap.

---

## 5. Conformance register — DIP-Arc

| ID | Item | Status | Owner |
| - | - | - | - |
| C-1 | Router invariants 1,2,6,7,8,9 | conforms per Arc Builder report | Arc Builder |
| C-2 | Event indexes `routeCommitment`; doc says unindexed | **code is right, doc is stale** | Codex: amend `dip.mdx` |
| C-3 | Handoff payload carries CCTP domains, no nonce | conforms — Node must read nonce from the attestation by Arc tx hash | Node |
| C-4 | `src/lib/chain.ts` replaced lost generated helpers | **unreviewed — highest risk in the repo** | Codex: line-by-line review |
| C-5 | Encrypted receipt envelope (flow step 6) | not built | Node |
| C-6 | Tests run against mocks only; no real CCTP deposit | open | Human + Arc Builder |
| C-7 | Solana mint + TCAP credit untested | open — this is the "end to end" evidence level | Human |
| C-8 | Deploy-time assertion that `reserveMintRecipient` is the shared reserve | missing | Arc Builder: add a post-deploy check script |

**C-4 is the one to do first.** A helper file written to make imports compile is exactly where a 6-vs-18
decimal bug enters, and that bug is silent: the deposit succeeds and the amount is wrong by 10^12. Read it
against the Arc constants table before any further feature work.

---

## 6. Fixed facts

| Item | Value |
| - | - |
| Arc chain ID / RPC / explorer | 5042 / https://rpc.mainnet.arc.io / https://explorer.arc.io |
| Gas token | USDC (not ETH) |
| USDC ERC-20 interface | 0x3600000000000000000000000000000000000000 — 6 decimals |
| Native USDC view | 18 decimals — never used in accounting |
| CCTP TokenMessengerV2 | 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d |
| CCTP MessageTransmitterV2 | 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64 |
| Arc CCTP domain | 26 |
| Solana CCTP domain | 5 — verify against Circle's table before config |
| maxFeePerGas floor | 20 gwei |
| Finality | sub-second |

Arc Studio / Arc Builder deploys to **testnet only**. Mainnet is a human step with arc-foundry.

---

## 7. What "ready for the submission" actually means

The round scores real USDC moved on mainnet (30%), Arc Builder used across contracts + tests + app (25%),
a working product (25%), potential to go further (20%). Therefore:

- Do not add features. Close C-4, then C-2, then C-8, then produce mainnet evidence.
- Evidence is a contract address plus a transaction hash anyone can open on `explorer.arc.io`, plus the
  Solana-side mint and credit if they exist. Anything not demonstrable that way does not count.
- Record every milestone with its hash in `EVIDENCE.md` as it happens, not afterwards from memory.
- Never describe the build as live while the end-to-end row (C-7) is unmet. The docs' own evidence
  discipline is the credibility argument with reviewers.
