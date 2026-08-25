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
    A["Device: resolve recipient TIN and build the payment intent"]

    subgraph DEVICE["Authorized device"]
        B["Sign intent, route commitment, GPRU scope, nonce and expiry locally"]
        C["Private roots, signing authority and snapshot key remain on device"]
    end

    subgraph RECEIVER["Receiver ingress"]
        D["Store authenticated, redacted work and lease state"]
    end

    subgraph NODE["TSN Node"]
        E["Verify signatures, amount, token, recipient binding, policy, commitments, expiry and replay"]
        F["Publish the exact authorized funding + acceptance work"]
    end

    subgraph ATOMIC["One atomic Solana transaction — one payer and one fee"]
        G["Cranker submits exactly two instructions"]
        H["1. tsn_fund_epoch_treasury<br/>2. tsn_accept_intent"]
        I["Both carry the same bound amount, token, intent commitment and epoch"]
    end

    subgraph ONCHAIN["TSN on-chain state"]
        J["Epoch Treasury records the funded liability"]
        K["AcceptedIntentV1 stores the canonical accepted_intent_root"]
    end

    subgraph SETTLEMENT["Later settlement and credit work"]
        L["Node/Mother authorize ConfidentialSettlement"]
        M["Cranker submits only the exact authorized settlement transaction"]
        N["TSN CPI registers the complete TCAP authorization receipt"]
        O["credit_tcap_tin_tip_v1 validates and advances the TCAP tip"]
    end

    subgraph PRIVATE["Owner-private balance state"]
        P["Owner encrypts and persists the new balance snapshot"]
        Q["Owner reads and decrypts the matching snapshot locally"]
    end

    A --> B --> C --> D --> E --> F --> G --> H --> I --> J --> K --> L --> M --> N --> O --> P --> Q
    E -->|"invalid or expired"| REJECT["Reject, requeue or refund according to policy"]
    H -. "failure in either instruction reverts the whole transaction" .-> REJECT

    classDef device fill:#edf3ec,stroke:#284c36,color:#17251b;
    classDef receiver fill:#f6f0df,stroke:#8b7131,color:#30240d;
    classDef verifier fill:#e9efed,stroke:#4e6e60,color:#14241c;
    classDef cranker fill:#f2eee6,stroke:#6b6254,color:#211f1a;
    classDef chain fill:#e7eee9,stroke:#1f5038,color:#10251a;
    classDef private fill:#fbf6e9,stroke:#8b7131,color:#30240d;
    classDef outcome fill:#fbf6e9,stroke:#8b7131,color:#30240d;
    class A,B,C device;
    class D receiver;
    class E,F verifier;
    class G,H,I cranker;
    class J,K,L,M,N,O chain;
    class P,Q private;
    class REJECT outcome;
```

The device signs the payment intent locally and retains the privacy-receiving
root, GPRU authorization material and snapshot key. The Receiver stores only
authenticated, redacted work, and the Node verifies it before publishing the
exact authorized funding and acceptance work. Funding and AcceptedIntent are
submitted in a single atomic transaction to avoid a second fee and partial
funding without acceptance: `tsn_fund_epoch_treasury` executes first and
`tsn_accept_intent` executes second, with one payer and the same bound fields.
If either instruction fails, the whole transaction reverts.

The Epoch Treasury liability and `AcceptedIntentV1` root are then present
on-chain for the later settlement path. Mother/TSN authorize the
`ConfidentialSettlement`, the Cranker submits only the exact authorized
settlement transaction, and TCAP consumes the complete receipt through
`credit_tcap_tin_tip_v1` before the owner device persists and reads its
encrypted private snapshot. This diagram describes the protocol path; it does
not claim that Devnet credit has already been proven.

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
