# TrustLink Labs / TrustLink Pay

TrustLink Labs is building the **Transfer Settlement Network (TSN)**: an
identity-aware payment coordination and settlement infrastructure that runs on
Solana. TrustLink Pay is the application experience built on that network.

## TrustLink Labs resources

- [TrustLink Pay live application](https://trustlink-pay.vercel.app/)
- [TSN Protocol research blog](https://tsn-protocol.blogspot.com/)
- [TrustLink Labs GitHub organization](https://github.com/Trustlink-Labs)
- [TrustLink Pay source repository](https://github.com/bigdreamsweb3/trustlink-pay)

TSN combines identity, recipient discovery, protected receiving and spending,
authorization, payment intents, Receiver work queues, TSN Node verification,
Cranker execution, commitment checks, escrow, reimbursement, receipts, replay
protection, and recovery tracking.

## A finalized TSN payment

TSN separates payment intent, verification, settlement execution, and any later
reimbursement decision. The Receiver stores work, the TSN Node and verifier
services decide whether work is valid, and a short lease gives one Cranker the
right to submit the exact settlement work. A Cranker cannot mark a payment paid,
recoverable, or reimbursable.

```mermaid
flowchart TD
    A["1. Sender chooses recipient TIN or public wallet, asset, amount, and fees"]

    subgraph DEVICE["Authorized sender device"]
        B["2. TSN SDK resolves the route and selects sources"]
        C["3. SDK builds the signed intent, route commitment, nonce, and expiry"]
        D["4. Main wallet and selected ZK-PRU authorities sign locally"]
    end

    F["5. Frontend submits the signed intent to TSN Receiver"]

    subgraph RECEIVER["TSN Receiver — durable ingress, leases, and evidence"]
        G["Intent stored as RECEIVED"]
        H["Verified intent work published"]
        O["Settlement work published only after verification"]
        R["Confirmed signatures and non-secret evidence stored"]
    end

    subgraph VERIFIER["TSN Node and verifier services — decision authority"]
        I["6. Lease and verify the payment intent"]
        J["7. Verify signatures, commitment, source, amount, route, expiry, and replay state"]
        P["12. Node decrypts recipient route and creates the settlement intent<br/>(inactive until payment intent verification)"]
        Q["13. Node confirms the payment intent was submitted<br/>and asks the TSN Program to validate settlement state"]
        P2["14. Settlement intent becomes active and leaseable"]
    end

    subgraph CRANKER["Cranker — submitter only"]
        K["8. Cranker leases verified intent work"]
        L["9. Cranker submits the exact sender-authorized funding transaction"]
        S["15. Cranker submits the exact leased settlement transaction"]
        T["17. Cranker submits separate reimbursement work only when authorized"]
    end

    subgraph SOLANA["Solana — TSN Program and controlled accounts"]
        M["10. TSN Program verifies the Node-approved payment intent<br/>and required on-chain accounts"]
        N["11. On-chain funding state is available for later policy decisions"]
        U["16. TSN Program verifies lease, one-time commitment, route, amount, expiry, and replay"]
        V["18. TSN Program executes only the authorized reimbursement decision"]
        Y["Recipient route receives the payout; private/public receipt follows"]
    end

    A --> B --> C --> D --> F --> G --> I --> J --> P --> Q --> H --> K --> L --> M --> N --> O --> P2 --> S --> U --> Y
    Q -->|"valid proof"| T --> V --> R
    Q -->|"invalid or expired"| X["Reject, requeue, or recover according to TSN policy"] --> R
    U -. "Settlement does not write the intent vault as Paid or recoverable" .-> N

    classDef device fill:#edf3ec,stroke:#284c36,color:#17251b;
    classDef receiver fill:#f6f0df,stroke:#8b7131,color:#30240d;
    classDef verifier fill:#e9efed,stroke:#4e6e60,color:#14241c;
    classDef cranker fill:#f2eee6,stroke:#6b6254,color:#211f1a;
    classDef chain fill:#e7eee9,stroke:#1f5038,color:#10251a;
    classDef outcome fill:#fbf6e9,stroke:#8b7131,color:#30240d;
    class B,C,D device;
    class G,H,O,R receiver;
    class I,J,P,Q,P2 verifier;
    class K,L,S,T cranker;
    class M,N,U,V,Y chain;
    class A,F,X outcome;
```

The settlement transaction proves and executes the leased payout. It does not
decide that the original payment-intent vault is `Paid` or `recoverable`. Only
the TSN Program, after the Node/verifier decision and a valid proof, can execute
a separate reimbursement or recovery transition.

## Core terms

- **TSN:** the complete payment coordination and settlement network.
- **TIN:** a 10-digit Transfer Identity Number used to discover an authorized
  payment route without exchanging a normal wallet address.
- **ZK-PRU:** TSN's protected receiving and spending subsystem. It uses
  device-local encrypted derivation material, scoped child authorities, and
  policy-driven receiving/spending routes.
- **TSN SDK:** the local planner and authorization layer that creates the
  immutable payment route and commitment.
- **TSN Receiver:** the durable ingress, work queue, leases, and status-read
  service.
- **TSN Node:** the off-chain protocol verifier and processor. It verifies work,
  resolves eligible routes, prevents replay, and publishes claimable work.
- **Cranker:** an independent fee-paying executor that submits already
  authorized transactions. It does not receive user private keys or replan a
  payment.
- **TSN Program:** the Solana program that verifies authorization, leases,
  commitments, replay state, and enforced token movement.
- **TSN Escrow:** a program-controlled isolated vault that can fund a separate
  verifier-approved reimbursement transition.
- **CrankerVault:** the protocol-controlled liquidity vault from which the
  leased Cranker pays the recipient and protocol fees.

Solana validators provide transaction execution, ordering, consensus, and
finality. They are not TSN Nodes or Crankers. TSN uses Solana; it does not
replace Solana consensus.

## Supported routes

1. Native TIN-to-TIN: protected ZK-PRU source to protected ZK-PRU destination.
2. Wallet-to-TIN: public wallet source to protected TIN destination.
3. TIN-to-wallet: protected source route to a public wallet exit.
4. Wallet-to-wallet: public compatibility settlement.

The complete stage-by-stage flow is in
[TSN Transaction Explorer](./docs/tsn-transaction-explorer.md).

## Start reading

- [Protocol architecture](./docs/protocol-architecture.md)
- [Identity and TIN](./docs/identity-and-tin.md)
- [ZK-PRU](./docs/zk-pru.md)
- [Network and runtime](./docs/network-and-runtime.md)
- [Security model](./docs/security-model.md)
- [Operations and testing](./docs/operations-and-testing.md)
- [Security](./docs/SECURITY.md)
- [Metadata use and compliance](./docs/META-DATA-USE-COMPLIANCE.md)
- [TSN Private View Lit architecture](./docs/tsn-private-view-lit.md)

## Status boundaries

The TSN Node, SDK, Cranker, TSN Program, Receiver, and TSN Escrow are the
active runtime architecture. Recurring payments remain disabled. TCAP is a
separate experimental confidential-asset direction, not the current settlement
actor. Formal zero-knowledge proofs are not claimed unless implementation and
verification evidence are present.

TrustLink Pay is experimental software. Always verify program IDs, cluster,
wallet authority, and transaction evidence before using Devnet.
