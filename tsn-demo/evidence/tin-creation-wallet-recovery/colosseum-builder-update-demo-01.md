# Builder update draft · Demo 1

## Demo 1: Create and recover a TIN on Solana Devnet

A TIN is a human-readable ten-digit transfer ID people can share to receive transfers.

This 53-second TSN XP demo follows TIN creation and wallet recovery on Devnet. TSN XP encrypts the identity on the user's device before the signed creation intent leaves it. The Receiver accepts the intent, the Node verifies it, and a Cranker stages and submits the registry writes. The Solana program assigns the TIN and the transactions finalize on Devnet.

After a reload, the owner reconnects the same wallet and authorizes recovery. TSN XP decrypts and restores the TIN and display name locally, without asking the owner to remember the ten digits or submit another transaction.

Watch Demo 1: https://youtu.be/AKQNRP6Dxes

## Service documentation

- Receiver, Node, and Cranker architecture: https://trust-link-tsn.mintlify.site/architecture/node-receiver-cranker
- Mother Node service: https://trust-link-tsn.mintlify.site/operators/tsn-node
- Cranker service: https://trust-link-tsn.mintlify.site/operators/tsn-cranker
- Solana RPC Gateway: https://trust-link-tsn.mintlify.site/api-reference/rpc/solana-rpc-gateway
- TSN SDK: https://trust-link-tsn.mintlify.site/api-reference/sdk/tsn-sdk

Next, we are recording the TIN credit funding flow.

Screenshot: `colosseum-demo-01-screenshot.png`
