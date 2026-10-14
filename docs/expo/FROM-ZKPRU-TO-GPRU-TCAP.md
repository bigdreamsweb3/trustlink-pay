# From ZK-PRU to GPRU + TCAP

**TrustLink Labs · Transfer Settlement Network**  
**Experiment log · March 2026 → 8 September 2026**

This is not a product brochure. It is the record of what we built, what broke, what we deleted, and what finally worked on Solana Devnet. Every major path below was tested for real: programs deployed, accounts migrated, transactions confirmed or rejected with logs.

---

## 1. Why this document exists

Between roughly **March 2026** and **September 2026** the protocol did not evolve in a straight line. It went through:

1. **ZK-PRU** — private receiving units as the balance and route layer
2. Hard **security audits** on escrow, recovery, crankers, and nonces
3. **Epoch treasury + Settlement DNA** — kill per-payment escrow correlation
4. **GPRU + TCAP** — authorization without custody, private balance without public amounts
5. Months of **Devnet deploy / migrate / repair** until Path 1 funding+credit passed

If search engines or future engineers still see “ZK-PRU” associated with TrustLink, this file is the authoritative story: **ZK-PRU was a real experiment, it failed product constraints, and it is retired.** The live architecture is **TIN → GPRU → Epoch treasury / TSN → TCAP tip + sealed private balance → two-phase settlement**.

---

## 2. North star (unchanged since the start)

- **Identity-first payments** — pay a **TIN** (10-digit Transfer Identity Number), not a raw base58 string.
- **Non-custodial** — device holds keys; operators submit work; chain enforces rules.
- **Private balance** — observers should not read balances off public account fields.
- **Verifiable settlement** — every credit, transfer, and exit must be authorized and one-time.
- **Devnet-only testing on this machine** — no localnet; every program change means **build → deploy → test** on Devnet.

---

## 3. Act I — ZK-PRU (early 2026)

### What we tried

**ZK-PRU** (Zero-Knowledge / private receiving units) was the first protected-receiving design:

- Child keys and route material under a TIN
- Receive and spend through PRU accounts
- Crankers + Nodes coordinating funding and payout
- Escrow-shaped settlement and recovery paths on TSN

The goal was right: hide the recipient surface and stop “send to a naked ATA” as the only model.

### What went wrong

Security work and production pressure exposed structural problems:

| Problem                                      | Why it mattered                                             |
| -------------------------------------------- | ----------------------------------------------------------- |
| Keys / route material too close to operators | Any leak path toward Node/Receiver/Cranker was unacceptable |
| Per-payment escrow objects                   | On-chain join keys between funding and payout               |
| Recovery / reimbursement races               | Critical findings: cranker drain and stranded escrow        |
| Nonce and lease races                        | Concurrent workers could double-consume authorizations      |
| Product complexity                           | “Private balance” still felt like crypto plumbing           |

ZK-PRU was not abandoned because the team got bored. It was abandoned because **custody boundaries and linkability could not be made clean** without becoming a different protocol.

**Status:** retired. Historical only. See also internal notes that once lived as `docs/zk-pru.md` / `ZK-PRU-RETIRED` style pages — the product surface must not describe ZK-PRU as current.

---

## 4. Act II — Audit season (mid journey)

A deep audit posture was applied to the Solana payment stack (TSN + TIN + Cranker + Receiver + Node + program):

- Private keys must never leave the device
- Replay / nonce must be atomic
- Lease ownership must bind permits
- Crankers must not rewrite amount, route, or recipient
- Escrow reimbursement must be lineage-bound
- Receiver must redact recipient data

### Concrete classes of failure we fixed in code

1. **Critical recovery drain** — recovery could be abused to move escrow to a hostile vault. Fixed by lineage binding (payment id, commitment, amount, original cranker, nullifier) and internal-only recovery creation after confirmed payout.
2. **Escrow stranding** — successful payout without atomic reimbursement. Fixed by reimbursing and closing in the same payout path where possible.
3. **Nonce races** — `hget` then `hset` replaced with **consume_once** (domain \| action \| sender \| nonce).
4. **Receiver redaction** — plaintext payment payloads encrypted at rest; cranker views minimized.
5. **Lease → permit binding** — lease id, version, expiry in signed permits and on-chain checks.
6. **Per-operator cranker auth** — challenge-response, no client-supplied `crankerId` ownership.
7. **Private payout escrow substitution** — permits bound to escrow / record / funding lineage so a cranker cannot attach payment A’s permit to payment B’s accounts.

These fixes were necessary on the old path. They also taught the harder lesson: **patching escrow forever is not a privacy architecture.**

