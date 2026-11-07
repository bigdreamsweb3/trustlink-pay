# Native private credit ABI and epoch accounting

**Status: EXPERIMENTAL replacement source, 2026-11-07.** This checkout implements [ADR-005](decisions/ADR-005-private-amount-and-adaptive-pools.md). Deployment, matching on-chain keys and a complete private-credit/epoch flow remain unverified. The [November 5 receipt](experiments/EXP-20261103-funded-note-credit.md) belongs to the earlier amount-public ABI.

## Deposit and sealed funding pool

The unchanged `deposit_private_funding_v1(amount:u64,note_commitment:[u8;32])` has 48 instruction bytes and nine accounts: depositor, config, asset entry, reserve, source, vault, mint, token program and writable global funding root. TCAP verifies the actual SPL transfer, increases actual assets/pending liabilities and appends `Poseidon4(TSN_FUNDED_LEAF_V1,noteCommitment,tokenId,actualAmount)` atomically. The note is `Poseidon3(TSN_FUNDING_NOTE_V1,secret,blinding)`. Deposit amounts and source wallets remain public.

The 1,081-byte global root at `[tcap:funding-root:v1]` supports depth 32. Mother-authorized `seal_private_funding_pool_v1` captures its current authoritative root into immutable `TcapSealedFundingPoolV1`, derived from `[tcap:sealed-funding:v1,assetEntry,root]`. Its 113 bytes contain asset at 11, token at 43, root at 47, global count at 79, eligible count at 87, source-wallet count at 95, capture slot at 97 and release slot at 105.

Node admission rechecks confirmed exact deposits, unconsumed nullifiers and membership in the captured tree. At least two positive notes and two source wallets are required. Duplicates, spent notes and zero-value actors cannot increase eligibility; several notes from one wallet count as one source. Mother attests counts; chain validates the captured root and count bounds. Wallet count does not establish independent people. Later deposits do not invalidate an already sealed pool.

## Private amount and TSNP authorization

Amount commitment is `Poseidon5(1880519585059740412114005250091737410720192050,tokenId,amount,privateBlinding,nullifier)`; the domain encodes `TSN_CREDIT_VALUE_V2`. Amount is positive u64; fresh blinding is nonzero canonical BN254. Action commitment binds action kind, token, amount commitment, reduced authorization and nullifier. Funded membership and recipient arithmetic use the private amount.

`tsn_register_tcap_credit_authorization_v3` serializes `RegisterTcapCreditAuthorizationV3Args` and `HiddenHeadProofArgsV2` in **905 bytes** including discriminator. Outer fields are digest, validity slots, previous root, next sequence, token, amount commitment, nullifier and proof. Amount commitment occupies 100–131, nullifier 132–163, and thirteen public inputs begin at 164. Proof action begins at 836; authorization commitment begins at 873. No plaintext amount is serialized.

The sixteen outer accounts are Mother authority signer, Mother Escrow, TCAP program, TSNP program, config, asset entry, writable shared root, readonly reserve, digest-derived signer PDA, TIP root, verifier, instructions sysvar, GPRU program, readonly sealed pool, writable epoch and System program. The Cranker is a separate fee payer; two signatures follow the native `0x81` message. Signed wire limit remains 4096 bytes.

TSNP recomputes SHA-256 with domain `TSN_GPRU_TCAP_CREDIT_PRIVATE_V2` plus zero byte, shared-root address, old root, next sequence, validity slots, amount commitment, token, nullifier, funded-root value, epoch address and pool address. Integers are little-endian. It validates Mother/proof agreement and invokes TCAP with the digest PDA's signer seeds.

## TCAP and GPRU enforcement

`credit_gpru_memo_v2` receives payer, config, writable root, asset, readonly reserve, TSNP program, signer PDA, TIP root, verifier, instructions sysvar, GPRU program, pool, writable epoch and System program. It validates released pool, Active/Approved/unpaused/nondeprecated asset, root/sequence/slot agreement, action/token/commitment binding and reserve solvency. Credit transfers no tokens and reclassifies no public liability counters.

