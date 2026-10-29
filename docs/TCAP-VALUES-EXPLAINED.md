# TIP, GPRU, and TCAP values explained

This guide describes the source-backed credit path and distinguishes commitments from proofs and persisted state.

## TIP route values

TIP's TIN V1 route contains a versioned GPRU ElGamal scan public key and its key commitment, plus route and policy commitments. The scan key is public route material; the owner holds the corresponding secret material. Its commitment detects substitution of the key/version. It is not a private key, proof of ownership, current-balance pointer, or proof of a valid balance transition.

## GPRU credit values

The current TSN credit instruction invokes GPRU to verify a transaction DNA key proof and an encrypted credit transition. For an initial credit, GPRU validates the ciphertext/proof against the funded amount. For later credits, it checks ElGamal addition against a predecessor ciphertext supplied by the caller. GPRU does not persist a per-TIN current head in this path; therefore these checks do not establish by themselves that the supplied predecessor is the latest for the TIN.

The Memo commitment binds the transition to instruction data. It is an integrity reference to those bytes, not proof of their encrypted-balance semantics.

## TCAP shared root

TCAP's current credit instruction advances one global commitment root and sequence after checking the current root, authorization, asset, policy, and validity window. This shared root prevents replay of a stale global transition. It is not a separate root or balance account for each TIN. TCAP's active path does not store Memo payloads or encrypted balance ciphertext in a per-TIN account.

## Hidden-head source

The GPRU Circom source describes a private route/head update proof; TCAP contains an instruction that invokes the verifier and advances the same global root. The active TSN, Node, SDK, and Cranker flow does not invoke this path. The circuit has not been shown compiled and set up with generated keys and end-to-end proofs. It does not implement encrypted addition/subtraction, debit affordability, or reserve solvency. Its current instruction ABI exposes action kind, token ID, and amount.

## Privacy limits

The hidden-head design aims to hide which route/head changed, but each update touches the same public writable TCAP root. The repeated account reference and global ordering are visible; this is not zero-linkability. Wallet funding and public exits also retain their normal public transaction metadata.

For the full source contract and verification limits, see [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md).
