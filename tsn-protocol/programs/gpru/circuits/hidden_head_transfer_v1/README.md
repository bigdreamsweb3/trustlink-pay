# Offline private TIN-to-TIN transfer core

**Status: EXPERIMENTAL first-release v1 offline-recipient implementation, 2026-11-23.** This circuit and witness builder implement one fee-free, same-asset paired transfer using the sender's opening/approval and the recipient's authenticated balance point. The recipient supplies no opening or signature and can remain offline. Sender SDK preparation and two encrypted records support independent later owner recovery. Existing wallet deposit/credit behavior is unchanged, and no Solana instruction, account, HTTP handler, Receiver work kind, Cranker branch or XP screen is added. The [current checkpoint](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261123-offline-recipient-transfer.md) supersedes the earlier two-opening prototypes for operational design while preserving their dated tests.

## Authorization and private inputs

[offline/core.py](offline/core.py) accepts trusted root-selected TIP/TCAP snapshots, an asset/reserve context, the sender registry's owner commitment, two resolved routes, the sender's balance opening, a positive u64 amount in registered-asset base units, a nonzero private nonce and amount blinding, authorization slots and two nonzero Memo commitments. Sender balances use u128 so legitimately accumulated deposit credits above u64 remain spendable within this experiment. `prepare_transfer` returns a private witness, a separate public projection and an in-memory candidate without mutating inputs or persisting state. Human-readable amount conversion belongs to the future SDK integration.

The sender signs `TSN_TIN_TRANSFER_APPROVAL_V1\0 || authorizationCommitment_be32` with Ed25519. The builder recomputes the commitment from both route keys, the blinded value, asset, deployment, nonce and slots, then checks the signature against the independently supplied registered-owner pin. That pin uses TIP's current unsalted SHA-256 owner-key commitment and must come from a validated registry rather than submitted approval. Signature verification, current-slot validity and reserve solvency are host preconditions; the circuit does not verify Ed25519 or read program accounts.

Only the sender opens a balance to prove sufficient funds. The recipient's authenticated point receives `amount * BASE8 + blindingDelta * H`, the same homomorphic increment used by existing deposit credit. SDK `withTinOwnerTransferOpeningV1` uses the existing owner authentication and local finalized-credit recovery to disclose the sender's selected opening to a caller callback. It requires leg `0`; recipient opening access and consent are excluded from transfer preparation.

[offline/sender.py](offline/sender.py) validates one signed `tsn-gpru-transfer-opening-v1` packet against the independently supplied sender registry hash, exact sender route key, authorization commitment, selected roots/global sequence and private predecessor sequence/Memo. `TSN_TIN_TRANSFER_OPENING_V1\0` separates sender disclosure consent from payment approval. The handoff includes the sender's selected asset balance and blinding but no owner seed. The callback cannot revoke copies deliberately retained by its caller; the application controls their lifetime.

## Atomic statement and ABI

[main.circom](main.circom) authenticates both TIP routes, selected asset leaves and predecessor heads. The sender opening reconstructs the existing `balance * BASE8 + blinding * H` point, and its old/new balances fit u128 with `oldBalance = newBalance + amount`. The recipient's predecessor point is authenticated directly, and its successor equals that point plus the same positive u64 amount and an independent blinding delta. No recipient numeric balance or blinding opening enters the witness. Each private head sequence advances once, and the global sequence must remain incrementable.

The circuit supplies no local numeric recipient range proof. Interpreting later recovered balances within u128 relies on an authenticated canonical root lineage: nonresetting u64 sequences and u64 admitted credit amounts bound lifetime accumulated positive credits below `2^128`, far below the BabyJub subgroup order. That argument assumes valid initialization, admitted credit relations and unchanged lineage; a supplied point or matching snapshot alone does not establish those premises. It is an implementation assumption requiring program/lineage review, not an audited cryptographic guarantee. Existing deposit/credit code and its amount/account layouts are unchanged.

The sender update produces an intermediate head root. The recipient predecessor path must match that intermediate root before its successor produces the final root. This binds both changes even when paths share ancestors; distinct low-128-bit head indices are required. One stable `Poseidon3(TSN_TRANSFER_NULLIFIER_V1,senderRouteKey,privateNonce)` enters an authenticated empty nullifier slot. Changing proof randomness or Memo commitments cannot reuse an accepted approval.

The twenty public scalars, in order, are:

1. `oldGlobalRoot`, `newGlobalRoot`, `tipRouteRoot`, `rootSequence`.
2. `deploymentCommitment`, `assetId`, `validAfterSlot`, `expiresAtSlot`.
3. `amountCommitment`, `authorizationCommitment`, `actionCommitment`, `nullifier`.
4. `memoCommitments[0..1]`, `successorPortfolioRoots[0..1]`, `successorBalanceX[0..1]`, `successorBalanceY[0..1]`.

`rootSequence` is the predecessor global sequence; the candidate successor is one greater. Action kind is fixed to internal value `4`. Value uses `Poseidon5(TSN_TRANSFER_VALUE_V1,assetId,amount,amountBlinding,nullifier)`. ASCII domain fields and the nested authorization relation are defined in `offline/core.py` and constrained in the circuit. Amount, nonce, route keys/indices, openings and paths are excluded from the public projection. Public roots, asset, slots, points and Memo commitments remain observable; general unlinkability is unverified.

