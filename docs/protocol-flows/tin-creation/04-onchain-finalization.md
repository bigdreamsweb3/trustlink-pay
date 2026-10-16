# TIN V1 Creation: Cranker to Solana

The Cranker executes only Receiver work that has a valid Node verification
attestation and active Cranker lease. It submits the exact verified TIN V1
commitment and encrypted identity data; it does not know the plaintext TIN or
display name.

## Select direct or staged submission

The Cranker measures the complete transaction before sending it. If it
fits Solana's 1,232-byte packet limit, it submits the signed `CreateTinV1`
instruction directly. If it is too large, it uses the on-chain staging
instructions instead of constructing an oversized transaction:

1. **Initialize** an intent-bound `TinV1CreationStaging` PDA with the owner,
   lookup commitment, intent hash, encrypted-data lengths, route commitments,
   and expiry. The address is derived from the staging seed, owner public key,
   and intent hash.
2. **Append encrypted chunks** in separate transactions. Each chunk is at most
   700 bytes and targets the identity, master-seed, or owner-recovery blob with
   an explicit offset. The program rejects unsupported blob kinds, gaps,
   conflicting retries, wrong PDAs, expired stages, and oversized writes.
3. **Finalize** with the owner's Ed25519 proof instruction followed by the
   program's finalize instruction. The program checks that every byte has been
   written, reuses the same `CreateTinV1` validation path, creates the
   commitment-derived `TinV1Account` and owner-recovery PDA, and closes the
   staging account.
4. **Verify the result** by reading the registry account from the configured
   Solana RPC and checking its program owner, V1 layout/status, and lookup
   commitment. The Cranker reports the transaction signature, registry address,
   and optional staging transaction signatures to the Receiver.

If a staged attempt expires before finalization, an authorized Cranker can
close the expired staging account to recover its rent. This does not create a
TIN. A new valid operation must be submitted for a fresh attempt.

## State and evidence

The Receiver reaches `SUBMITTED` only after a transaction signature is
reported. It reaches `CONFIRMED` only after the Cranker confirms Solana and
verifies the resulting registry account. The XP can then show the TIN to the
owner session. A successful staging transaction alone is not TIN issuance; the
finalize transaction and registry account are required.

Cranker logs include the work ID, stage label, serialized transaction size,
signature, confirmation, registry address, and account validation result. Do
not log private keys, decrypted data, lookup secrets, or plaintext identity
values.

## Source owners

- Transaction selection and submission: `services/tsn-cranker-op-daemon/scripts/cranker.ts`.
- Instruction serialization: `sdks/tsn-sdk/src/tins.ts`.
- Staging account checks and finalization: `programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs`.
- Registry initialization: `programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs`.

See [05 Evidence](05-evidence.md) for the observed Devnet run and the evidence
needed to make a new run reviewable.
