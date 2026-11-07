# Private credit amounts and adaptive funding pools

**Status: EXPERIMENTAL replacement implemented in source, 2026-11-07.** The user requires deposits to move funds into TCAP custody, individual credits to update private recipient state without public amount or liability reclassification, and Node-created aggregate epoch work to be coordinated by Receiver and submitted by Cranker. The [ABI](../credit-abi.md) is canonical; [offline evidence](../experiments/EXP-20261107-private-credit-epoch.md) does not establish activation or complete unlinkability.

## Observed cause and historical boundary

The [November 5 public evidence](../../references/funded-note-public-link-20261105.json) shows 500000 base units in outer/nested credit arguments and a selected tree containing exactly one deposit. That implementation also moved public pending/settled liability counters by each credit amount. Its unblinded action and authorization commitments permitted amount-guessing checks. A circuit-private witness did not conceal values separately serialized or inferable from public account deltas. Those immutable transactions retain their disclosures.

Secret-derived funded-note nullifiers had already removed the earlier public deposit-signature formula. A singleton root still identified the public funding wallet for that credit event; it did not by itself reveal the plaintext recipient TIN or legal identity. [Recipient-registry/head linkage](../experiments/EXP-20261103-native-credit-linkability.md) is a separate historical finding. Alternative deposits can widen source candidates, while identical/known amounts, prior spends and timing can narrow them again.

## Adopted amount and authorization contract

The actual positive u64 amount remains private in exact funded-membership and recipient arithmetic. Fresh nonzero canonical BN254 blinding produces `Poseidon5(TSN_CREDIT_VALUE_V2,tokenId,amount,privateBlinding,nullifier)`; the domain is 1880519585059740412114005250091737410720192050. Action commitment binds action, token, this commitment, reduced authorization and nullifier. TSNP digest binds the commitment, shared root/sequence/slots, token/nullifier, sealed funding root, epoch and pool accounts. No plaintext amount is serialized in the current credit call.

The credit remains thirteen public inputs with the funding root last, but its changed circuit requires new matching keys. TSNP V3 is 905 bytes with sixteen outer accounts, including readonly reserve/pool and writable shared root/epoch. Encrypted owner record V2 carries the amount opening; SDK verifies it against the public commitment. Independent historical 825/857-byte readers preserve recovery without an active old serializer or settlement fallback. The full encrypted fixture is 3344/4096 native bytes; arbitrary ciphertext sizes still face the limit.

## Aggregate conservation contract

Deposits remain public SPL transfers and atomically create funded pending obligations. Individual accepted credits consume secret-derived nullifiers, advance the private head/root and append `Poseidon3(previousDigest,amountCommitment,nullifier)` to the asset epoch, without tokens moving or public liabilities being reclassified.

Node reconstructs all successful epoch credits in order and loads the protected opening journal. The separate five-input circuit proves seed, final digest, total, count and token for all 2–64 entries. Missing/reordered/mismatched openings fail; a singleton carries forward. Receiver serializes native verification and holds the lock across an uncertain signed attempt. Cranker submits one Mother-authorized `account_credit_epoch_v1`; TCAP/GPRU authenticate the transcript and total, move only that total from pending to settled confidential liabilities, mark the epoch accounted and advance the reserve epoch. Total liabilities, custody backing and uncredited pending deposits remain unchanged. Replay, insolvency and arithmetic failure reject before mutation.

Aggregate totals remain public and can disclose individual values through sparse/known-amount inference. Existing credited liabilities and historical head/nullifier state are preserved; earlier signature-only uncredited deposits cannot be invented into new-tree members. There is no generic old-pending-obligation migration in this change. Retained Epoch Treasury, AcceptedIntent, Settlement DNA, payout/refund and disabled debit/exit APIs are separate capabilities.

## Pool admission and timing

Node checks exact confirmed deposits, positive amounts, stable note/nullifier identity, current unconsumed state and membership in the captured tree. At capture at least two notes and two source wallets are required; same-wallet notes count once as a source. Mother attests counts, while chain enforces the authoritative current root and bounds. Wallet count does not prove independent people or resistance to collusion. Zero-value actors never increase eligibility.

Mother-authorized `TCAP_FUNDING_POOL` work seals an immutable asset/root account. Later deposits cannot invalidate it. Recent qualified arrivals select target 2–8 and common 24/48/96-slot windows; low traffic never lowers the two-wallet floor. Credits remain serialized by their shared-root/sequence requirement. Current ordering is Receiver queue selection, not a cryptographically private shuffle or atomic multi-credit batch. No guaranteed latency or timing-unlinkability claim follows from common release windows.

Accounting is considered after 120 slots or at 64 credits. Node retains bounded wake checks while coordination is pending, including after the last payment when an epoch still needs accounting. Unsigned stale proofs are deferred/reverified; obsolete capture IDs are rejected so a new root-derived work can be created. A durably signed attempt must be reconciled before replacement. Receiver inventory/leases paginate and do not assume the first 50 or 1000 records contain all eligible work. Repeated census validation is still expensive, and funded history reconstruction retains 10000-leaf/signature bounds; production scalability is unverified.

## Liquidity providers and limits

The user intends liquidity providers to support ongoing TSN operation and earn transaction fees, not participate only at exits. Provider capital/ownership, earned fee liabilities and user custody obligations require distinct accounting. This implementation does not select admission, fee allocation, accrual, claim, withdrawal or loss policies. The existing liquidity skeleton and disabled exit handler do not establish working provider rewards. Real provider funds count as alternative candidates only when they satisfy the funded-note contract; TSN-controlled addresses do not prove independence.

Node knows private openings and routes. Public source wallets, asset, deposit amounts, epoch totals, roots, successor points, ciphertext, accounts and timing remain observable. Neither encrypted balances nor accepted proofs establish complete privacy, recipient unlinkability, scanner completeness or owner-only knowledge.

## Verification and activation obligations

Offline tests cover honest/mutated witnesses and real proofs, serialized native verification, current/historical owner recovery, bounded transport, pool admission, pagination/deferral/concurrent serialization, exact receipts, replay/accounting arithmetic and initializer packets/resume. [The experiment](../experiments/EXP-20261107-private-credit-epoch.md) records exact scope and hashes.

SBF builds, matching deployed binaries, explicit credit rekey, separate epoch enrollment and live multiwallet credits/accounting remain unverified. Independent circuit review, production ceremony, varied-amount/public-observer trials, known-prior-spend inference, busy/sparse latency and recipient-registry regressions remain required. [The operator guide](../../RUN-YOUR-OWN-TSN.md) supplies source-backed commands and persistent configuration; activation, signing and service operations remain user-controlled.

The November 5 design review's 275-page inventory, 36 selectors, 103 MDX and 39 Mermaid checks are historical documentation evidence, not tests of this replacement. Its runtime-source preservation comparison applies only to that documentation-only review.
