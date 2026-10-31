# Creditcoin navigation and deployment experience

This guide explains how the team should inspect Creditcoin, prepare a TSN
route, and interpret deployment evidence. Creditcoin is the leader chain for
the cross-chain layer, while TSN remains the complete Transfer Settlement
Network infrastructure. TSNP is its on-chain settlement protocol program,
whose source accounting and native Solana boundaries must
not be silently replaced by an EVM contract.

## The two Creditcoin views

Creditcoin is EVM-compatible and also exposes Substrate infrastructure. Use
the explorers for different questions:

| View                                                                        | Use it for                                                                       | What it shows                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Blockscout EVM explorer](https://creditcoin-testnet.blockscout.com/)       | Solidity deployments, EVM calls, contract addresses, gas, logs, and verification | EVM accounts, contract creation, calldata, receipts, and events              |
| [Subscan explorer](https://creditcoin3-testnet.subscan.io/)                 | Runtime-level funding and extrinsics                                             | Substrate extrinsics, blocks, and the underlying Creditcoin runtime activity |
| [Creditcoin testnet docs](https://docs.creditcoin.org/environments/testnet) | Network configuration                                                            | RPC URLs, explorers, EVM chain ID, and Attestcoin testnet tools              |
| [Attestcoin dashboard](https://dashboard.cc3-testnet.creditcoin.network/)   | Attestcoin environment and dApp tooling                                          | ASC-related testnet configuration and developer access                       |

An EVM deployment can therefore appear in Blockscout as a contract creation
and in Subscan as Creditcoin runtime activity. That does not make it a
Solana transaction. Solana signatures and addresses use Solana's own account
and encoding model and must be checked through Solana RPC or a Solana
explorer.

## Confirm the network before spending gas

The current CC3 Testnet values are:

- HTTPS RPC: `https://rpc.cc3-testnet.creditcoin.network`
- WSS RPC: `wss://rpc.cc3-testnet.creditcoin.network`
- EVM chain ID: `102031`
- EVM explorer: `https://creditcoin-testnet.blockscout.com/`
- Substrate explorer: `https://creditcoin3-testnet.subscan.io/`
- Block Prover precompile: `0x0FD2`
- Official proof builder: `https://prover.cc3-testnet.creditcoin.network/`

The official testnet documentation lists Ethereum Sepolia as Attestcoin
chain key `1` and Ethereum Mainnet as chain key `3`. A chain key is not the
same thing as an EVM chain ID. Record both whenever a route or proof is
configured. [Creditcoin testnet environment](https://docs.creditcoin.org/environments/testnet)

Before deployment, query the RPC for its chain ID and stop if it is not
`102031`. The deployment code must also reject localhost and localnet. This
prevents a successful local experiment from being mistaken for CC3 evidence.

## Funding experience

The Creditcoin faucet has separate instructions for Substrate and EVM
addresses. For the Solidity deployment, request CTC using the EVM address in
Creditcoin Discord's `token-faucet` channel. The faucet proves native CTC gas
funding only; it does not provide Attestcoin message-fee assets, destination
stablecoins, or route liquidity. [Official faucet guide](https://docs.creditcoin.org/wallets/using-testnet-faucet)

After funding, verify the balance and transaction in Blockscout. Use Subscan
to inspect the corresponding runtime extrinsic when the faucet reports a
Substrate-side transaction. Treat the two explorers as complementary evidence,
not as two separate deposits.

### Obtaining CC3 test stablecoins

The official Creditcoin faucet documentation covers CTC EVM and CTC Substrate
funding. It does not document a faucet command for `USDC-T` or `USDT-T`.
Blockscout lists both test ERC-20 contracts, but explorer visibility is not
proof that a public mint or faucet is available.

The safe acquisition order is:

1. Ask the Creditcoin testnet operators or community for a transfer of the
   exact `USDC-T` or `USDT-T` contract listed in the
   [verified address register](./verified-addresses.md).
2. Confirm the incoming ERC-20 transfer on the CC3 Blockscout token page and
   query the deployer balance before attempting route funding.
3. If no operator or holder can transfer the tokens, deploy a TSN-owned test
   ERC-20 with an explicit name such as `TSN USDC Test` or `TSN USDT Test`.
   Do not call that token official USDC or USDT, and record its deployment
   address, mint authority, decimals, and transaction hash before registering
   it.

The CC3 Discord faucet is for CTC gas, not stablecoin liquidity. The official
[faucet guide](https://docs.creditcoin.org/wallets/using-testnet-faucet) and
[Attestcoin deployment page](https://creditcoin.org/Deploy) should be used for
CTC funding only. A route cannot be activated until the selected token is in
the payout vault and `observeLocalLiquidity` records that balance.

## What the current deployment needs

Do not copy an old `.env` example without checking the current deployment
script. The Creditcoin core deployment currently validates only the CC3 RPC,
the local deployer key, the authorization signer, and the Attestcoin fee-token
address before submitting a transaction. Destination Inbox, destination
stablecoin, vault, and executor values belong to the separate
`deploy:destination` operation.

The current TSN cross-chain environment is organized into these categories:

| Input                        | Meaning                                                    | Evidence or source                                                 |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| CC3 RPC                      | Network endpoint                                           | Official testnet environment                                       |
| Local deployer key reference | Signs EVM deployment transactions                          | Private operator-controlled store; never commit or publish the key |
| Authorization signer         | Signs TSN EIP-712 payout authorizations                    | Node-controlled signer policy; use a separate production signer    |
| Attestcoin fee token         | ERC-20 used for message-fee funding in the Hub             | Must be confirmed for the selected CC3 environment                 |
| Registry and route data      | Destination network, executor, Outbox, token, and capacity | Added after destination deployment; never guessed                  |
| Destination stablecoin       | Asset held by the destination liquidity vault              | Supplied to `deploy:destination` and funded on the payout network  |

### Observed authorization-signer check

A read-only CC3 RPC check was run against the deployed
`CreditcoinSettlementHub` at `0x29151Ff9266b8Fb15D86D22d73f084F59293438c`. The
Hub reports the same public authorization-signer address as the operator's
CC3 Testnet key stored outside the repository, and its route registry reports
`0x764Ac587b1fC0feBEE86012cF7A2489b575EE5D1`.

This confirms signer alignment for the EIP-712 boundary. It does not prove a
settlement: a real Solana debit evidence record, Node-issued authorization,
successful Creditcoin transaction, and `SettlementMessagePublished` event are
still required.

The official Attestcoin bridge example currently lists
`0x914Cf96BF28b7b4921db27b264ecEd71aC91134E` as `BridgeTestToken`. A live
Blockscout lookup confirms that it is a verified contract named
`BridgeTestToken`. This is valid evidence that the token exists on CC3, but it
is not enough to prove that our Hub should use it for every route or that it is
the production Attestcoin fee asset. Confirm its role against the selected
Attestcoin deployment before funding approvals. [Official example environment](https://raw.githubusercontent.com/gluwa/attestcoin-protocol-examples/main/bridge/.env.example)

## What Attestcoin does and does not provide

Attestcoin supplies a cryptographic cross-chain data and messaging boundary.
For readability, a Creditcoin ASC verifies supported source-chain data through
the native prover. For writability, a Creditcoin contract publishes a message
through an Outbox; attestors validate it and a destination Inbox delivers it
to the destination executor. The destination vault still requires real
stablecoin liquidity. Attestcoin does not mint our payout liquidity or turn
CTC gas funding into stablecoin reserves. [Attestcoin Protocol](https://docs.attestcoin.org/)

For a selected EVM destination, the route must therefore identify the
destination chain key, destination Inbox, executor, stablecoin, vault, and
liquidity capacity. A Cranker submits the authorized transaction, while the
Receiver and TSN Node retain orchestration, validation, and policy duties.

## SepoliaAnchor decision

`SepoliaAnchor.sol` is not required for the normal TSN Solana-to-Creditcoin or
Creditcoin-to-destination payout flow. It should not be deployed, funded, or
presented as part of the ordinary settlement path.

The current `TinExitAttestedASC.sol` is a separate readability example that
expects an EVM source event and Ethereum Sepolia chain key `1`. It cannot prove
a Solana event merely because the event contains a Solana commitment. Until a
supported source design exists for that receipt, do not require
`TIN_EXIT_SOURCE_ANCHOR_ADDRESS` for the normal Solana-origin payout. Keep the
receipt experiment clearly separate from the value-settlement route.

## On-chain Destination Registry

`DestinationRegistry.sol` is the governance admission layer for future
destination routes. It is separate from `DestinationLiquidityRegistry.sol`:

- `DestinationRegistry` records community route proposals, unique votes,
  timelocked activation, and emergency deactivation.
- `DestinationLiquidityRegistry` records operational route configuration,
  proof-backed liquidity observations, and settlement reservations used by the
  Creditcoin Hub.
- `DestinationLiquidityASC` uses Attestcoin readability to verify destination
  liquidity evidence before the operational route is admitted.

The registry requires a Creditcoin EIP-712 signature from the configured route
attestor over the destination route and a non-zero Solana evidence digest. The
Node validates the underlying Solana signature and source commitment before
producing that digest; Solidity cannot treat a plain bytes32 value as a native
Solana signature proof. Community voters can vote once per route, quorum is
explicit, and activation is delayed after the voting window. The emergency
guardian can deactivate a route but cannot change its executor, token, chain,
or evidence fields.

This is meaningful Attestcoin integration when combined with the existing ASC
and Hub: Attestcoin verifies destination liquidity and publishes the
authenticated settlement message, while the registry governs whether that
verified route is eligible for TSN admission. The registry does not custody
stablecoins, move value, or replace the Node, Cranker, Hub, Inbox, executor, or
vault.

### Registry authority boundary

The Node keeps a mirror of route metadata for fast preflight and user-facing
routing. That mirror is not an authority source. The Creditcoin
`DestinationLiquidityRegistry` is the secure on-chain route boundary, and the
`CreditcoinSettlementHub` checks it again inside the settlement transaction.
The Hub rejects a signed Node authorization when the route is missing, disabled,
mismatched, missing an Outbox or executor, or lacks a current proof-backed
liquidity observation. A Node signature cannot override those on-chain checks.

The operational rule is: **Node mirror for preflight; Creditcoin registry and
Hub for final enforcement.** An unsupported route cannot settle on Creditcoin
even when the Node has produced an otherwise valid authorization.

### Refreshing the current Creditcoin liquidity observation

The current `creditcoin-testnet` prototype lane is a direct Creditcoin lane.
Its local registry refresh is different from the proof-backed refresh used for
an onward EVM destination. First fund the configured payout vault with the
registered settlement token. Then the registry owner submits
`observeLocalLiquidity(routeId, validUntil, nonce)`. The contract reads the
actual ERC-20 balance of that vault, records the amount and expiry on-chain,
and emits `LiquidityObserved`. The next nonce must be greater than the prior
observation nonce.

This direct refresh does not mint liquidity and does not use CTC as payout
value; CTC pays gas while the registered stablecoin funds the vault. After the
transaction is mined, restart the Node only if its process needs to reload
configuration, then query `/settlement-networks`. The Node should expose the
route only while the recorded `validUntil` is current and the balance covers
the requested amount.

For a future Base or other supported EVM destination, use the proof-backed
path instead: the destination vault emits `LiquidityAvailable`, the
Attestcoin SDK waits for source-block attestation and obtains the proof, and
`DestinationLiquidityASC.execute(...)` verifies the proof and records the
observation in `DestinationLiquidityRegistry`. Do not call the proof-backed
registry's restricted `recordVerifiedLiquidity` directly from an operator
wallet.

### Configure the operational route

After the destination vault and executor are deployed and funded, configure the
complete route on Creditcoin with:

```text
cd tsn-protocol/services/tsn-crosschain
npm run configure:route
```

The command requires the registry address, route ID, source chain key and
emitter, destination vault and token, destination chain ID, executor, and
Attestcoin Outbox in the ignored environment. It rejects placeholders, rejects
localnet RPCs, requires CC3 chain ID `102031`, waits for the mined receipt, and
then calls `isSettlementRouteActive` against the live registry. The printed
transaction hash and route fields are the evidence for the route-configuration
run. A successful local command is not sufficient evidence until the explorer
receipt and matching on-chain route state are recorded.

The required environment names are mirrored in
`tsn-protocol/services/tsn-crosschain/.env.example`. Do not fill them with guessed
addresses: obtain each address from the verified destination deployment and
Attestcoin environment, then record the explorer evidence in this guide.

### Attestcoin writability capability gate

The official Attestcoin deployment page documents deploying Smart Contracts on
Creditcoin to read and verify data from supported source chains. The official
Attestcoin examples currently describe readability tutorials and identify
writability examples as not yet generally released. The official message
relayer repository documents the Outbox-to-Inbox design, but a route still
requires real deployed Outbox, Inbox, attestor, and destination contract
addresses for the selected environment.

**Observed consequence:** do not invent `ATTESTCOIN_OUTBOX_ADDRESS`, a
destination Inbox, or a writability transaction. Until CC3 supplies verified
addresses and runtime support, TSN can demonstrate the real Creditcoin
Attestcoin readability path—proof-backed destination-liquidity verification
and registry admission—but must not claim an official cross-chain payout
message or destination payout transaction.

References: [Creditcoin Attestcoin deployment overview](https://creditcoin.org/Deploy),
[official Attestcoin examples](https://github.com/gluwa/attestcoin-protocol-examples),
and the [official message relayer](https://github.com/gluwa/usc-message-relayer).

The registry contract is now deployed on CC3 Testnet:

- Address: [`0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0`](https://creditcoin-testnet.blockscout.com/address/0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0)
- Deployment receipt: [`0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52`](https://creditcoin-testnet.blockscout.com/tx/0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52)
- Chain ID: `102031`
- Quorum: `2`
- Voting period: `604800` seconds
- Activation delay: `86400` seconds

The receipt returned status `0x1` at block `0x538df6`. No route proposal,
community vote, activation, liquidity observation, or payout has been recorded
yet, so the registry is deployed but no destination route is live.

## Observed CC3 deployment milestone

The first real CC3 run produced two successful contract-creation transactions
and one successful registry configuration call. Blockscout showed the two
created contracts and the follow-up call at consecutive blocks. This proves
that the funded EVM signer, RPC, Solidity compiler output, and basic gas path
work on CC3.

The observed result was smaller than the full architecture: the run did not
prove that the Hub, destination vault, destination executor, Inbox/Outbox
route, stablecoin liquidity, or a Solana debit-to-payout transaction exists.
The correct status is therefore **partial Creditcoin deployment evidence**,
not “cross-chain happy path ready.”

The successful core deployment produced the following evidence on CC3. The
RPC receipts reported status `0x1` for all five transactions:

| Operation                 | Contract or call                             | Transaction                                                                                                                |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Registry creation         | `0x87710a05770c84Dd706F2CfdC9862A44CC159973` | [receipt](https://creditcoin-testnet.blockscout.com/tx/0x1e2ad1f1054d8e364f0fd7650e3eb594a8d4ed69e3963541d0f43ca09aaef984) |
| Liquidity ASC creation    | `0x279668eaf51cC3e39F6AeDE46644BAaC689B3EC3` | [receipt](https://creditcoin-testnet.blockscout.com/tx/0x8f7ce08b8b55d1d8eb370615baf6c3713c5a2403c317d1235e122c6024a0de76) |
| Registry → liquidity ASC  | configuration call                           | [receipt](https://creditcoin-testnet.blockscout.com/tx/0x683053620123a8651a3bbd05da0889cf8c2658878667e3bebc9cde9daff03bd3) |
| Settlement Hub creation   | `0x0EF8B97927eE1f7B3F6171E9308E1554886EEC74` | [receipt](https://creditcoin-testnet.blockscout.com/tx/0x06522b8aea73acee6b85d6bebdc3dc3991e66b299fe64f173dcde38179137c8f) |
| Registry → Settlement Hub | configuration call                           | [receipt](https://creditcoin-testnet.blockscout.com/tx/0x715ca99000558967d4f2d87b33578e3f24f3a7e4034c7ae70a0a97810fff332e) |

The first deployment record used one malformed-looking final hash because the
provider response exposed an extra character through `TransactionResponse.hash`.
The mined receipt returned the valid 32-byte hash shown above. The deployment
script now records mined receipt hashes instead of trusting the pre-receipt
transaction object. This is an observed Creditcoin RPC integration detail and
is why explorer or RPC receipt verification is part of the runbook.

### Latest script verification

The TypeScript build passed with `npm run build`. The CC3 deployment command
then stopped before the first transaction with:

```text
Invalid EVM address in CREDITCOIN_ATTEST_TOKEN
```

This is the intended fail-fast behavior while the environment still contains a
placeholder. No new deployment transaction or address was produced by that
attempt. The command
`npm run deploy:devnet -- --test --receipt --network creditcoin-testnet` is
not a real integration test: it invokes the deployment script, and npm did not
forward the flags as a test harness. A real test must call the Node/Cranker
integration path after the Creditcoin route and destination liquidity are
configured.

The repository's `test:real-integration` command is an evidence verifier. It
requires `SOLANA_INTENT_TX_SIGNATURE` and
`CREDITCOIN_SETTLEMENT_TX_HASH`, checks the Solana confirmation, verifies the
CC3 deployment bytecode, checks the Node route gate, and parses the
`SettlementMessagePublished` event from the Creditcoin Hub transaction. It
does not submit a transaction; the Node and a configured Cranker must complete
the authorized work first.

The first verifier run confirmed bytecode for the deployed Creditcoin registry,
liquidity ASC, and Settlement Hub, then stopped at the Node route gate because
no destination route was configured. It did not request a Solana signature or
Creditcoin settlement hash after that gate failed. This is the correct
observed result: deployment evidence exists, but route activation and payout
evidence do not.

### 2026-09-12 route-gate verification

**Intent:** Confirm that the real-integration harness refuses to proceed until
the Node has a configured, verified destination route.

**Environment:** CC3 Testnet, chain ID `102031`, RPC
`https://rpc.cc3-testnet.creditcoin.network`. The TypeScript build completed
successfully. No secret or private filesystem path is recorded here.

**Command:**

```text
npm run build
npm run test:real-integration
```

**Expected behavior:** The build passes, deployed Creditcoin bytecode is
verified, and the harness reaches the Node route gate. It should continue only
when a destination route and liquidity observation are configured.

**Observed result:** The build passed and all three deployed Creditcoin
contracts returned bytecode. The verifier stopped with:

```text
Checking Node route gate at http://127.0.0.1:8000/settlement-networks ...
Node route gate returned no configured destination routes
```

**Actual difference:** No destination route is currently exposed by the Node,
so no Solana intent signature, Creditcoin settlement transaction, or payout
transaction was requested. This is a deliberate safety stop, not a contract
failure.

**Evidence:** The verifier confirmed the deployed registry, liquidity ASC, and
Settlement Hub bytecode before the route gate stopped execution. No new
transaction was submitted by this run.

**Next action:** Provide and configure one real destination route with its
chain ID, RPC, stablecoin contract, payout executor, route ID, destination
Inbox/Outbox configuration, and prefunded stablecoin vault. Then record the
liquidity observation before rerunning the real integration harness.

Record later deployments using this format:

```text
Intent:
Environment:
Command:
Expected behavior:
Observed result:
Actual difference:
Evidence:
Chain-specific notes:
Security or architecture impact:
Next action:
```

Never write “deployed successfully” without the contract address, successful
transaction hash, explorer link, and the post-deployment configuration state.

## Route-gate expiry: Node restart versus liquidity refresh

The Node loads `TSN_DESTINATION_ROUTES_JSON` and
`TSN_CREDITCOIN_RPC_URL` from `tsn-protocol/services/tsn-node/.env` at startup. A
configured route is not automatically a ready route: the Node also reads the
route's current `latestObservation` from the Creditcoin
`DestinationLiquidityRegistry`. If `validUntil` is earlier than the current
time, `/settlement-networks` intentionally returns an empty list even when the
registry, executor, token, chain ID, and RPC values are correct.

When this happens, restart the Node so it reloads the local configuration:

```powershell
# Stop the running Node with Ctrl+C, then run from the repository root.
cd C:\Users\codepara\Desktop\trust-link
python tsn-protocol/services/tsn-node/server.py --test-crosschain --receipt --network creditcoin-testnet --verbose
```

Check the route from a separate terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/settlement-networks |
  ConvertTo-Json -Depth 8
```

The restart only reloads configuration; it does not renew the on-chain
observation. If the response still has `Count: 0`, inspect the registry's
`latestObservation(routeId)` values and record a new proof-backed liquidity
observation through `DestinationLiquidityASC.execute(...)`. Do not extend
`validUntil` in the Node, add a route manually at runtime, or bypass the
registry. The route may proceed only after the Creditcoin registry contains a
current observation with sufficient available liquidity.

### Observed CC3 expiry diagnostic

On the `creditcoin-testnet` route, the Node configuration and on-chain route
metadata matched: the route was enabled, chain ID `102031`, executor, and
settlement token were correct. The live registry returned available liquidity
of `1,000,000,000,000`, but its `validUntil` timestamp was earlier than the
current timestamp. The Node therefore returned `Count: 0`; this was an
expired-liquidity safety gate, not a missing route or RPC failure.
