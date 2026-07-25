# ZK-PRU Architecture

ZK-PRU is the privacy authorization and purpose-bound protected receiving
identity protocol inside the Transfer Settlement Network (TSN). “PRU” is not
a standalone protocol name in the active architecture; every protected
receiving unit is a ZK-PRU handle governed by this protocol.

## Purpose

ZK-PRU lets a user control purpose-bound payment identities and protected
receiving routes without handing root privacy material to TSN infrastructure.
It is an authorization protocol, not merely a wallet-hiding feature.

## Problem solved

Raw wallet addresses are reusable public identifiers. Reusing one address
across payment, subscription, merchant, and application contexts creates
linkage. ZK-PRU gives each approved protocol purpose a distinct authorization
namespace while keeping the root privacy secret user-controlled.

## Master seed protection

The user's wallet initializes ZK-PRU. ZK-PRU generates a cryptographically
random master seed. The master seed is encrypted for the user and is never
owned or decrypted by a TSN node. It must never appear in logs, transaction
data, AI evidence, or server-side diagnostics.

## Encrypted registry model

The ZK-PRU registry stores an encrypted seed blob and public commitments bound
to the user wallet, registry version, protocol ID, and purpose policy. Public
records may identify a commitment or authorization handle; they do not expose
the decrypted master seed or private receiving material.

## User-device decryption

When access is required, the encrypted record is retrieved to the user's
device. The device decrypts it locally, derives the authorized purpose-bound
material, and keeps decrypted material in device memory. Only an approved
signature, commitment, or zero-knowledge proof leaves the device.

## Purpose IDs and protocol IDs

Every request is bound to:

- `protocol_id`: the protocol receiving authorization;
- `purpose_id`: the approved use within that protocol;
- authorization scope: provider, amount, frequency, expiry, and policy limits.

The same user therefore does not need to expose one reusable identity to every
application.

## Layer 2 authorization keys

The master seed is not a Layer 2 key. A Layer 2 key is a short-lived,
purpose-bound authorization capability derived only for an approved purpose.
Not every purpose receives one. The TIN payment purpose receives a Layer 2
capability because TSN payments require controlled authorization.

## TIN purpose

TIN is TSN's human-facing payment identity. The TIN purpose in ZK-PRU binds a
payment authorization to the sender's selected recipient identity, amount,
token, expiry, nonce, and settlement policy. The sender selects a TIN; the
sender does not need to request or publish a recipient wallet address.

## Subscription authorization example

A subscription provider may receive a purpose-bound ZK-PRU authorization with:

- provider identity;
- maximum amount;
- billing frequency;
- expiration;
- cancellation and policy conditions.

An authorization outside those conditions is rejected even if another
component attempts to submit the transaction.

## Relationship with TSN

TSN is the complete network. ZK-PRU supplies privacy authorization and
protected receiving identity infrastructure to TSN settlement coordination,
TIN payment identity, and Cranker execution. TrustLink Pay is the application
experience built around those TSN components.

## Relationship with TCAP

TCAP is TSN's confidential asset and reserve-backed ownership infrastructure.
ZK-PRU authorizes purpose-bound identity and receiving access; TCAP manages
approved assets, reserve backing, funding claims, ownership commitments, and
future confidential settlement state. These responsibilities must not be
collapsed into one component.

## Security boundaries

- The wallet and user's device control decryption of the master seed.
- The ZK-PRU registry stores encrypted material and public commitments.
- TSN nodes receive only minimum authorized settlement data.
- Crankers submit authorized settlement transactions and pay network fees;
  they do not receive root privacy secrets or custody user funds.
- TCAP validates asset and reserve rules; it does not become the ZK-PRU key
  manager.
- Diagnostics and AI receive sanitized evidence only.

The repository includes ZK-PRU source, SDK, registry, and circuit material.
Runtime deployment and empirical privacy guarantees must still be reported
with their actual evidence status; architecture terminology does not by itself
prove a Devnet deployment.
