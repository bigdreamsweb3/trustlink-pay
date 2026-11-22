# Historical EVM deployment findings

**Status: HISTORICAL findings from the retired destination prototype, reviewed 2026-11-22.** Former faucet, deployment and route-activation instructions are no longer operating guidance. Recorded public contract addresses and transactions remain in the [historical register](verified-addresses.md).

The prototype exposed separate EVM and underlying-runtime explorer views. A mined EVM receipt and nonempty bytecode established contract deployment; a runtime extrinsic alone did not establish ERC-20 payout. Faucet gas funding did not provide a proof-message fee asset or settlement liquidity, and a token's explorer name did not prove official issuer provenance or public faucet availability.

One earlier deployment attempt passed local key loading and authorization-signer validation but stopped before submission because its external fee-token value was a placeholder. Later contract and test-token deployment observations were separate milestones. Registry activation and a funded vault still required a source obligation and recipient payout to demonstrate settlement.

Future integrations must record their own exact chain ID, token provenance, bytecode, configuration, liquidity and complete receipt chain. Old addresses or test assets cannot be reused as evidence for a different network. See the [current integration plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md).
