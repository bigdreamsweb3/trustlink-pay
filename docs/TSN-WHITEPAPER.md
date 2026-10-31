# TSN Infrastructure and TSNP Protocol

## Identity-aware settlement infrastructure and private balance accounting

### Abstract

TSN (Transfer Settlement Network) is TrustLink Labs' settlement infrastructure. TSNP (Transfer Settlement Network Protocol) is the on-chain settlement protocol program within that infrastructure. TIP manages transfer identities, GPRU provides guarded privacy routing and proof verification, TCAP governs confidential assets and reserve liabilities, and DIP defines deposit ingress. Circle's CCTP is a separate cross-chain transfer protocol used by supported integrations. The current TSNP/TCAP credit ABI carries a GPRU hidden-head Groth16 proof, while the Node settlement path fails closed because its prover and witness source are not configured.

The current source accounting domain is Solana. The repository also contains the Creditcoin-first EVM settlement boundary, Attestcoin route verification, destination vault/executor contracts, and deployment helpers. These source components are not the same as a live production deployment: testnet deployment and real transaction evidence are required before claiming the cross-chain path is operational.

## 1. Protocol model

A payment is a state transition authorized by the sender, not an instruction assembled by a relay. The sender signs the payment details and reserve-funding authorization. Receiver accepts and stores ingress, while Node independently resolves the recipient TIN through TIP, validates the route and asset, and constructs recipient transition data. The sender device does not resolve the recipient's TIP state or create the recipient's GPRU transition.

The proof-shaped credit route in source is:

```text
Sender authorization and funding
    → Receiver ingress acceptance
    → Node TIP resolution and verification
    → Groth16 proof generation (not configured; fails closed)
    → Cranker submission of authorized work
    → TSNP passes proof to TCAP
    → GPRU verifies hidden-head transition and Memo binding
    → TCAP atomically advances shared root and reserve liabilities
```

TIP is the Transfer Identity Protocol; TIN is one 10-digit identity within
TIP. GPRU (Guarded Privacy Routing Unit) is a standalone program with one-time
ElGamal DNA-key verification and a Groth16 hidden-head verifier. The TSNP/TCAP
credit ABI carries its proof. TCAP (Transfer Confidential Asset Protocol)
governs approved assets and reserves, and updates one global commitment root
atomically with reserve liabilities. Node currently has no configured proof
service, so the path is not operational.

## 2. Participants and authority

The owner device holds signing and private recovery material. Receiver accepts and stores authenticated ingress. Node verifies the signed request and resolves TIP. Mother and TSN authorize settlement within their current program contract. Cranker submits the exact authorized transaction and cannot alter its bound fields. The credit ABI carries a proof that GPRU verifies before TCAP advances the shared root. Node currently refuses to issue the settlement authorization because the prover and current hidden-head witness source are not configured.

No coordination role grants a spending key or unilateral authority to redirect value.

## 2A. Community route governance

TSN treats network expansion as a settlement-infrastructure decision, not as a
simple chain-list update. A proposed destination changes the asset contract,
executor, liquidity source, finality assumptions, gas model, message route,
monitoring requirements, and failure recovery procedure. The community can
propose, review, and vote on those changes through an evidence-based route
admission process.

The intended lifecycle is:

```text
route proposal
    → deployment and liquidity evidence
    → technical and security review
    → public discussion and vote
    → timelocked registry activation
    → Node live-liquidity gate
    → authorized settlement
```

Community approval does not create value, override a sender-signed intent,
replace Attestcoin proof verification, or give a Cranker payout authority. The
Node still validates the route and exact authorization, the Cranker submits
only the leased transaction, and the destination vault remains the source of
stablecoin liquidity. Verified source and settlement signatures identify who
submitted a proposal or vote; they do not by themselves prove that a contract,
token, or liquidity provider is safe.

