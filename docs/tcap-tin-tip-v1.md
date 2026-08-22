# TCAP TINS Tip State V1

**Version:** V1
**Commit reference:** Current commit — `Add private TINS tip state initialization`

## Summary

TCAP now has a small, versioned account for the private state of a TINS tip relationship. The account is derived from a *blinded* TINS privacy-receiving-root commitment, so neither a raw TIN nor a wallet address is part of the PDA derivation or account data. It keeps only a current commitment, transition sequence, policy commitment, last transition nullifier, frozen bit, and PDA bump.

## Implementation notes

### Solana / Rust

`initialize_tcap_tin_tip_v1` creates the deterministic PDA with the domain-separated `tcap:tin-tip:v1` seed and the blinded root commitment. The payer covers rent through Anchor's `init` and `payer` constraints. Initialization rejects zero blinded-root, current, and policy commitments, initializes sequence to zero and the nullifier to zero, and emits only the new account public key.

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