GPRU `verify_hidden_head_transition_v2` keeps thirteen public inputs: old root, new root, Memo hash, action commitment, nullifier, TIP root, successor portfolio root, successor balance x/y, encrypted delta, ephemeral x/y and sealed funding root. It validates account ownership/PDA/layout, approved top-level TSNP context, circuit/key, canonical fields and the following proof-bound Memo. The circuit constrains amount commitment/blinding privately, proves membership for the exact asset/amount and consumes `Poseidon2(TSN_FUNDING_NULLIFIER_V1,secret)` once in the authenticated nullifier map.

After proof success TCAP advances the shared head/nullifier root and appends `Poseidon3(previousDigest,amountCommitment,nullifier)` to the asset epoch. Any failure rolls back both mutations. Confirmed deposits are separate transactions.

## Complete aggregate accounting

`TcapCreditEpochV1` uses `[tcap:credit-epoch:v1,assetEntry,reserve.accounting_epoch:u64le]`. Its 136 bytes contain asset at 11, number at 43, token at 51, seed at 55, digest at 87, count at 119, first-credit slot at 127 and accounted flag at 135. Seed is reduced SHA-256 of domain `TSN_TCAP_CREDIT_EPOCH_V1` plus zero byte and epoch PDA.

Node reconstructs every successful credit in order and loads its restricted amount-opening journal. The separate circuit proves five public inputs: seed, digest, aggregate total, count and token. It opens all accepted commitments and requires **2–64 credits**; singleton carries forward. Missing/reordered/opening-mismatched transcripts fail. Aggregate totals are public and can support inference in sparse or known-amount pools.

Node creates `TCAP_EPOCH_ACCOUNTING` work; Receiver verifies/leases it; Cranker submits `account_credit_epoch_v1`. Receiver's global-root lock holds across verification, authorization and uncertain signed attempts, preventing new credit proofs while accounting is prepared. Finalized receipt repair wakes dependent work after its update is durable.

TCAP verifies the complete transcript through the separate GPRU verifier, moves only the authenticated total from pending to settled confidential liabilities, increments accounting epoch and marks the prior epoch accounted. Total liabilities, custody assets and uncredited pending funding remain unchanged. Replay fails. The reserve remains 201 bytes; accounting epoch occupies 180–187.

## Scheduling, recovery and activation

Inventory and queue selection use bounded pages. Defaults adapt target 2–8 notes and shared windows 24/48/96 slots to recent qualified arrivals, with a two-wallet floor. Node selects the shared release boundary after a fresh post-census root read, budgeting twice the observed census duration plus 48 slots for both later authorizations and transport, capped at 4800 slots before boundary rounding. Authorization rechecks root/count and release expiry after its own census; stale unsigned work requires re-verification. Accounting is considered after 120 slots or at 64 credits; bounded wake checks continue while accounting is pending. These are defaults, not measured latency guarantees.

Obsolete captures are retired; unsigned stale authorizations return to Node verification. Durable signed attempts are reconciled before replacement. Mother signing and receipt repair inspect exact signer order, permissions, instruction bytes and Memo. Encrypted owner record V2 carries the opening; SDK verifies it against the public commitment. Historical 825/857-byte receipts remain independently readable; active builders support only the new ABI.

The hidden-head verifier PDA remains unchanged but needs explicit `rekey-verifier` with matching artifacts. Earlier V1 accounts require the separate migration. New epoch verifier is 940 bytes at `[gpru:tcap-epoch-verifier:v1]`, with five inputs/six IC points. `scripts/tcap-epoch-setup.mjs` provides read-only plans, matching disabled-upload resume and explicit rekey. See [operator instructions](../RUN-YOUR-OWN-TSN.md); no deployment or user configuration was changed during validation.

Sources: [TSNP](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs), [TCAP credit](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs), [epoch](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/private_epoch.rs), [pool](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/private_funding_pool.rs), [GPRU](../../tsn-protocol/programs/gpru/src/hidden_head.rs), [aggregate verifier](../../tsn-protocol/programs/gpru/src/tcap_epoch.rs), [SDK](../../tsn-protocol/sdks/tsn-sdk/src/tcap-gpru-credit.ts) and [Node coordination](../../tsn-protocol/services/tsn-node/private_credit_coordination.py).