Before the on-chain registry is deployed, the team must define quorum, voter
eligibility, duplicate-vote prevention, sybil resistance, proposal expiry,
timelocks, emergency pause, conflict disclosure, and route retirement. The
current repository documents this governance design but does not claim that a
community registry or live route vote is deployed.

## Immutable On-Chain Destination Registry (Community-Governed)

`DestinationRegistry.sol` is the proposed append-only admission layer for
future settlement routes. It does not replace
`DestinationLiquidityRegistry.sol`: the governance registry records a route
proposal and its community decision, while the operational registry records
proof-backed liquidity observations and reservations used by the Creditcoin
Settlement Hub.

A route proposal binds a destination chain, destination network, executor,
stablecoin, and a digest of the Solana evidence validated by the TSN Node. A
configured Creditcoin route attestor signs the complete proposal using EIP-712.
Community voters can vote once per route; quorum and a timelock are required
before activation. An emergency guardian can deactivate a route without being
able to rewrite its immutable route fields.

The registry is a governance control, not a liquidity source or a payout
contract. The Attestcoin ASC continues to verify destination liquidity, the
Creditcoin Hub consumes the authorized commitment and publishes the
authenticated message, and the destination executor releases stablecoins from
its prefunded vault. The Node verifies the original Solana signature and
commitment before producing the evidence digest; the registry does not claim
that Solidity natively verifies a Solana signature.

