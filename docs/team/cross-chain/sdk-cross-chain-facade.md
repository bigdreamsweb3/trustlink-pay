# TSN SDK Cross-Chain Facade

This guide defines the application boundary for a Solana debit to a registered
Creditcoin exit. Applications use the TSN SDK; they do not call the Creditcoin
contracts directly and do not choose an executor or token from UI input.

## Responsibility boundary

The SDK reads the TSN Node route gate, reads the registered Creditcoin route and
fresh liquidity observation, submits an already signed debit intent to the Node,
and formats the authenticated Cranker handoff. The Solana programs perform the
debit and exit commitment. The Node validates and authorizes the route. A generic
Cranker submits the exact authorized Creditcoin transaction. Creditcoin contracts
enforce route, token, executor, replay, and liquidity rules.

The SDK does not sign Solana transactions, broadcast Creditcoin transactions,
generate Attestcoin proofs, or treat a message as settlement value.

## Application setup

```ts
import {
  TsnCrossChainClient,
} from "@trustlink/tsn-sdk";

const tsn = new TsnCrossChainClient({
  nodeUrl: "http://127.0.0.1:8000",
  route: {
    rpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
    registry: "0x764Ac587b1fC0feBEE86012cF7A2489b575EE5D1",
    routeId: "0xd1c8fb4fdaa90f4b4cf7f385e0f426c0cc6130ecff6ac078f0c95b91125e3943",
    expectedChainId: 102031n,
  },
});

const preflight = await tsn.preflight();
if (preflight.status !== "ready") {
  throw new Error(preflight.logs.join("; "));
}

console.log(preflight.logs);
```

The SDK reads the executor and USDSET token from the registry. The values in
the example identify the deployed CC3 Testnet route; they are not substitutes
for a fresh registry read.

## Solana debit evidence decoding

After the Solana debit transaction is confirmed, the SDK can decode the exact
`tsn_register_tcap_exit_debit_v1` instruction:

```ts
import { decodeExitDebitInstructionData } from "@trustlink/tsn-sdk";

const evidence = decodeExitDebitInstructionData(instructionData);
console.log(evidence.exitCommitment, evidence.amountBaseUnits);
```

The decoder returns the permit nonce, destination commitment, mint, amount,
sequence, sealed 48-byte payload, seal commitment, and source debit signature.
It does not decrypt the sealed payload, derive a TIN, or authorize a payout.
The Node must combine this result with its authenticated sealed-TIP and TIN
commitment readers before signing a Creditcoin authorization.

## Debit handoff

After the user signs the existing Solana debit intent, the app submits the
complete request to the Node:

```ts
const intent = await tsn.submitDebitIntent(signedIntentRequest);
console.log(intent.id, intent.status);
```

`signedIntentRequest` must contain the route ID, destination executor, and
destination token returned by the registry preflight. The Node repeats the
on-chain checks before admitting the intent.

## Cranker handoff

The Node authorization service produces the signed Creditcoin settlement
authorization. A Cranker receives that authorization and calls:

```ts
const handoff = tsn.createCrankerHandoff({
  authorization,
  signature,
});
```

The Cranker may submit `handoff.authorization` and `handoff.signature` to the
registered settlement contract. The SDK does not submit that transaction and
cannot be used to replace the Node's authorization decision.

## Evidence to record

For every testnet run, record the SDK preflight logs, Solana debit signature,
Creditcoin settlement transaction hash, settlement event, destination payout
transaction hash when an onward route is active, and final recipient balance.
Do not record a route as live from configuration alone; the registry and
liquidity observation must be observed at test time.

The cross-chain facade is part of the TSN infrastructure. TSNP supplies the
Solana settlement protocol boundary; each destination and bridge retains its
own verification and liquidity contracts. Circle's CCTP is an external
protocol and must not be described as a TSNP component.
