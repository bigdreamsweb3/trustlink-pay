# TrustLink Pay security

TrustLink separates payment identity, authorization, settlement coordination, and asset custody. The native-credit proof hides the recipient TIN route and private predecessor witness from the on-chain statement. The owner retains private recovery/history material. However, Node derives the published nullifier from the public deposit signature and TCAP program ID, so an observer can compute the funding-to-credit link without a secret. Amount, asset, shared roots, successor point, ciphertext, accounts and timing are also visible, and the authorized Node handles private resolution/witnesses. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. The implemented source does not establish general unlinkability, owner-only knowledge or completed live settlement. Required artifact/witness settings and matching chain/verifier state remain runtime gates; see the [canonical privacy record](./laboratory/cryptography.md).

## Current wallet-to-TIN credit path

The sender authorizes the canonical payment and exact reserve deposit. Receiver accepts ingress, Node verifies funding and prepares a root-matching settlement proof, and Cranker submits the permitted transactions. TSNP checks Mother authority and invokes TCAP; TCAP checks funds/root/accounting and invokes GPRU proof/Memo verification before atomic root and liability mutation.

The shared TCAP root commits authenticated hidden head and nullifier state. Its root/sequence check alone is insufficient; the hidden-head proof establishes the relevant membership and successor relation. Node witness/prover adapters and the cross-service credit caller exist in current source. Local proof/build evidence is recorded in the [dated readiness experiment](./laboratory/experiments/EXP-20261102-hidden-head.md); that evidence does not establish current deployment or confirmed settlement.

## Component boundaries

- The wallet authorizes the sender's funding transaction; the Cranker cannot alter or re-sign that user authorization.
- Receiver accepts and persists ingress and work records. Node verifies requests, resolves TIP routing, and constructs settlement work.
- GPRU verifies the hidden route/head and balance transition relation without custody of funds. Source wiring and local proofs are separate from production soundness review, matching verifier initialization and confirmed chain execution.
- TCAP governs accepted assets, authorization, reserve movement, liquidity, and the shared commitment root. It applies a valid transition atomically; it does not rely on GPRU to custody or regulate funds. Legacy per-TIN TIP instructions remain in source but are not the active TSN credit path.
- The Cranker pays Solana fees and submits eligible work. It does not choose a new recipient, amount, or route.

## Security and privacy boundaries

Encrypted Memo contents are not plaintext to chain observers, but the transaction, instruction layout, public account keys, timing, fees, and public token movements remain observable. The shared TIP route root and TCAP root expose protocol participation and ordering, not an individual TIN identity or pointer to its prior settlement. Direct wallet transfers reveal both endpoints; a TIN-to-wallet exit reveals the output wallet and amount but not the source TIN. Later activity from the output wallet remains publicly traceable from that wallet.

The current credit requires both root/sequence continuity and a valid hidden-head proof. The circuit contains balance arithmetic and nullifier constraints; reserve solvency is checked by TCAP. Confidential debit and exit must not be described as enabled based solely on those constraints or retained legacy instructions. Metadata correlation and complete owner history retrieval remain separate limits; see [cryptography](./laboratory/cryptography.md) and [invariants](./laboratory/invariants.md).

The epoch-treasury and `AcceptedIntent` instruction family is a separate program capability. Its opaque slots, Mother permits, and treasury-liability rules apply only when those instructions are invoked; they are not the state model for current wallet-to-TIN credit.

## Operational controls

Protect operator keypairs, upgrade authorities, RPC credentials, Receiver credentials, and local wallet recovery material. Never place secrets in public logs, screenshots, frontend bundles, or committed configuration. Verify deployment and transaction status using the selected cluster, program IDs, signatures, and fetched account state; source code or a local build alone does not prove deployed behavior.

Invalid signatures, expired authorizations, mismatched commitments, unapproved assets, stale shared roots, and invalid GPRU transition inputs must fail closed. Preserve privacy-safe evidence and avoid recording decrypted payloads or secret material.