This contract and governance design are included as integration code and
technical documentation. `DestinationRegistry` is deployed on CC3 Testnet at
[`0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0`](https://creditcoin-testnet.blockscout.com/address/0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0)
under transaction
[`0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52`](https://creditcoin-testnet.blockscout.com/tx/0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52).
The registry is therefore live as code, but no route is live until proposal,
voting, activation, liquidity, and payout receipts are observed.

## 3A. Payment routes

The repository contains the following route categories. The wallet-to-TIN credit ABI carries the hidden-head proof, but its circuit and prover path are not operational. Debit and exit are not established as enabled:

| Route | Settlement behavior |
| --- | --- |
| Wallet deposit → wallet exit | Public wallet transfer boundary; verify the exact program route and deployment. |
| Wallet deposit → TIN credit | Proof-shaped TSNP/TCAP source path; Node fails closed until Groth16 proving is configured. |
| TIN debit → TIN credit | Not established as operational; requires verified debit, credit, and conservation proofs. |
| TIN debit → wallet exit | Not established as operational; requires verified affordability, destination binding, and reserve solvency. |
| Solana → Creditcoin or another supported EVM network | Cross-chain source/deployment status is separate; see its own testnet evidence before treating it as operational. |

The cross-chain route extends the settlement boundary; it does not replace the native Solana paths.

## 3. Solana credit source path

The TSN source instruction `register_tcap_credit_authorization_v2` validates
the Mother authorization and passes a hidden-head Groth16 proof to TCAP
`credit_gpru_memo_v1`. TCAP checks the approved asset, authorization signer,
validity window, current root and sequence, pending liability, and reserve
solvency, then invokes GPRU `verify_hidden_head_transition_v1`. A valid proof
allows TCAP to advance the shared root and reserve liabilities atomically. The
encrypted Memo remains transaction instruction data.

The proof is intended to establish that the private per-TIN/asset head is
current and insert a nullifier while the shared root advances. This path does
not create a per-TIN TCAP PDA. The Node returns
`GPRU_GROTH16_PROVER_NOT_CONFIGURED`, so it does not currently produce an
authorization for this proof path.

## 4. State and commitments

The current credit instruction uses a shared `TcapCommitmentRootStateV1`
account. It checks and advances the global root/sequence and emits an opaque
transition digest. It does not create or update the legacy `TCapTinTipV1`
account. The Memo commitment binds instruction bytes; it does not prove that
those bytes represent a valid encrypted balance by itself.

The updated Circom source defines nine public inputs: old/new global roots,
Memo and action commitments, nullifier, TIP route root, successor portfolio
root, and selected-token successor Pedersen balance point X/Y. Private
witnesses hold route/head membership, sequence, nested token-map paths, and
balance openings. The balance points are commitments, not ciphertexts; the
Memo body carries an owner-encrypted action record used to recover amounts.
The updated circuit has not been recompiled or reviewed.
No trusted setup artifacts, validated key converter, prover service, witness
provider, initialized verifier, or end-to-end proof evidence is established.
The ABI exposes action kind, token ID, and amount. The shared root is a common
account referenced by every update, so it exposes global sequencing and
protocol-level linkage.

## 5. Security invariants and limits

The source checks authorization, asset, expiry, proof, Memo binding, and
global-root sequence. Receiver acceptance, Node verification, Cranker
submission, funding confirmation, and TCAP transition confirmation are
distinct lifecycle events. A confirmed funding transaction does not prove
the later TCAP transition succeeded.

Confidential debit, exit, and TIN-to-TIN conservation require compiled and
reviewed proofs of balance sufficiency, exact subtraction, range,
destination binding, and reserve solvency, plus connected service paths.
These capabilities are not established as operational. The shared root is
publicly linkable across all transactions using that instruction, and wallet
funding/exits expose their normal public transaction metadata.

## 6. Settlement domains and attestations

A settlement domain is a blockchain-specific execution environment with its own assets, finality and transaction rules. TSN keeps identity and intent semantics stable while a domain adapter maps a verified authorization into that environment.

Attestation is TSN's cross-domain connection mechanism. An attestation binds source and destination domains, settlement identifier, assets, amount, accepted intent, recipient, sequence or nonce, validity window and the settlement commitment. The destination verifies the cryptographic source fact before executing its own transaction. A transaction hash, API response or operator statement is not sufficient.

## 7. Creditcoin-first EVM domain

The first additional settlement domain is Creditcoin. The source repository contains the Creditcoin route, liquidity, executor, and message boundaries, but deployment and real testnet evidence are still required before calling the path live:

```text
Solana debit intent
    → Node validation and destination liquidity preflight
    → Solana debit commitment
    → Creditcoin Hub authorization
    → Attestcoin authenticated message
    → Creditcoin or selected EVM executor
    → prefunded stablecoin vault → recipient
```

The destination must reject a message whose domain, asset, amount, recipient, settlement identifier, finality, route, or validity window does not match the source authorization. This adapter does not replace TSN authorization or TCAP accounting. Creditcoin is the first funded EVM settlement domain and the source for onward supported-EVM payout messages.

## 8. Liquidity and value model

A message is not a payment asset. The value path is:

    Liquidity provider or treasury
        → prefunded stablecoin vault on the payout network
        → registered destination executor
        → recipient wallet

Creditcoin CTC pays Creditcoin gas. The destination network's native token pays destination gas. Stablecoins are the payout asset. Attestcoin proof and message infrastructure verifies and connects a route; it does not create liquidity. A route is not eligible without a configured executor, token, destination network, and current liquidity observation.

The direct Creditcoin route and an onward Base/Ethereum-style route use the same principle: the network that pays the recipient must have the stablecoin available in its own configured vault. The Hub reserves verified route capacity before publishing the payout message.

## 9. Contract and software boundaries

| Component | Responsibility | Value custody |
| --- | --- | --- |
| CreditcoinSettlementHub.sol | Verify authorization, reject replay, reserve route capacity, publish payout message | No destination payout balance |
| DestinationLiquidityASC.sol | Verify source liquidity evidence through Attestcoin readability | None |
| DestinationLiquidityRegistry.sol | Store route configuration, observations, and reservations | None |
| TSNSettlementExecutor.sol | Validate authenticated destination message and invoke local payout | Uses vault boundary |
| TSNERCLiquidityVault.sol | Hold and release destination stablecoins | Yes, destination liquidity |
| TinExitAttestedASC.sol | Record a proved exit receipt | No payout liquidity |
| TSN Node | Orchestrate, validate, authorize, and track | No user payout custody |
| Cranker | Submit exact authorized transactions and pay gas | No user payout custody |

Solana-native programs remain outside the cross-chain layer. The cross-chain layer must not rewrite sealed TIP, the two-phase exit commitment, Path 1/2 wiring, one-vault behavior, liability PDAs, or GPRU-only authorization.

## 10. Threat model

Security depends on source and destination consensus, cryptographic signatures, attestation verification, TSN authorization rules and the correctness of each domain adapter. Liveness depends on Receiver, Node, Cranker and destination liquidity. A failure may delay or revert a transition; it must not create value, bypass a nullifier, or redirect an authorized payment.

The threat model includes compromised or unavailable Receiver, Node, Cranker, relayer, liquidity provider, source RPC, and destination RPC. Availability failure may delay settlement; it must not authorize a new value transfer, bypass a nullifier, redirect a recipient, or convert an invalid message into a payout.

The current Creditcoin Hub authorization proves a Node-signed commitment payload on Creditcoin. It does not claim that Creditcoin independently verifies a Solana transaction through Block Prover. Solana source facts remain validated by the Node and existing Solana program boundaries until a supported cryptographic source-proof path is deployed.

No raw TIN, private balance, device key, plaintext receiving root, or snapshot secret is written to Creditcoin or another secondary EVM network.

ZK-PRU was an earlier experiment and is retired. It is not part of the receiving, balance or spending architecture described here.

## 11. Implementation and deployment status

The repository contains the cross-chain contracts, Node route validation, TSN-only SDK façade, Attestcoin integration helpers, and testnet deployment scripts. Source compilation is not the same as a live deployment.

Before claiming the happy path is live, the team must:

1. configure a funded Creditcoin CC3 Testnet EVM signer;
2. provide the real CC3 Attestcoin token and protocol route addresses;
3. deploy the Creditcoin contracts on CC3 Testnet;
4. configure a supported destination route and prefund its stablecoin vault;
5. submit a real Solana debit transaction;
6. submit the resulting authorized Creditcoin settlement transaction; and
7. record real explorer links and emitted events.

No contract address, liquidity balance, receipt event, or transaction hash should be published until it is observed on the relevant testnet explorer.

## 12. Scope and non-goals

This paper covers identity-aware settlement coordination, Solana source accounting, Creditcoin-first EVM settlement, Attestcoin liquidity verification and message delivery, destination stablecoin liquidity, and the Node/Cranker execution boundary.

It does not claim that a proof or message is itself a stablecoin, that Creditcoin pays every destination from one universal vault, that Solana is currently supported by Creditcoin's native Block Prover, that a Cranker generates proofs or makes payout decisions, or that source-chain verification is live before testnet deployment evidence exists.

## References

- [Creditcoin Attestcoin Protocol](https://docs.creditcoin.org/attestcoin-protocol)
- [Creditcoin Attestation](https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/attestation)
- [Creditcoin Testnet](https://docs.creditcoin.org/environments/testnet)
- [Solana Documentation](https://solana.com/docs)
- [Creditcoin](https://creditcoin.org/)
- [Creditcoin Deploy / Attestcoin overview](https://creditcoin.org/Deploy)
- [Creditcoin CC3 Testnet RPC](https://rpc.cc3-testnet.creditcoin.network/)
- [Creditcoin CC3 Testnet explorer](https://creditcoin3-testnet.subscan.io/)
- [Attestcoin Protocol](https://docs.attestcoin.org/attestcoin-protocol)
- [Attestcoin architecture](https://docs.attestcoin.org/attestcoin-protocol/architecture)
- [Attestcoin dApp builder infrastructure](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure)
- [Attestcoin USC SDK](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk)
- [TSN-Protocol repository](https://github.com/Trustlink-Labs/TSN-Protocol)