The two Memo fields bind successor heads. `prepare_sender_transfer` constructs one `TSN_GPRU_TRANSFER_HEAD_V1` Memo per leg with a strict `tsn-gpru-transfer-action-v1` encrypted payload. It reuses the current Ristretto ephemeral key agreement, DBrix Secretbox envelope and BabyJub blinding-delta cipher, validating each record public key against its authenticated route commitment. There is no permanent Node decryption key or recipient decryption during preparation. Each full Memo is SHA-256-reduced into its leg's public commitment before the final witness is built.

The circuit authenticates these Memo commitments but does not constrain encryption correctness or decryptability. SDK `recoverGpruTransferOwnerOpeningV1` requires an independently verified exact twenty-input statement and an authenticated predecessor opening. It checks the full Memo hash, explicit leg, successor portfolio root/point, private amount/action commitments and predecessor sequence/Memo, then reconstructs the updated Pedersen point with u128 owner arithmetic. The recipient can perform that recovery later; it is not a preparation requirement. The helper does not verify Groth16 or a chain receipt itself. The sender signature and trusted-context checks establish authorization; live transaction-Memo enforcement and finalized transfer-history discovery remain unimplemented.

## Accounting contract

One transfer is one paired action with one replay identifier and one global-root update. This fee-free fixture has zero custody-asset and reserve-category deltas: pending, settled confidential, authorized withdrawal, reserved refund and transfer pending. Both portfolios conserve value and preserve unrelated assets/history. The builder checks registered-asset binding, u64 category arithmetic and reserve solvency before returning a candidate.

The current credit-only epoch transcript and five-input aggregate circuit remain unchanged. This transfer is not a new deposit-backed positive credit; its debit cannot independently reduce liabilities while ignoring the recipient leg. Mixed batches, provider fees, payouts and refunds still require their separate typed accounting contracts.

## Offline verification

The tools reuse the existing pinned circom2 0.2.19, circomlib 2.0.5 and snarkjs 0.7.6 installation. From the parent TrustLink workspace:

```powershell
npm run gpru:transfer:test
```

This runs host tests, compiles when source/artifact hashes do not match, checks valid witnesses against R1CS and rejects the mutation fixtures. `GPRU_TRANSFER_PYTHON` selects an offline interpreter. `GPRU_NATIVE_LIBRARY_PATH` selects the existing native Poseidon library; the default uses the current `node-native-funded-note/release` target on Windows/Linux. macOS requires an explicit compatible `.dylib`. Neither variable modifies service configuration. The compiler writes this directory's ignored `build/sender-only/` with a source/artifact hash manifest. Original two-opening `build/` artifacts remain historical evidence and are not a fallback.

Create the separate development key using an existing verified prepared Powers of Tau file of sufficient capacity:

```powershell
node tsn-protocol/programs/gpru/circuits/hidden_head_transfer_v1/tools/setup-dev.mjs --ptau C:/path/to/prepared-development.ptau
npm run gpru:transfer:prove:dev
```

Replace the Ptau placeholder with an actual retained file. Invoke the setup script directly in PowerShell: the npm wrapper's `-- --ptau` form dropped the flag in the observed shell and is not a verified forwarding command. Setup verifies Ptau and the contributed circuit-specific key, exports twenty-input/twenty-one-IC verification data and pins both sources, R1CS, WASM and key hashes. It refuses existing key files and writes the corrected key under `build/sender-only/dev/`. The synthetic command proves a real Groth16 statement and checks mutated public inputs. The earlier two-opening `build/dev/` key cannot verify the corrected circuit; current tools select only the new matching artifacts. Credit/epoch artifacts are read-only and remain separate. These are development artifacts rather than a production ceremony; no chain initializer is exported.

For a standalone protocol checkout, run `node tools/test.mjs` here with an explicitly selected interpreter/native library. Direct `node tools/prove.mjs` takes one canonical decimal-string witness over bounded stdin and emits only a verified standard proof/public-signal object, with sanitized failures. Keep real openings out of command arguments, logs and versioned files.

The offline-recipient round trip requires the current SDK build and matching corrected transfer development artifacts. From the parent workspace, run:

```powershell
npm run tsn:sdk:build
npm run gpru:transfer:roundtrip
```

This exercises synthetic sender credit-history recovery, sender approval/disclosure, recipient point credit and later independent owner recovery. Recipient secret keys, openings or signatures are not supplied to the preparation step. The [current checkpoint](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261123-offline-recipient-transfer.md) records exact circuit/proof/recovery results and their runtime boundary. The tool keeps private fixture data on subprocess pipes and writes only summary results under the ignored `build/sender-only/` directory.

## Runtime promotion requirements

Live execution still needs an independently validated sender registry/owner pin, authenticated routes/root lineage, a service contract for the sender's signed opening/approval and both owner records, current root/sequence/slot and governed reserve-account checks, and a verifier for this exact statement. TSNP/Mother authorization, TCAP atomic root handling, GPRU enrollment, Receiver/Node/Cranker integration, transport checks, finalized transfer-history discovery and XP consent/recovery require explicit implementation. Receiving must preserve the offline-recipient contract. The existing thirteen-input deposit-credit verifier cannot accept this proof; its flow is unchanged. No new program-account derivation, migration or deployment is implied by this offline extension.
