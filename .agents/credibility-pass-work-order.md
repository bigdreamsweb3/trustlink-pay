# Historical credibility work order

**Status: HISTORICAL task record; original completion/adoption is not established by this file.** The original five-item prompt below is retained for provenance and is not an active work order. Its automatic commit gates, standalone docs paths, proposed quote/error/prepaid changes and blanket no-trust assertions must not direct current work. In particular, finding this record does not authorize commits, deployments or new APIs.

Use [AGENTS.md](../AGENTS.md), the [current source brief](architecture-source-brief.md), [reconciliation](../docs/laboratory/reconciliation-register.md) and the [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md). The older freeze/account proposals require route-specific source review; no receipt/seal model can be generalized to current shared-root credit. Retain the useful evidence-first principle, while verifying every guarantee and trust boundary independently.

## Original historical prompt

# Agent work order — credibility pass (five items, fixed sequence)

Do these in order: **5 → 3 → 1 → 4 → 2**. One item, one commit, one short report. Do not start an item
until the previous one is committed. Items 1 and 2 have gates; if a gate is unmet, stop and report rather
than improvising.

## Cross-cutting rules for every item

- **No claim without an enforcer.** Every guarantee you write must name the instruction or file that
  enforces it. If you cannot name one, the row says `NOT GUARANTEED TODAY` and says why.
- **Do not invent vocabulary.** A state name, status label, or error code may only be introduced if it
  exists in code or is being added by this work order. No aspirational nouns.
- **Describe the wired path only.** Anything that `about/current-technology` lists as missing, unwired, or
  proof-gated is described as such, in the same sentence as the capability, not in a footnote.
- **Never soften.** "Not audited", "not mainnet", "not enforced on chain" are the correct phrasings.
  Replacing them with "in progress" or "emerging" is a failure of this task.

---

## Item 5 — audit banner (do this first, it is five minutes)

**Goal:** an honest status banner that cannot be missed.

For every page under `tsn-docs/security/` (`invariants`, `threat-model`, `authority-and-keys`,
`fail-closed`, `replay-protection`, `operator-boundaries`, `trust-model`) and `tsn-docs/overview/introduction.mdx`,
add immediately after the frontmatter, before any body content:

```mdx
<Warning>
**Not audited.** As of <YYYY-MM-DD> this system has had no formal security review and no third-party
audit. Program source, a successful build, a deployment, and a confirmed end-to-end transaction are
separate evidence levels; see [Current Technology](/about/current-technology). Audit reports will be
linked here if and when they exist.
</Warning>
```

**Acceptance:** every listed page opens with the banner; the date is the date of this commit; no page
claims an audit anywhere else (grep for `audit`, `audited`, `security review` and fix contradictions).
**Do not:** add the banner to pages that are not security claims.

---

## Item 3 — immutability as a stated property

**Goal:** the freeze semantics that already exist become readable as a property, not discoverable in code.

1. Find the actual enforcement. Candidates: sealed TIP-head overwrite prevention, the two-phase exit
   commitment, and the seal migration/repair instructions (`migrate_tip_seal_v1`, `repair_tip_seal_v1`).
   Read them before writing anything.
2. Produce a **freeze table** for `tsn-docs/developers/payment-intent-lifecycle.mdx`:

   | Field / commitment | Frozen at | Enforced by (file:instruction) | Can it change after? | Who can change it |
   | - | - | - | - | - |

   Every row cites the instruction. The last two columns are the point of the table.
3. Add a short section to `tsn-docs/security/invariants.mdx` stating what immutability means here, in
   plain terms, and cross-link the table.

**Critical check:** the existence of `migrate_tip_seal_v1` and `repair_tip_seal_v1` means sealing is not
absolute — some authority can rewrite a seal under conditions. **Record those conditions and that authority
in the table.** An immutability claim that hides a migration path is exactly the kind of claim this
work order exists to prevent.

**Do not** invent a lifecycle state name unless it appears in code. If no single state corresponds to
"sealed", name the specific sealed values instead of forcing a state machine onto the code.

**Acceptance:** every row has all five columns; the migration/repair authority is disclosed; no sentence
says "immutable" without the qualifier that the table supplies.

---

## Item 1 — trust / no-trust ledger

**Gate — do this first, and stop if it fails.** For each program (`tin-registrar`, `gpru`, `tcap`,
`trustlink-escrow`):

```
solana program show <PROGRAM_ID> --url <cluster>
```

