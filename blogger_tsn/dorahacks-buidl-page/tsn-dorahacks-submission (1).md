## Transfer Settlement Network (TSN)

### A DESP-oriented infrastructure, identity-first, privacy-preserving settlement network for intent-based stablecoin transfers on-chain.

**Track:** DeFi (payments and settlement)

**Sponsor technology:** Creditcoin and the Attestcoin Protocol

**Stage:** Solana settlement layer live; Creditcoin-first cross-chain settlement path implemented for the BUIDL CTC build

**Pitch deck:** [TSN — protocol pitch (15 slides)](https://trustlink-labs.github.io/TSN-Pitch-Deck/)

**Demo Video:** Chill 🙏

**Docs:** [Private Stablecoin Settlement Documentations - TSN](https://trust-link-tsn.mintlify.site/)

![tsn-creditcoin-architecture.webp](https://cdn.dorahacks.io/static/files/1a0918cdc925268dc214df24195b9b17.webp)

## One sentence

TSN is TrustLink Labs' Transfer Settlement Network within the Decentralized Settlement Protocol (DESP) architecture: native Solana routes use the same intent, authorization, privacy, and liability boundaries, while the cross-chain route creates a Solana debit commitment that Creditcoin consumes and converts into an authenticated Attestcoin payout message for a selected, verified, prefunded EVM settlement route.

## The problem

Crypto made value transferable, but payments remain fragmented across chains, wallet formats, token standards, fees, and transaction mechanisms. Existing systems also lack a unified identity layer, authorization policy, replay protection, privacy boundary, and liability accounting. A message can describe a payment, but it is not the payment value; each destination requires a real liquidity source.

## The insight

Traditional financial networks coordinate authorization, clearing, liquidity, and settlement across institutions. TSN applies the same separation to blockchain systems: identity and payment intent are handled by TSN, source accounting remains on Solana, and destination settlement is performed by a funded settlement domain such as Creditcoin.

| Traditional concept                    | TSN concept                                                         |
| -------------------------------------- | ------------------------------------------------------------------- |
| Bank account number                    | TIN (Transfer Identity Number)                                      |
| Payment network                        | TSN coordination layer                                              |
| Institution-to-institution instruction | Cryptographically authorized settlement commitment                  |
| Settlement network                     | Solana, Creditcoin, or another supported destination rail           |
| Institutional controls                 | On-chain authorization, replay protection, and liability accounting |

## What TSN is

TSN separates identity from settlement location. A user has one portable TIN identity associated with authorized settlement addresses. A sender chooses the destination network, and TSN coordinates authorization, routing, execution, and evidence without putting raw TIN data, device keys, or private balances on secondary chains. DeFi decentralizes financial services; DESP decentralizes settlement infrastructure.

## Verified settlement routing

TSN uses Creditcoin and the Attestcoin Protocol to connect Solana settlement
intents with verified, prefunded EVM payout routes. Route validation, source
authorization, liquidity checks, and destination execution remain separate so
the system can support multiple networks without putting raw TIN data or
private balances on secondary chains.

## The Creditcoin-first flow

```text
Solana debit commitment
   -> TSN Node reads and validates the existing commitment
   -> Node authorizes the exact Creditcoin settlement payload
   -> CreditcoinSettlementHub consumes the Solana commitment
   -> Creditcoin checks replay protection and the registered liquidity reservation
   -> Attestcoin publishes the authenticated payout message
   -> Destination executor pays stablecoins from the prefunded vault
```

Before the debit is signed, the Node and the Creditcoin Attestcoin route state must confirm that the selected destination has a registered route and a current proof-backed liquidity observation. The user/device then creates and signs the TIN debit intent. The Node validates the intent and authorizes the exact Solana transaction; generic Cranker Job 1 submits it, and the Solana program creates the debit commitment. The Node reads and validates that commitment, creates the exact Creditcoin settlement authorization, and generic Cranker Job 2 submits it. Creditcoin consumes the authorized commitment, reserves the verified destination capacity, and publishes the authenticated Attestcoin payout message. The selected destination Inbox and executor release stablecoins from that network's prefunded vault.

## Payment routes

The same TSN settlement boundaries support four native Solana routes and one Creditcoin-led cross-chain route:

| Route                                                | What happens                                                                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet deposit → wallet exit                         | Compatibility route using the same intent, authorization, and liability boundaries.                                                                                   |
| Wallet deposit → TIN credit                          | Funds become a private TCAP credit for the recipient identity.                                                                                                        |
| TIN debit → TIN credit                               | Identity-to-identity settlement; no public destination address leaves the authorized device boundary.                                                                 |
| TIN debit → wallet exit                              | Public wallet exit authorized through the existing Mother-rooted DNA and exit-permit boundary.                                                                        |
| Solana → Creditcoin or another supported EVM network | Solana creates the debit commitment; Creditcoin consumes it and Attestcoin delivers the authenticated payout instruction to the selected prefunded destination route. |

## How TSN uses the Attestcoin Smart Contract and SDK

TSN uses the official Attestcoin SDK to obtain source-chain proofs, while an
Attestcoin Smart Contract on Creditcoin verifies destination-liquidity data and
delivers an authenticated settlement message to the selected EVM payout route.
The destination vault supplies stablecoin liquidity; Attestcoin verifies and
connects the route but does not create funds.

See the [TSN cross-chain documentation](https://github.com/Trustlink-Labs/TSN-Protocol/tree/main/tsn-protocol/tsn-crosschain/docs)
for the integration code, contract references, and verification examples. The
official references are the [Attestcoin dApp infrastructure](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure),
[Attestcoin ASC contracts](https://www.npmjs.com/package/%40gluwa/asc-contracts),
and [Attestcoin examples](https://github.com/gluwa/attestcoin-protocol-examples).

## Other supported EVM settlement

The other-EVM flow, such as a Base route, adds a destination-side liquidity vault and a proof-backed route check:

```text
1. The destination EVM route and liquidity observation are verified and accepted.
2. Solana creates the debit commitment.
3. Creditcoin consumes the commitment and authorizes settlement.
4. Creditcoin becomes the source chain for the onward EVM settlement instruction.
5. After Creditcoin settlement, the Attestcoin SDK prepares the selected route and publishes the authenticated message.
6. The Attestcoin relayer delivers the message to the destination Inbox, which invokes the payout contract using prefunded stablecoin liquidity.
```

This connects Creditcoin to the other supported EVM network through a verified route, the Attestcoin SDK/message route, and a destination payout contract. A liquidity provider or treasury funds the destination vault before user payouts. The route registry records proof-backed liquidity before the SVM debit is accepted; the SDK prepares the route, the Attestcoin relayer delivers the authenticated message, and the destination Inbox invokes the payout contract. The protocol does not create destination funds; the destination vault supplies the stablecoin value.

## Protocol layers

| Layer                           | Responsibility                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| TIP                             | Transfer Identity Protocol and identity-account rules                                                                                            |
| TIN                             | Human-facing Transfer Identity Number                                                                                                            |
| Privacy-receiving root          | Owner-device relationship that binds private receiving                                                                                           |
| GPRU                            | Non-custodial authorization and routing; it never holds funds                                                                                    |
| Receiver and Node               | Authenticated ingress, Solana reading, validation, and orchestration                                                                             |
| Epoch Treasury                  | Aggregate funding and liability accounting on Solana                                                                                             |
| Mother / ConfidentialSettlement | One-time authorization boundary                                                                                                                  |
| Cranker                         | Generic multi-network, fee-paying submitter of the exact authorized transaction; each enabled network has its own configured key and fee balance |
| CreditcoinSettlementHub         | Commitment consumption, verified route reservation, authenticated Attestcoin message publication, and settlement receipt                         |
| BasePayoutVault                 | Destination-side prefunded stablecoin source and payout boundary                                                                                 |
| TCAP                            | Private balance accounting through commitment-backed tip credits                                                                                 |

## Solana settlement layer

The existing Solana flow remains unchanged. The device creates and authorizes the intent, the Receiver and Node validate the signature, amount, token, policy, commitment, sequence, nonce, and validity window, and the existing TSN/TCAP instructions perform the authorized debit, credit, and liability transitions. Sealed TIP-head overwrite, the two-phase exit commitment, Path 1/2 wiring, one-vault behavior, liability PDAs, GPRU-only authorization, and `register_tcap_exit_payout_v1` remain Solana-native boundaries.

Crankers can sponsor network fees and submit work, but they cannot change the amount, token, recipient, commitment, policy, nullifier, destination, or expiry.

## Creditcoin liquidity and fees

The selected destination route is prefunded with the configured stablecoin before payouts. Native CTC is used by the Cranker for Creditcoin gas. A payout authorization includes the settlement ID, Solana source network, sealed TIP-head hash, TIN hash, exit commitment, route, destination, token, recipient, amount, nonce, deadline, merchant override, and exact fee amount.

The Hub verifies the Node authorization, checks that the commitment has not been consumed, checks the registered route and proof-backed liquidity reservation, marks the settlement consumed, and publishes the authenticated Attestcoin message. The selected destination Inbox and executor perform the final stablecoin transfer from the destination vault. Creditcoin gas and any configured settlement fee are accounted for in the authorized payload; native network tokens are used for fees, not as the payout asset.

Direct Creditcoin settlement can use a lower fee basis-point configuration than another destination network. A complete user quote should include Solana network cost, Creditcoin gas, the Creditcoin settlement fee, and any destination-liquidity fee.

## Privacy and security

Public state contains commitments, token identifiers, policy references, sequence values, nullifiers, settlement IDs, and hashes. Raw TIN values, device keys, and private balances are not written to Creditcoin or other destination chains.

The system is designed to reject replay, wrong-network settlement, address substitution, invalid authorization, insufficient liquidity, expired authorization, and duplicate execution. Each payout binds the source commitment to the destination network, recipient, asset amount, fee, and validity window.

## Built and in-scope work

**Built:** Solana identity resolution, intent authorization, atomic funding and acceptance, confidential settlement, TCAP credit, owner-side private reads, the Creditcoin settlement hub, signed commitment consumption, replay protection, route admission, proof-backed liquidity observations, destination executor/vault boundaries, and authenticated settlement messaging.

**In scope for this build:** Attestcoin destination-message integration, destination-specific liquidity provider contracts, supported-EVM payout-vault deployment, and settlement-adapter integration. The direct Creditcoin route and every onward EVM route use the same authenticated route boundary; the destination vault remains the source of stablecoin value.

## Why this fits Creditcoin

Creditcoin provides the first funded EVM settlement domain and a coordination point for other supported destination adapters. Attestcoin provides the cross-chain verification and authenticated message-delivery layer: its readability path verifies destination liquidity, and its writability path connects the Creditcoin settlement instruction to the selected payout executor. Verification and messaging do not create liquidity. Creditcoin and other networks pay stablecoins from their own funded destination vaults, while native network tokens are used only for gas. Creditcoin is the first funded settlement rail; TSN's native Solana routes ship the same protocol.

## Links

- Repository: [Trustlink-Labs/TSN-Protocol:](https://github.com/Trustlink-Labs/TSN-Protocol) Intent-based stablecoin settlement infrastructure connecting Solana with Creditcoin and supported EVM liquidity networks through cryptographic verification, cross-chain messaging, and decentralized execution.
- Demo video: coming soon
- Pitch deck: [TSN — full protocol pitch (15 slides)](https://trustlink-labs.github.io/TSN-Pitch-Deck/)
- Docs: [Private Stablecoin Settlement - TSN DOCS](https://trust-link-tsn.mintlify.site/)
- Blog: [https://tsn-protocol.blogspot.com/](https://tsn-protocol.blogspot.com/)
- Creditcoin: [https://creditcoin.org/](https://creditcoin.org/)
- Creditcoin deployment overview: [https://creditcoin.org/Deploy](https://creditcoin.org/Deploy)
- Attestcoin Protocol: [https://docs.attestcoin.org/attestcoin-protocol](https://docs.attestcoin.org/attestcoin-protocol)
- Attestcoin architecture: [https://docs.attestcoin.org/attestcoin-protocol/architecture](https://docs.attestcoin.org/attestcoin-protocol/architecture)

TrustLink Labs develops the protocol architecture, TSN provides settlement and authorization coordination, and TrustLink Pay provides the payment application layer.
