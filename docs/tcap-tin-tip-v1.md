# TCAP TIN Tip State V1

**Version:** V1
**Commit reference:** Current commit — `Add private TINS tip state initialization`

## Summary

TCAP now has a small, versioned account for the private state of a TINS tip relationship. The account is derived from a *blinded* TINS privacy-receiving-root commitment, so neither a raw TIN nor a wallet address is part of the PDA derivation or account data. It keeps only a current commitment, transition sequence, policy commitment, last transition nullifier, frozen bit, and PDA bump.

## Implementation notes

### Solana / Rust

`initialize_tcap_tin_tip_v1` creates the deterministic PDA with the domain-separated `tcap:tin-tip:v1` seed and the blinded root commitment. The payer covers rent through Anchor's `init` and `payer` constraints. Initialization rejects zero blinded-root, current, and policy commitments, stores the state version, initializes sequence to zero and the nullifier to zero, and emits only the new account public key.

`credit_tcap_tin_tip_v1` is the phase-one credit-only transition. It accepts only a `ConfidentialSettlement` TSN authorization receipt, checks the receipt's exact tip, previous/new commitments, sequence, token registry ID, policy commitment, GPRU scope commitment, nullifier, and slot window, then atomically consumes the nullifier and receipt while advancing the tip. The asset entry must be active, approved, and unpaused. The event contains only the tip PDA, sequence, compact token ID, and an opaque transition digest. It never debits a balance or performs an external exit.

The emitted event intentionally excludes commitments, raw TIN values, receiving roots, payer identity, balances, token accounts, and encrypted snapshots. Subsequent transition instructions must preserve this minimal account shape and use commitment/nullifier validation rather than adding public financial metadata.

### TypeScript components

SDK callers should blind the TINS privacy-receiving root before constructing the instruction. They should derive the PDA from `['tcap:tin-tip:v1', blindedRootCommitment]`, submit only commitments, and avoid logging the argument bytes.

```ts
await tcap.initializeTcapTinTipV1({
  blindedTinsPrivacyReceivingRootCommitment: blindedRootCommitment,
  currentCommitment,
  policyCommitment,
});
```

### Python Cranker components

The Python Cranker daemon does not create TINS tip state and must not collect raw TINs or receiving roots for this flow. If it observes the initialization event, it may retain only the emitted TCAP account key for operational correlation; it must not attempt to reconstruct or persist the underlying commitment inputs.

```bash
# Observe only the minimal initialization event; do not submit raw TINS material.
python -m cranker_daemon events --program tcap --event TcapTinTipInitializedV1
```

### Encrypted private balance snapshots

`@trustlink/tcap-sdk` provides `TcapBalanceSnapshotV1` for local plaintext and
`EncryptedTCapBalanceSnapshotV1` for persistence. The encrypted envelope has
no public `token_balances` field; balances are AES-GCM ciphertext and are
returned only after local decryption with the owner-authorized key.

The commitment binding is deliberately one-way:

```text
tip.current_commitment == snapshot.new_commitment
snapshot.new_commitment = SHA256(canonical snapshot record excluding new_commitment)
tip.sequence == snapshot.sequence
```

After `credit_tcap_tin_tip_v1` succeeds, the owner-authorized Node/Mother
path stores an envelope under the opaque `new_commitment`. A private reader
fetches the public tip, loads that envelope, decrypts locally, verifies the
envelope bindings and commitment hash, and only then returns balances. Optional
history follows `previous_commitment` links on request; it is never fetched or
logged by default. No TIN, root material, balance, recipient, or ciphertext
is exposed through a public snapshot helper.

### TSN -> TCAP credit handoff

After funding is confirmed, the Node constructs the additive
`TcapCreditAuthorizationV1` handoff with exactly:

```text
tip, previous_commitment, new_commitment, sequence, token_id,
policy_commitment, gpru_scope_commitment, nullifier,
valid_after_slot, expires_at_slot, tsn_settlement_commitment, epoch_id
```

The TSN authorization signer marks the transition as
`ConfidentialSettlement`. The transaction sequence is:

```text
TSN funding confirmed
  -> Node/Mother signs TCAP credit authorization
  -> register_tsn_authorization_v1 creates the TCAP receipt
  -> credit_tcap_tin_tip_v1 verifies and consumes receipt + nullifier
  -> owner-authorized Node/Mother stores encrypted snapshot by new_commitment
  -> private reader fetches tip, decrypts locally, verifies hash/sequence
```

This handoff never enters CrankerVault payout logic and contains no token
account, escrow account, public amount, or debit/exit instruction. TCAP owns
the tip/credit transition; TSN remains responsible for epoch treasury, lease,
and settlement coordination.

## Security and privacy considerations

* **Hidden:** public native balances, stable-unit balances, raw TIN values, wallet addresses, GPRU keys, token accounts, encrypted snapshot ciphertext, and the unblinded TINS receiving root.
* **Exposed:** the account PDA exists, its owner is TCAP, its fixed-size commitment-oriented state is readable, and initialization emits that account key. This is the minimum public fact required to address the account.
* **Why:** binding the PDA to a blinded commitment creates deterministic, non-custodial addressing while avoiding identity and payment metadata in permanent account fields or logs.

## Testing notes

Run the TCAP program tests from the protocol workspace:

```bash
cd tcap-protocol
cargo test -p tcap
```

The test suite checks that the account serialization exactly fits its rent allocation and that the TINS tip PDA is root-scoped and distinct from TCAP's other PDA domains. Integration tests should additionally verify rejection of zero commitment arguments and a mismatched PDA.
