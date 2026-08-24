# TrustLink Pay / TSN

TrustLink Labs is building **TSN (Transfer Settlement Network)**: a
verification-first payment coordination layer on Solana. **TCAP (Transfer
Confidential Asset Protocol)** provides commitment-backed private balance
accounting for the live credit path.

This repository is written for engineers, operators and reviewers who need to
separate implemented behavior from future interfaces and historical research.
The canonical live route is:

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

## Canonical names

| Name | Meaning | Boundary |
| --- | --- | --- |
| **TSN** | Transfer Settlement Network | Settlement, authorization, leases and epoch liability coordination |
| **TIN** | Transfer Identity Number | 10-digit identity and route-discovery handle; not a key or balance |
| **TIP** | Transfer Identity Protocol / Transfer Identity stack | Issues and resolves TIN relationships |
| **GPRU** | Guard Privacy Routing Unit | Non-custodial authorization and routing; never holds funds |
| **TCAP** | Transfer Confidential Asset Protocol | Tip transitions and encrypted private balance snapshots |

## What is implemented

- TSN Receiver stores redacted ingress work and lease state.
- TSN Node verifies signed intent fields, policy, commitments, sequence and
  expiry.
- Mother and TSN authorize a one-time `ConfidentialSettlement` transition.
- The TSN CPI wrapper passes the complete authorization ABI to TCAP.
- TCAP verifies the receipt, tip binding, previous/new commitments, sequence,
  token policy, GPRU scope, validity window and nullifier before advancing a
  tip.
- The owner device persists and decrypts the matching encrypted snapshot.
- Cranker submits exact authorized work and cannot rewrite the amount,
  recipient binding, commitment, sequence, policy, token or nullifier.

Live confidential debits and exits remain proof-gated and disabled. A GPRU
signature, hash-only payload or placeholder proof cannot spend, exit or drain
liquidity. ZK-PRU is retired historical material and is not part of the active
receiving, balance or spending architecture.

## Evidence standard

TrustLink documentation distinguishes four evidence levels:

1. **Code evidence:** a checked-in instruction, account constraint or test.
2. **Build evidence:** a successful program build against the stated toolchain.
3. **Devnet evidence:** a transaction signature and post-transaction account
   inspection on Devnet.
4. **Production readiness:** independent review, operational controls,
   proof-system audit and governance approval.

Devnet success is not a production certification. Reviewers should verify the
program ID, cluster, upgrade authority, deployment slot and transaction logs
before relying on a result.

## Program IDs

| Program | Devnet address |
| --- | --- |
| TSN / `trustlink_escrow` | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |
| TCAP / `tcap` | `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` |
| TIP / Transfer Identity / TIN registrar | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

## Read the system in order

1. [Current architecture](docs/CURRENT-ARCHITECTURE.md)
2. [TCAP values explained](docs/TCAP-VALUES-EXPLAINED.md)
3. [Protocol architecture](docs/protocol-architecture.md)
4. [Receiver, Node and Cranker verification](docs/tsn-receiver-verification-settlement.md)
5. [Security model](docs/security-model.md)
6. [Devnet build and deploy](docs/DEVNET-BUILD-DEPLOY.md)
7. [Devnet credit smoke procedure](docs/tcap-devnet-credit-smoke.md)
8. [ZK-PRU retirement note](docs/ZK-PRU-RETIRED.md)

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | TrustLink Pay application |
| `backend/` | API and application services |
| `transfer-identity-protocol/` | TIP/TIN registrar and SDK |
| `tsn-protocol/` | TSN programs, SDK, Receiver/Node/Cranker tooling |
| `tcap-protocol/` | TCAP program, SDK and credit test tooling |
| `protocol-tests/` | Devnet-only protocol scenarios |
| `docs/` | Canonical architecture, security and operator documentation |

## Devnet policy

Program-dependent tests are Devnet-only. There is no supported localnet path.
After any on-chain program change, build the SBF artifact, deploy the updated
program to Devnet, verify the deployment slot, and only then run simulation or
live transactions. See [DEVNET-BUILD-DEPLOY](docs/DEVNET-BUILD-DEPLOY.md).

## TrustLink Labs resources

- [TrustLink Pay application](https://trustlink-pay.vercel.app/)
- [TSN Protocol research blog](https://tsn-protocol.blogspot.com/)
- [TrustLink Labs GitHub organization](https://github.com/Trustlink-Labs)
- [Project journey](docs/PROJECT-JOURNEY%20(1).md)
- [Security policy](docs/SECURITY.md)

## Maintainer

TrustLink Pay is created and led by **Agbaka Matthew Daniel U. E. (Big Dreams
Web3)**.

## License

[MIT](LICENSE)