Record: program ID, **upgrade authority**, last deploy slot, and whether the authority is a multisig or a
single key if that is discoverable. If any authority cannot be read on the target cluster, stop and report
which one — publishing the ledger without them is worse than not publishing it.

**Then create `tsn-docs/security/guarantees.mdx`** with four parts:

1. **Guarantees table** — `Property | Mechanism | Enforced by | Status`. Status values only:
   `enforced on chain`, `enforced off chain by the Node`, `source only — not wired`, `not implemented`.
2. **What you must trust** — enumerated, no generalities: the Node signing key (and where it lives), each
   program upgrade authority by name, the Solana runtime, the token program, the RPC provider for reads.
3. **What you need not trust** — Receiver, Cranker, RPC gateway, SDK, indexer — each with the sentence
   explaining why it cannot affect funds or routes.
4. **Upgrade authority disclosure** — the table from the gate, plus one sentence on what an authority
   holder could change and how quickly.

Add the page to `docs.json` under Security. **Acceptance:** every guarantee row cites an instruction or file;
every status is one of the four allowed values; the upgrade authorities appear verbatim from the command
output; nothing contradicts `about/current-technology`.

---

## Item 4 — quote / charge parity

**Goal:** a quote that is a commitment, not an estimate.

1. `tsn-docs/api-reference/quote.mdx` — request, response, all fields, and this rule stated explicitly:
   *"A quote is only valid if the program will charge exactly it. If the two can diverge, the endpoint is
   wrong, not the caller."* Enumerate the divergence cases: fee tier boundary, rounding direction, expiry
   crossing, amount at the minimum.
2. Add `TSN_QUOTE_STALE` to `tsn-docs/api-reference/errors.mdx`, matching the existing code conventions,
   with the trigger and the required client behaviour (re-quote, do not retry the same payload).
3. Write the parity test in `sdks/tsn-sdk/tests/quote-charge-parity.test.mjs`: fixtures for the minimum
   fee, an exact tier boundary, a rounding case, and a zero/rejected amount; assert the quote equals the
   fee the program computes.

**Honesty gate:** if the program's fee cannot be exercised without a validator, the test is a unit test
against `fee_math` semantics. Label it `unit-level parity` in the test name and say in the page that
on-chain parity is unverified until an integration test exists. Do not call it parity if it only mirrors
your own arithmetic.

**Acceptance:** the page states the rule; the error exists and is reachable in code paths that can actually
return it; the test fails if you deliberately change the SDK formula.

---

## Item 2 — prepaid execution gating (DESIGN ONLY)

**Do not modify anything under `programs/`.** This item produces a specification, not a change.

Write `docs/rfc/TSNP-V2-prepaid-execution.md`:

1. **Problem.** Today, funding is a pool (`fund_cranker`, `tin_action_fee`, `fee_math`); nothing on-chain
   rejects an authorization or submission for work that has not been paid for. State what that permits.
2. **Proposal.** A monotonic counter on the relevant account (`paid_actions` or `epoch_prepaid_actions`),
   incremented only when a fee settles, with a hard reject when `executed >= prepaid`. Cite the account
   that would carry it and the instruction that would enforce it.
3. **Precedent.** The pattern exists elsewhere in Solana: a prepaid counter gating execution. Cite it as
   precedent, not as authority.
4. **Migration.** Follow the existing `migrate_*_v1` instruction pattern in this repo. State the account
   version bump, the migration order, and what happens to in-flight work.
5. **Failure modes.** Keeper pays and cannot execute. Sponsor over-prepays. Counter desync after a partial
   settlement. Liveness versus solvency in each case.
6. **Open questions** — for humans, unanswered.

Then the shippable part, in the Node service: refuse to authorize work that is not covered by a settled
fee, and add one line to the relevant operator doc saying the bound is **currently off chain**. Label it
plainly: this is a Node policy, not an on-chain guarantee.

**Acceptance:** no file under `programs/` changed; the RFC contains an explicit "not implemented" banner;
the Node-side refusal is implemented and tested, or the line simply documents that it does not exist yet.

---

## Final report — `docs/credibility-pass.md`

| # | Item | Status | Evidence (file / command / test) | Remaining blocker |
| - | - | - | - | - |
| 5 | Audit banner | | | |
| 3 | Immutability freeze table | | | |
| 1 | Trust ledger | | | |
| 4 | Quote parity | | | |
| 2 | Prepaid gating RFC | | | |

Then one paragraph: what a reviewer can now verify that they could not before, and what is still only
asserted. Report that honestly even if it is short.
