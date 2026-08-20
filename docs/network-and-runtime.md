# TSN network and runtime

The network consists of the authenticated Receiver, the Node/Mother encrypted binding store, Cranker operators, and the TSN Solana program. Epoch treasury and epoch ledger PDAs are the only payment funding state. CrankerVaults provide temporary liquidity; successful payout reimbursement is claim-bound and atomic.

The Receiver exposes authenticated intent submission and internal work leasing only. Crankers never receive raw payment intents or recipient identity data. Node permits expire no later than the Receiver lease. The TSN program repeats every authorization check on chain.

Epoch close is a program operation gated by zero pending liability and complete opaque-slot resolution. Operational dashboards may show aggregate counts and transaction signatures, but never decrypt or persist the private binding.
