# TIP, GPRU, and TCAP values explained

This guide distinguishes TIP route data from the target GPRU transaction state and TCAP reserve accounting. It describes the design direction; current on-chain instructions and account layouts remain authoritative for deployed behavior.

## TIP scan public key

TIP V1 stores a versioned GPRU ElGamal scan public key. The matching secret material stays with the owner. Node can use the public key to derive a new transaction-specific receiving key while the owner is offline; the recipient later recovers its matching private key locally.

## `gpruElgamalKeyCommitment`

This is a domain-separated integrity commitment to the registered ElGamal public key and its key version. It lets consumers detect that the public key or version changed unexpectedly. It is not the ElGamal key, the secret key, an encryption of the balance, or proof that a transaction is valid.

## Transaction DNA and one-time key

GPRU's target uses a unique DNA for each transaction. Node derives an ephemeral public point and one-time ElGamal public key from fresh randomness, the DNA, and the TIP scan public key. A one-time commitment binds the derivation version, DNA, ephemeral point, and one-time public key. The recipient derives the matching private key later using owner-held secret material.

The repository contains the key derivation primitive and owner recovery helper. The deployable GPRU program, on-chain derivation verification, encrypted balance proof, and TCAP handoff are not yet complete. A one-time key makes the public output unique; it does not by itself validate a credit or debit.

## Confidential balance transitions

The intended GPRU program verifies the relation between an encrypted prior state and its successor. For a debit, it must establish that the old balance covers the amount, the successor is the correct subtraction, and the result remains in the allowed range. For a TIN-to-TIN transfer, it must prove that source debit equals destination credit without revealing the amount or linking both outputs through a shared public identifier.

The owner SDK may check a locally decrypted balance to give immediate feedback. TCAP must rely on the on-chain proof result, not the SDK check. TCAP applies reserve-liability changes only after GPRU verification succeeds in the same atomic transaction.

## Public wallet boundaries

A wallet deposit is visible at its public wallet boundary; a wallet exit is likewise visible. GPRU DNA is intended to reduce stable recipient-route linkability during private state updates. It does not hide public wallet funding, public exits, or transaction timing.

## Service roles

```text
Sender signs payment and reserve-funding details
  → Receiver accepts and stores ingress work
  → Node resolves TIP and constructs the recipient's GPRU transition
  → Cranker submits the exact Node-authorized transaction
  → GPRU verifies the proof and replay rules
  → TCAP atomically applies the reserve-liability change
  → Recipient derives the one-time private key and reads its state locally
```

Receiver acceptance, Node verification, Cranker submission, and on-chain confirmation are separate events. Neither a commitment nor a status at one stage proves completion at a later stage.

## Current implementation boundary

The GPRU key derivation exists in source but is not integrated with a deployable GPRU program or TCAP settlement ABI. TCAP's present instructions define current behavior; confidential debit and exit remain disabled. See [Current architecture](./CURRENT-ARCHITECTURE.md), [GPRU and TCAP route](./gpru-tcap-route.md), and [TCAP target design](./TCAP-V2-DEBIT-CREDIT-DESIGN.md).