---

## 5. Act III — Epoch treasury, DNA, and “no payment PDA”

### The privacy argument

If every payment creates a unique escrow or DNA account that later appears in settlement, observers join:

`funding tx → escrow PDA → payout tx → destination`

So the architecture moved toward:

- **Funding** increases **epoch-level** treasury liability
- **Settlement / refund** consume an **opaque claim** (first valid wins)
- **No per-payment escrow PDA** on the happy path
- **Mother / Settlement DNA** as one-time authorization capability, not a public balance wallet

Crankers lease **AUTHORIZED_FUNDING** then **SETTLEMENT** (or exit intent then exit settlement). Test harnesses may chain both in one process; production is two work items.

### Honest limit

Shared unique accounts across two transactions are still join keys. Commitment hashes hide cleartext destinations on intent txs; they do **not** by themselves give cryptographic unlinkability against a determined chain analyst. Stronger unlink needs aggregate pools and careful batching — documented as future work, not marketing claims.

---

## 6. Act IV — GPRU and TCAP

### GPRU — Guard Privacy Routing Unit

- **Not a wallet**
- **Never holds balances**
- Temporary, scoped **authorization / routing** identity derived from privacy-receiving roots
- Signs / binds scope; does not become the place “money lives”

### TCAP — Transfer Confidential Asset Protocol

- Owns **private balance state** for a TIN relationship
- **Tip** account: ordering, sequence, commitments, sealed head — not plaintext balances
- **Encrypted snapshots** for owner-local reads
- **Credits** advance tip under TSN authorization receipts
- **Debits / exits** are proof-gated or two-phase; live confidential arithmetic is fail-closed until audited proofs exist where required

### TSN still coordinates

- Mother escrow authority
- Epoch / funding coordination
- CPI wrappers that register TCAP authorizations
- Cranker-facing work is operational, not custodial private state

**Canonical names (corrected over time):**

| Acronym | Meaning                                                                                 |
| ------- | --------------------------------------------------------------------------------------- |
| TSN     | Transfer Settlement Network                                                             |
| TIN     | Transfer Identity Number                                                                |
| TIP     | Transfer Identity Protocol / identity stack (and “one-time tip” accounts in TCAP tests) |
| TCAP    | **Transfer Confidential Asset Protocol** (not “Token Control…”)                         |
| GPRU    | Guard Privacy Routing Unit                                                              |

### Devnet program IDs (stable in this era)

| Program                             | ID                                            |
| ----------------------------------- | --------------------------------------------- |
| TSN `trustlink_escrow`              | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |
| TCAP `tcap`                         | `tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF` |
| TIP / TIN registrar (when deployed) | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

Upgrade authority in these experiments: `78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX`.

---

## 7. Act V — Devnet war journal (July–September 2026)

This machine **cannot run Solana localnet**. Every instruction change meant:

```text
build (--no-idl under Rust 1.94 + Anchor 0.30.1)
→ deploy doctor / lockfile stabilize
→ program deploy (QUIC, fall back RPC)
→ solana program show
→ scenario runners
```

### Tooling scars

- Anchor IDL generation failed on host Rust **1.94** (`proc_macro` span APIs). Workaround: **`anchor build --no-idl`**, deploy `.so` only.
- QUIC upload often failed (“N write transactions failed”); **RPC recovery path** completed many deploys.
- ProgramData **extend** required when TCAP artifact grew.

### Bootstrap and governance

- TCAP config layout migration (`migrate_tcap_config_layout_v1`) — old pre-proof-verifier config could not deserialize.
- Commitment root init required governance-approved empty root (Devnet fixture domain-separated value, not a fake Merkle claim).
- Tip root for tests: controlled Devnet derivation from fixture wallet + label — **not** inventing a root that implies ownership of a real user TIN.

### Reserve and tip liability

Example reserve migration (transfer-pending field):

- Reserve `3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d`
- `193 → 201` bytes
- Signature `VFp2Xv6H2X6tLeoE7yMdA1VTpQZ41wx27WSJYtgfqWAU8z5YxcVCHHTyeSnB3LPDM48ciKYMUMcaGCKiJaqBGzP`

User B tip liability init:

- Tip `GBQdwd13J9xTNat4rc96eTqNqQcFab8NbfuTgnPHsKJN`
- Liability `4JhLphoCAqkNaA1eFkFw9AP3qbW5GxicePfk7g5QJEbs`
- Signature `5CyCtVJuEPjS9cvZ8Lo3RJoQpuRkmSK2QVFmBAWbGaA8ppqpwNaGDt4eaRFZkeu1YEEGc5Roacc9qNU961ya6Fb9`

