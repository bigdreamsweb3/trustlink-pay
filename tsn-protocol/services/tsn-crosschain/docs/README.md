# TSN Cross-Chain

For the evidence-backed contract and token inventory, see the team
[verified-address register](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/team/cross-chain/verified-addresses.md).
Only deployed and network-checked addresses belong in that register.

This folder is the EVM and Attestcoin boundary for TSN. Solana remains the
source accounting chain for TIN debit commitments, sealed TIP state, two-phase
exit permits, Path 1/2 liability movement, one-vault custody, and GPRU-only
authorization. None of those Solana programs are changed here.

## The settlement model

Creditcoin is the first EVM settlement domain and the source chain for onward
EVM instructions. The user selects a destination network, but TSN accepts the
route only when the network, payout contract, token, and destination liquidity
are registered and proof-backed.

```text
SVM debit intent
  -> Node validates route and destination-liquidity readiness
  -> Creditcoin consumes the authorized Solana commitment
  -> Creditcoin publishes an authenticated destination instruction
  -> Attestcoin route delivers it to the selected EVM payout contract
  -> destination vault pays the recipient in stablecoin
```

The direct Creditcoin route and every onward-EVM route use a destination
stablecoin vault. Creditcoin's hub is the authenticated settlement-message
source; it is not a universal stablecoin vault for every destination. Native
CTC or the destination chain's native token pays gas, while stablecoins are the
settlement value.

## What Attestcoin verifies

The official Attestcoin readability pattern uses a source-chain contract that
emits a structured event, an off-chain proof worker, a Creditcoin ASC, and the
native Block Prover precompile at `0x0FD2`. The ASC verifies the Merkle and
continuity proofs and then executes Creditcoin business logic. See the
[official dApp infrastructure](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure).

For TSN, a destination liquidity contract emits a structured
`LiquidityAvailable` observation. `DestinationLiquidityASC.sol` verifies that
source event and records it in `DestinationLiquidityRegistry.sol`. The registry
does not custody funds; it records which routes are supported and which
liquidity observations are currently valid.

The SDK/proof worker does not create liquidity. The destination vault supplies
the stablecoins. The destination route must be supported by Attestcoin and have
an approved payout contract before TSN accepts it.

## Contracts

- `CreditcoinSettlementHub.sol`: signed Solana commitment consumption, route
  binding, replay protection, verified-liquidity reservation, and authenticated
  Attestcoin message publication.
- `contracts/creditcoin/CreditcoinDirectSettlementHub.sol`: direct Creditcoin
  destination settlement from the signed Solana commitment.
- `contracts/creditcoin/CreditcoinDirectLiquidityRegistry.sol`: on-chain direct
  Creditcoin route and local vault-capacity authority.
- `contracts/creditcoin/CreditcoinDirectSettlementExecutor.sol`: exact direct
  Creditcoin vault-release boundary.
- `contracts/creditcoin/CreditcoinDirectSettlementHub.sol`: direct Creditcoin
  destination settlement from the signed Solana commitment.
- `contracts/creditcoin/CreditcoinDirectLiquidityRegistry.sol`: on-chain direct
  Creditcoin route and local vault-capacity authority.
- `contracts/creditcoin/CreditcoinDirectSettlementExecutor.sol`: exact direct
  Creditcoin vault-release boundary.
- `DestinationLiquidityRegistry.sol`: supported EVM route registry, proof-backed
  liquidity observations, and reservation accounting for onward settlements.
- `DestinationRegistry.sol`: community route admission with verified Creditcoin
  attestation, unique voting, quorum, timelock, and emergency deactivation.
- `DestinationLiquidityASC.sol`: the TSN Attestcoin Smart Contract deployed on
  Creditcoin. It verifies a registered EVM liquidity event via the Creditcoin
  native verifier and records the observation in the registry.
- `../worker/destination-liquidity-attest-worker.ts`: uses `@gluwa/usc-sdk` to
  wait for source attestation, obtain the proof, locally verify it, and submit
  it to the liquidity ASC.
- `TSNERCLiquidityVault.sol`: one prefunded stablecoin vault for one destination
  executor; only the executor can release funds.
- `TSNSettlementExecutor.sol`: destination Inbox receiver that validates the
  Creditcoin message and releases the local vault balance.

## Deployment policy

Testing is Creditcoin CC3 Testnet/devnet and supported EVM testnets only. Localnet
is forbidden. `scripts/deploy.ts` deploys the Hub, destination-liquidity
registry, and the TSN Attestcoin Smart Contract, then writes deployment addresses to
`deployments/latest.json`. A destination route still requires explicit
`configureSettlementRoute` configuration, a deployed executor/vault, and a
verified liquidity observation before it is eligible.

```powershell
cd tsn-protocol/services/tsn-crosschain
Copy-Item .env.example .env
npm install
npm run build
npm run deploy

# Then deploy one executor and vault on each supported destination network.
# Set DESTINATION_* and CREDITCOIN_SETTLEMENT_HUB in .env first.
npm run deploy:destination
```

Do not publish addresses or transaction hashes until the command succeeds on
the intended testnet.

## Official resources

- [Creditcoin](https://creditcoin.org/)
- [Creditcoin Deploy / Attestcoin](https://creditcoin.org/Deploy)
- [Creditcoin docs](https://docs.creditcoin.org/)
- [Attestcoin Protocol](https://docs.attestcoin.org/attestcoin-protocol)
- [Attestcoin dApp infrastructure](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure)
- [Attestcoin ASC contracts](https://www.npmjs.com/package/%40gluwa/asc-contracts)
- [Attestcoin examples](https://github.com/gluwa/attestcoin-protocol-examples)

The TSN facade remains in
[`tsn-protocol/sdks/tsn-sdk/src/cross-chain.ts`](../../../sdks/tsn-sdk/src/cross-chain.ts)
and does not expose direct TCAP or TIN implementation imports.

## Guide maintenance rule

Every operational process must have a current guide before it is presented as
ready: deployment, environment setup, liquidity registration, proof-backed
route activation, Node admission, Cranker submission, destination execution,
receipt verification, rollback, and troubleshooting. When an implementation or
method changes, update the affected guide in the same change and record the
new command, required environment variables, expected outputs, and known
failure conditions. Guides must never invent addresses, transaction hashes,
liquidity, receipt events, or deployment status; only observed Devnet/Testnet
outputs may be reported as evidence.

Use the canonical TrustLink Labs terminology from
`.codex/architecture-terminology.md`: **Decentralized Settlement Protocol
(DESP)** is the architectural category, while **TSN (Transfer Settlement
Network)** is TrustLink Labs' implementation. Preserve the terms TIN, TCap,
GPRU, Receiver, TSN Nodes, Crankers, settlement routing, and privacy-aware
settlement coordination. The positioning distinction is: “DeFi decentralizes
financial services; DESP decentralizes settlement infrastructure.”
