# TrustLink Pay / TSN

TrustLink Labs is building **TSN (Transfer Settlement Network)**, an
identity-aware payment coordination and settlement infrastructure on Solana.
TrustLink Pay is the application experience built on that network. **TCAP
(Transfer Confidential Asset Protocol)** provides the commitment-backed private
balance accounting used by the current credit architecture.

## TrustLink Labs resources

- [TrustLink Pay application](https://trustlink-pay.vercel.app/)
- [TSN Protocol research blog](https://tsn-protocol.blogspot.com/)
- [TrustLink Labs GitHub organization](https://github.com/Trustlink-Labs)
- [Service hosting and deployment map](docs/SERVICE-HOSTING.md)
- [Live testing and contributor guide](docs/GETTING-STARTED-LIVE.md)
- [Cranker operator guide](docs/CRANKER-OPERATOR-GUIDE.md)
- [Receiver, Node and settlement verification](docs/tsn-receiver-verification-settlement.md)

TSN coordinates identity resolution, signed payment intents, redacted Receiver
work, Node verification, leases, Epoch Treasury liability, Mother authorization
and exact transaction submission. TCAP consumes the authorized credit receipt,
advances a tip commitment and supports an owner-private encrypted snapshot.

## The current TrustLink credit path

The active receiving and credit architecture is:

```text
TIN identity
  -> privacy-receiving root
  -> GPRU authorization and routing (non-custodial)
  -> TSN Epoch Treasury coordination
  -> Mother / TSN ConfidentialSettlement authorization
  -> TCAP tip credit
  -> encrypted private balance snapshot
  -> owner-device private balance read
```

```mermaid
flowchart TD
    A["1. Sender chooses recipient TIN, asset, amount and policy"]

    subgraph DEVICE["Authorized sender device"]
        B["2. TSN SDK resolves the TIN and privacy-receiving-root relationship"]
        C["3. SDK builds the signed payment intent, route commitment, nonce and expiry"]
        D["4. Owner signs locally; private roots, GPRU authorization and snapshot key remain on device"]
    end

    F["5. Frontend submits the signed intent to the TSN Receiver"]

    subgraph RECEIVER["TSN Receiver — durable ingress, leases and evidence"]
        G["6. Payment intent stored as RECEIVED"]
        H["7. Verified payment and settlement work published"]
        O["18. Funding confirmed; settlement work becomes available"]
        R["27. Confirmed signatures, transaction evidence and receipt state stored"]
    end

    subgraph VERIFIER["TSN Node and verifier services — decision authority"]
        I["8. Node leases and verifies the payment intent"]
        J["9. Node resolves the redacted recipient binding and destination constraints"]
        P["10. Node verifies signatures, source, amount, token, policy, expiry, commitment and replay"]
        Q["11. Node creates AcceptedIntentV1 and canonical accepted_intent_root"]
        P2["12. Node confirms payment-intent submission; settlement work becomes active and leaseable"]
    end

    subgraph CRANKER["Cranker — exact submitter only"]
        K["14. Cranker leases the verified payment intent"]
        L["15. Cranker submits the exact sender-authorized funding transaction"]
        S["19. Cranker leases the active ConfidentialSettlement work"]
        T["20. Cranker submits the exact one-time settlement transaction"]
        T2["Residual reimbursement work is separate and cannot create a TCAP credit"]
    end

    subgraph SOLANA["Solana — TSN, Epoch Treasury and TCAP programs"]
        AA["13. Mother and TSN authorize the one-time ConfidentialSettlement transition"]
        M["16. TSN verifies the Node-approved funding transaction, lease and controlled accounts"]
        N["17. Epoch Treasury records liability; funds remain governed and are not Cranker custody"]
        U["21. TSN verifies settlement lease, AcceptedIntent root, amount, token, expiry and replay state"]
        V["22. TSN CPI registers the complete ConfidentialSettlement receipt in TCAP"]
        W["23. TCAP verifies receipt fields, policy, GPRU scope, sequence and nullifier"]
        X["24. credit_tcap_tin_tip_v1 advances the tip and consumes the receipt/nullifier"]
    end

    subgraph PRIVATE["Owner-private balance state"]
        Y["25. Owner device encrypts and persists the new balance snapshot"]
        Z["26. Owner reads and decrypts the matching snapshot locally"]
    end

    A --> B --> C --> D --> F --> G --> I --> J --> P
    P -->|"valid"| Q --> P2 --> AA --> H --> K --> L --> M --> N --> O --> S --> T --> U --> V --> W --> X --> Y --> Z --> R
    P -->|"invalid or expired"| REJECT["Reject, requeue or refund according to TSN policy"] --> R
    T --> T2 --> R

    classDef device fill:#edf3ec,stroke:#284c36,color:#17251b;
    classDef receiver fill:#f6f0df,stroke:#8b7131,color:#30240d;
    classDef verifier fill:#e9efed,stroke:#4e6e60,color:#14241c;
    classDef cranker fill:#f2eee6,stroke:#6b6254,color:#211f1a;
    classDef chain fill:#e7eee9,stroke:#1f5038,color:#10251a;
    classDef private fill:#fbf6e9,stroke:#8b7131,color:#30240d;
    classDef outcome fill:#fbf6e9,stroke:#8b7131,color:#30240d;
    class A,B,C,D device;
    class F,G,H,O,R receiver;
    class I,J,P,Q,P2 verifier;
    class K,L,S,T,T2 cranker;
    class AA,M,N,U,V,W,X chain;
    class Y,Z private;
    class REJECT outcome;
```

The device authorizes the intent and retains private roots and snapshot keys.
The Receiver and Node handle only the redacted coordination data required for
verification. TSN persists the accepted intent and its canonical root, the Epoch
Treasury and Mother bind the one-time ConfidentialSettlement authorization, and
the Cranker leases the verified payment intent, submits the exact authorized
funding transaction, then submits the activated one-time settlement transaction.
TCAP validates the
complete receipt, advances the tip and consumes the replay protection state. If
settlement is not successfully verified, the transaction fails and the sender
funds revert or are refunded according to the governing path; the recipient is
not credited by a partial result. The owner device then encrypts and reads the
matching private snapshot.

## Core terms and authority boundaries

- **TSN:** Transfer Settlement Network, coordinating authorization, leases,
  epoch liability and settlement execution.
- **TIN:** Transfer Identity Number, a 10-digit identity and route-discovery
  handle; it is not a private key, token account or balance.
- **TIP:** Transfer Identity Protocol and the Transfer Identity stack that
  issues and resolves TIN relationships.
- **GPRU:** Guard Privacy Routing Unit, a non-custodial authorization and
  routing layer that never holds funds or balances.
- **TCAP:** Transfer Confidential Asset Protocol, the private balance accounting
  layer for tip transitions and encrypted owner snapshots.
- **Receiver:** durable ingress, redacted work storage, leases and status
  evidence; it does not receive plaintext roots or spend keys.
- **TSN Node:** off-chain verifier that checks signatures, policy, commitments,
  sequence, expiry, replay material and account bindings.
- **Mother and Epoch Treasury:** protocol-controlled authorization and aggregate
  liability boundaries for an epoch.
- **Cranker:** fee-paying submitter of already authorized work; it cannot change
  amount, token, recipient binding, commitments, sequence, policy, scope,
  nullifier or expiry.
- **TCAP program:** on-chain receipt, tip, commitment and nullifier enforcement.

Solana validators provide execution, ordering, consensus and finality. They are
not TSN Nodes or Crankers; TSN uses Solana and does not replace Solana
consensus.

## AcceptedIntent and ConfidentialSettlement ABI

For a TCAP credit, TSN creates an `AcceptedIntentV1` PDA and derives a
domain-separated root over the canonical fields: epoch ID, intent commitment,
amount, token ID, recipient tip-root commitment, settlement commitment, asset
commitment, policy commitment, GPRU scope commitment, replay nonce, nullifier
and validity window. The TSN CPI wrapper receives that PDA, verifies the fields
against the record and consumes the intent after the TCAP CPI succeeds.

The shared `ConfidentialSettlement` receipt includes the intent commitment,
amount, settlement commitment, accepted-intent root, previous TCAP root,
transition type, asset commitment, authorization digest, verifier domain
version, validity window, replay nonce, tip PDA, previous/new commitments,
sequence, token ID, policy commitment, GPRU scope commitment and nullifier.
TCAP rejects an incomplete, mismatched, wrong-transition or replayed receipt.

## Supported route boundaries

1. **TIN-to-TIN credit:** the current private receiving route through GPRU, TSN
   authorization and TCAP tip credit.
2. **Wallet-to-TIN credit:** a public source can be coordinated with the same
   private receiving and credit boundary when the governed asset path is ready.
3. **Wallet-to-wallet compatibility:** public settlement remains a separate
   compatibility route with public chain visibility.
4. **Debit and exit:** interfaces may exist, but live confidential debit and
   exit remain proof-gated and disabled. A GPRU signature, hash-only payload or
   placeholder proof cannot spend or drain liquidity.

## Historical architecture boundary

ZK-PRU was an earlier protected receiving and spending experiment. It was
superseded by the privacy-receiving-root, GPRU and TCAP model and is retained
only for historical auditability. New integrations must not target ZK-PRU as a
receiving, balance or spending architecture. See the [ZK-PRU retirement note](docs/ZK-PRU-RETIRED.md).

## Evidence and Devnet policy

TrustLink distinguishes code evidence, build evidence, Devnet transaction
evidence and production-readiness evidence. A checked-in helper or successful
simulation does not prove that a program is deployed. Reviewers should record
the program ID, cluster, upgrade authority, deployment slot, transaction
signature and post-transaction account state.

Program-dependent testing is Devnet-only. After any on-chain code or ABI change,
build the SBF artifact, deploy it to Devnet, verify the deployment slot and only
then run simulation or live transactions. See [Devnet build and deploy](docs/DEVNET-BUILD-DEPLOY.md) and the [TCAP credit smoke procedure](docs/tcap-devnet-credit-smoke.md).

## Historical Devnet evidence: first wallet-assisted TIN-to-TIN test

The project&#8217;s first recorded Devnet payment test used the earlier ZK-PRU
receiving path. It is preserved here as historical transaction evidence only;
it is not the current TSN receiving or TCAP credit architecture. The test used a
sender TIN route and recipient TIN route, combined a 5 USDC main-wallet top-up
with the sender-side sources for a 10 USDC intent, and settled into a new
private receiving route.

```mermaid
flowchart TD
    A["Sender TIN"]
    B["Main wallet top-up<br/>5 USDC"]
    C["Earlier protected source 1"]
    D["Earlier protected source 2"]
    E["Earlier protected source 3"]
    F["Combined sender funding<br/>10 USDC intent commitment"]
    G["TSN settlement submission"]
    H["Recipient TIN route"]
    I["Earlier private receiving route<br/>10 USDC"]

    A --> B
    A --> C
    A --> D
    A --> E
    B --> F
    C --> F
    D --> F
    E --> F
    F --> G --> H --> I
```

| Stage | Recorded role | Devnet signature |
| --- | --- | --- |
| Wallet funding | 5 USDC main-wallet top-up used in the sender funding set | [5u9HmqD5...](https://solscan.io/tx/5u9HmqD5wNmBmHWfDWmw3vhpMhN42j15YPTmUVgpcMtbuwdGdhqRVqGrZAVF5ic1CiS1ZzuF1D2tMyVaanf4eqye?cluster=devnet) |
| Protected source batch A | Earlier protected source movement; part of the sender funding set | [3wgVPZYz...](https://solscan.io/tx/3wgVPZYzEqvht5pkPRetF8tFsXoWmy8obbSSqYYTmxaR1fw6oci2y93P96GhK4xXqu4ttSSD7mMYPyEoDjXVporU?cluster=devnet) |
| Protected source batch B | Earlier protected source movement; completed the recorded source set | [2M26JcpS...](https://solscan.io/tx/2M26JcpSVhKAQvB5yC3Pp4L6NYLHiU8UTMFMsrMbJwt2Jj23dd3pqRG8nWTxerYrcXqm7R78Jt4992smK7jh7eWJ?cluster=devnet) |
| Settlement | 10 USDC settlement into the recipient TIN&#8217;s recorded private receiving route | [46wGVb9s...](https://solscan.io/tx/46wGVb9sfBqWWonk3CQ14xZCc6Qzf2ksYyZMpG4TDhqzhh49pRS59CjhCgq9oPVnfEVhSKdJyb3Rib7HM99A8TfU?cluster=devnet) |

These signatures are preserved as supplied Devnet evidence. They document the
earlier route and must not be used as evidence that the current GPRU, TSN Epoch
Treasury and TCAP credit path has been deployed or validated.

Current Devnet program IDs:

| Program | Address |
| --- | --- |
| TSN / `trustlink_escrow` | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |
| TCAP / `tcap` | `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` |
| TIP / Transfer Identity / TIN registrar | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | TrustLink Pay application |
| `backend/` | API, application records and notifications |
| `transfer-identity-protocol/` | TIP/TIN registrar and SDK |
| `tsn-protocol/` | TSN programs, SDK, Receiver, Node and Cranker tooling |
| `tcap-protocol/` | TCAP program, SDK and credit tooling |
| `protocol-tests/` | Devnet-only protocol scenarios and UI |
| `docs/` | Architecture, security, operations and evidence documentation |

## Milestones and ecosystem support

TrustLink Pay has progressed through StableHacks, and received support through
the Superteam Agentic Engineering Grant program for fraud-protection
development. The factual project history and acknowledgements are in [Project
Journey](https://github.com/bigdreamsweb3/trustlink-pay/blob/bb833d563f283bc9690963faa5a3c2c16b9e1d5f/docs/PROJECT-JOURNEY.md).

See what people are saying about the project: [Community Mentions](https://github.com/bigdreamsweb3/trustlink-pay/blob/bb833d563f283bc9690963faa5a3c2c16b9e1d5f/docs/mentions.md).

## Maintainer

TrustLink Pay is created and led by **Agbaka Matthew Daniel U. E. (Big Dreams Web3)**.

- [X / @0xbigdream](https://x.com/0xbigdream)
- [GitHub / @bigdreamsweb3](https://github.com/bigdreamsweb3)
- [LinkedIn / Big Dreams Web3](https://www.linkedin.com/in/bigdreamsweb3/)
- [TrustLink Labs](https://github.com/Trustlink-Labs)

## License

[MIT](LICENSE)