### Seal migration failure (important)

After tip seal migrate reported **MIGRATED**, on-chain inspection showed:

| Field                      | Observation                       |
| -------------------------- | --------------------------------- |
| `dataLen`                  | 198 (size grew)                   |
| `sealed` @ 48..96          | **all zeros**                     |
| `sealCommitment` @ 96..128 | non-zero (layout / partial write) |

Client runners correctly threw **`NEED_TIP_SEAL_MIGRATE`**. Re-running migrate did not heal zero sealed bodies.

**Repair path:** governance `repair_tip_seal_v1` after a focused TCAP redeploy.

- Repair signature: `3uHfvmE6rrpCwp3Y3kJaZJn6dTDWTv2CiAdmyHLdbBPXDmPYaiKnAbxubKKDJ9nShLtKfx5Efh4GmytASNkTRhG6`
- Tip: `6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj`

Lesson: **a successful migrate transaction is not proof of a valid seal.** Always read account bytes.

---

## 8. What actually worked on Devnet (Path 1)

After repair, **deposit + credit** completed for user A:

### Funding (`deposit_asset_v2`)

- Signature: `W8hsQQcyxScSPgp9ws1kYKXb8oRKgx8XtNLsNvFEkA4hPD1yEDd6MnenPgRfDG3kEaS5eGcK3Qaq8azXGSN7sFn`
- Amount: `1_000_000` base units
- Governed vault: `2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh`
- Vault delta: `+1_000_000`

### Credit (`tsn_register_tcap_one_time_credit` → `credit_one_time_tip`)

- Signature: `2UrzxVTF7u4BuKBAaYSHiHZU85azNEzjcQTzNivTTZtH6X4vBhgW2ZY9byqNMuLPhfRvEmNqmJK66jfkrs2rFmky`
- Tip: `6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj`
- Sequence: **32**
- Available: **0 → 1_000_000**
- Unlinkability check on credit: **no funding ATA / vault / per-deposit PDA in the credit tx account set**

That is the first clear proof of the **TCAP credit path as designed**: funding is public vault movement; private tip advances separately under TSN authorization.

### Mother escrow (recurring across experiments)

`ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR`

### Config / registry (recurring)

- Config: `2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY`
- Asset registry: `6oGZV9yt5M6uPH66UZPhJZsGsqfJg2Ec1mtV8VEjQjbE`

### Stable test mint (Devnet)

`9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK` (2 decimals in early faucet experiments)

---

## 9. Exit path — success and failure mixed

### Earlier single-path debit-exit experiment

A runner once reported:

```text
private TIP debit -> public wallet exit
signature: 5nCqZzqy7wYU1nEyMK84o12epP6W6bHvRqxqSmkbTGREAvPeNWJ4YgzHuriHkmTHYn3SgKnabdZpAmWhPFMCyaTF
destination: GRx2SwHBhqpBWc8NtQBSJHDcZAh6EioEjtxBdtufY4i6
vaultDelta: -1000000
```

That proved **vault could pay a public wallet** after a tip debit in an older wiring. It is **not** the final two-phase commitment exit.

### Two-phase exit (target design)

1. **Intent** — debit tip + liability; store **commitment** `H(dest ‖ ata ‖ amount ‖ mint ‖ nonce ‖ tip ‖ seq ‖ …)`; no cleartext dest in accounts if possible.
2. **Settlement** — open commitment; vault → ATA; **no source TIP** in payout accounts.

Test orchestrator: one npm process. Production: two crankers / two work items.

### Open failure (8 Sep 2026 era)

```text
TsnRegisterTcapExitDebitV1
AnchorError account: system_program
InvalidProgramId
Left:  GFtayhjBwQsRe7rKKUiPzcYW3Uh5Ed8B7KJgqDfUEcv3
Right: 11111111111111111111111111111111
```

**Cause:** JS (or account meta order) put the wrong pubkey in the `system_program` slot.  
**Fix class:** align builder account order with the Rust accounts struct — **no philosophy change**.  
Until fixed, two-phase exit simulation fails before debit lands.

---

## 10. Older on-chain archaeology (ZK-PRU / private payout era)

