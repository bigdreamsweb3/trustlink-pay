# TCAP confidential debit and credit target

This document describes the target integration of GPRU transaction DNA with TCAP reserve accounting. It is a design specification, not a statement that the described flow is deployed. The TCAP program instructions and account layouts remain the implementation source of truth.

## Responsibilities

- **TIP** resolves a TIN and provides the associated versioned GPRU scan public key and route policy commitments.
- **GPRU** creates unique per-transaction DNA outputs, verifies encrypted-state transitions and replay protection, and supplies a validated transition to TCAP.
- **TCAP** owns governed assets, reserve accounting, and confidential liabilities. It updates those liabilities only after GPRU validates the corresponding transition.
- **TSN Node** resolves and validates recipient routing, constructs the transition, and authorizes immutable settlement work.
- **Receiver** accepts and stores ingress. **Cranker** submits the exact Node-authorized transaction; it does not resolve recipient secrets or change the transition.

## Credit path

For wallet-to-TIN credit, the sender signs payment details and a wallet reserve-deposit transaction. The SDK does not fetch the recipient's TIP route or construct a recipient transition. Receiver accepts the signed ingress; Node resolves the TIN from TIP, validates the route and asset, and derives a unique GPRU DNA with a one-time ElGamal public key. Node releases settlement work only after constructing and validating the complete transition.

Cranker submits that work unchanged. GPRU must verify that the key derivation is valid for the registered scan key and DNA, validate the encrypted-state successor proof, and enforce replay protection. In the same atomic transaction, TCAP applies the corresponding governed-asset liability update. A failed GPRU proof or TCAP invariant must roll back the whole settlement.

## Debit path

A TIN debit requires an owner-authorized request and a proof that:

1. the prior encrypted state is valid and associated with the consumed state;
2. the debit amount is no greater than the prior balance;
3. the successor ciphertext represents the exact subtraction and remains in the allowed range;
4. the asset, policy, DNA, expiry, and one-time nullifier match the authorization;
5. the nullifier has not been used before.

The owner SDK may check a locally decrypted balance for user feedback. TCAP must rely on GPRU's verifiable proof and state transition, not that local check. The proof format and its verifier remain to be implemented and audited.

## Encrypted addition and subtraction

The balance-state objective is to let the protocol apply credits and debits to encrypted state without decrypting the balance. Homomorphic arithmetic can support addition and subtraction over ciphertexts, but encrypted arithmetic alone does not prove that a debit is affordable. GPRU must verify a proof that binds the prior ciphertext, transaction amount, and successor ciphertext, including a non-negative range check. The concrete encryption scheme, proof construction, and account ABI are not finalized in the current program source.

## TIN-to-TIN transfer

A transfer must prove that the source debit and destination credit conserve value without exposing the amount or giving both outputs a shared public transfer address. Each side receives transaction-specific DNA. A proof must bind both encrypted successors to the same hidden amount and governed asset. TCAP's reserve liability changes must be consistent with the internal transfer and cannot create or destroy liabilities.

## Wallet boundaries and asset accounting

Wallet deposits and exits remain publicly visible at their wallet boundary. TCAP tracks actual assets held in the governed vault separately from confidential liabilities owed to TIN holders. A public deposit can increase assets and a validated private credit can increase liabilities; a validated debit or exit must preserve solvency. Exact fee charging, rate conversion, and account structures must follow the eventual audited TCAP ABI rather than assumptions in this design note.

## Privacy and authorization constraints

- Do not publish a stable TIP route address as every transfer's destination; use unique GPRU DNA outputs.
- Do not send owner private keys or plaintext balances to Receiver, Node, or Cranker.
- Do not treat a GPRU public-key commitment, hash, signature, or ciphertext shape as proof of a valid balance transition.
- Do not let Cranker modify the Node-authorized asset, amount binding, DNA, proof, policy, sequence, or nullifier.
- Do not report Receiver acceptance as Node verification or chain settlement. These are separate lifecycle events.
- Public wallet deposits and exits reveal their wallet-level transaction data; DNA does not hide those boundaries.

## Status

The GPRU source currently contains the one-time ElGamal derivation primitive, but the deployable program, encrypted balance proof system, replay-safe state transition, and atomic TCAP handoff are not connected to the current chain path. Existing debit and exit paths remain disabled. Current program source and deployed account layouts define executable behavior; this document describes the target asset-accounting contract.
