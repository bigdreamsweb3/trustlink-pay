# TrustLink Pay security

TrustLink separates payment identity, authorization, settlement coordination, and asset custody. Solana transactions remain publicly observable; the protocol reduces selected identity links and protects encrypted payloads, but it does not make transaction timing, token movements, or all routing metadata private.

## Current wallet-to-TIN credit path

The sender authorizes and funds a credit. Receiver accepts the authenticated intent, Node verifies it and prepares settlement work, and the Cranker submits the authorized transactions while paying network fees. The TSN credit instruction invokes GPRU checks for the transaction DNA key and encrypted credit relation, binds Memo instruction data by commitment, and calls TCAP to atomically advance its shared commitment root.

The shared TCAP root is protocol-wide replay sequencing, not a per-TIN balance head. The active path does not write the Memo or ciphertext into a per-TIN account, and its shared-root check alone does not prove that a supplied per-TIN ciphertext is the latest. The hidden-head proof instructions exist separately in source but are not called by the current Node/SDK/Cranker settlement path; their end-to-end circuit, setup, prover, and deployment are not verified here.

## Component boundaries

- The wallet authorizes the sender's funding transaction; the Cranker cannot alter or re-sign that user authorization.
- Receiver accepts and persists ingress and work records. Node verifies requests, resolves TIP routing, and constructs settlement work.
- GPRU's role is to guard the integrity and privacy of the user's private state presented to TCAP for a balance-changing action. Its hidden-head proof is intended to establish that the state is current and the proposed transition follows from it, without exposing the TIN or hidden per-TIN state in the proof. The hidden-head proof path is not currently connected end to end; the active credit path checks narrower GPRU key/credit relations and does not establish a per-TIN latest head.
- TCAP governs accepted assets, authorization, reserve movement, liquidity, and the shared commitment root. It applies a valid transition atomically; it does not rely on GPRU to custody or regulate funds. Legacy per-TIN TIP instructions remain in source but are not the active TSN credit path.
- The Cranker pays Solana fees and submits eligible work. It does not choose a new recipient, amount, or route.

## Security and privacy boundaries

Encrypted Memo contents are not plaintext to chain observers, but the transaction, instruction layout, public account keys, timing, fees, and public token movements remain observable. Reusing a TIP registry account and TCAP's shared writable root can expose linkage or ordering. Public deposits and exits can reveal amounts and token-account relationships according to their on-chain representation.

The active shared-root transition rejects reuse of a stale global root/sequence. It is not a proof that a supplied per-TIN predecessor is current, and it does not establish debit affordability or balance solvency. Confidential debit and exit must not be described as enabled based solely on legacy instructions or separate proof-verifier source.

The epoch-treasury and `AcceptedIntent` instruction family is a separate program capability. Its opaque slots, Mother permits, and treasury-liability rules apply only when those instructions are invoked; they are not the state model for current wallet-to-TIN credit.

## Operational controls

Protect operator keypairs, upgrade authorities, RPC credentials, Receiver credentials, and local wallet recovery material. Never place secrets in public logs, screenshots, frontend bundles, or committed configuration. Verify deployment and transaction status using the selected cluster, program IDs, signatures, and fetched account state; source code or a local build alone does not prove deployed behavior.

Invalid signatures, expired authorizations, mismatched commitments, unapproved assets, stale shared roots, and invalid GPRU transition inputs must fail closed. Preserve privacy-safe evidence and avoid recording decrypted payloads or secret material.