For completeness, early settlement traces still exist on explorers — for example private payout confirmations under TSN with Ed25519 verify + `TsnExecutePrivatePayout`, CrankerVault-shaped accounts, and USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` in some flows.

Those transactions prove **we shipped real settlement machinery**, not slides. They also prove **why the rewrite happened**: the account graphs were rich, legible, and easy to correlate once you followed PDAs.

Intent / PRU setup / settlement sample links from the experiment notebook (Devnet):

- Wallet top-up and PRU setup txs (explorer)
- Settlement tx `46wGVb9sfBqWWonk3CQ14xZCc6Qzf2ksYyZMpG4TDhqzhh49pRS59CjhCgq9oPVnfEVhSKdJyb3Rib7HM99A8TfU`

Treat them as **museum pieces**, not the current API.

---

## 11. Architecture that survived (as of this log)

```text
Device
  signs payment / funding authorization locally
    →
Receiver
  authenticates, encrypts private payload, queues work
    →
Node / Mother
  verifies, consumes nonces, issues TSN-facing authorizations
    →
Cranker A (intent)
  submits funding or debit/exit-intent exactly as authorized
    →
On-chain TSN + TCAP
  epoch/reserve/vault rules + tip sequence + seal + commitments
    →
Cranker B (settlement)
  submits credit or exit-payout
    →
Owner
  reads encrypted snapshot keyed by tip commitment (private view)
```

**Universal rule:** every value-moving flow is **two-phase** (intent then settlement), even when a test script runs both calls in one process.

---

## 12. Failures we refuse to romanticize

| Failure                                           | Lesson                                  |
| ------------------------------------------------- | --------------------------------------- |
| ZK-PRU as balance holder                          | Routing identity ≠ vault                |
| Per-payment escrow PDAs                           | Join keys kill privacy claims           |
| “Migrate succeeded” without byte inspection       | Always dump account layout              |
| Zero sealed + non-zero commit                     | Partial migrations are poison           |
| Wrong `system_program` meta                       | Client ABI bugs look like protocol bugs |
| Marketing unlinkability while sharing permit PDAs | Be honest about correlation             |
| Localnet assumptions                              | This project is **Devnet-native**       |

---

## 13. Successes worth keeping

| Success                                         | Why it matters                                      |
| ----------------------------------------------- | --------------------------------------------------- |
| Atomic nonce consume                            | Stops double authorization under concurrency        |
| Lease-bound permits                             | Stops stale lease execution                         |
| Path 1 deposit then credit with unlink check    | Public funding ≠ private tip account graph          |
| Tip seal + repair                               | Private head on tip without plaintext balance field |
| Commitment exit design                          | Dest cleartext off the debit tx                     |
| Deploy scripts with doctor + lockfile stabilize | Makes slow machines survivable                      |
| Explicit ZK-PRU retirement narrative            | SEO and engineers stop implementing the dead path   |

---

## 14. Timeline (approximate)

| Period                      | Focus                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| **Mar–May 2026**            | TIN, early TSN, ZK-PRU receiving/spend experiments               |
| **May–Jul 2026**            | Security hardening of escrow, recovery, cranker, receiver        |
| **Jul–Aug 2026**            | Epoch / DNA redesign arguments; kill payment-specific escrow     |
| **Aug 2026**                | GPRU + TCAP tip/credit; Devnet program IDs stabilized            |
| **Late Aug–early Sep 2026** | Seal, liability, reserve migrations; deposit-credit green        |
| **8 Sep 2026**              | Two-phase exit still blocked on account-order bug; Path 1 proven |

---

## 15. Current truth (do not soft-pedal)

**Working on Devnet (demonstrated):**

- Program deploy pipeline for TSN + TCAP
- Reserve / tip liability migrations
- Tip seal repair
- **deposit_asset_v2 + credit_one_time_tip** with available balance increase and credit unlinkability assertions

**Not done / blocked:**

- Two-phase exit debit simulation (`system_program` InvalidProgramId)
- Full production cranker dual-process wiring for every flow
- Proof-gated confidential debits/exits as a general mechanism
- Mainnet

**Retired:**

- ZK-PRU as the balance and route system
- Single-tx “do everything” exit as the product path

---

## 16. Closing

From March to September 2026 this project learned the expensive way that **privacy is an account-graph problem**, not only an encryption problem. ZK-PRU taught receiving hygiene and also taught what not to put on-chain. Epoch treasury and TCAP tips exist because escrow archaeology was too legible. GPRU exists so authorization can move without becoming a second wallet.

The experiment is not finished. Path 1 credit on Devnet is the first time the new story is not only written in docs — it is written in **confirmed signatures**. Exit will be next when the account list matches the program, the same way seal only worked after repair matched the layout.

**TrustLink Labs**  
Transfer Settlement Network · Transfer Confidential Asset Protocol · Guard Privacy Routing Unit

_Experiment log for the expo / research archive. Prefer this narrative over any indexed page that still speaks of ZK-PRU as current._
