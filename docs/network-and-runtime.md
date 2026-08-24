# TSN network and runtime

The live credit network consists of the authenticated Receiver, TSN Node, Mother/TSN authorization boundary, Cranker submitter, Epoch Treasury accounts and the TSN/TCAP Solana programs. TCAP owns the tip/receipt/nullifier credit state while encrypted private snapshots remain owner-controlled. CrankerVault payout is not part of the live TCAP credit path; residual payout components are legacy and separately gated.

The Receiver exposes authenticated intent submission and internal work leasing only. Crankers never receive raw payment intents or recipient identity data. Node permits expire no later than the Receiver lease. The TSN program repeats every authorization check on chain.

Epoch close is a program operation gated by zero pending liability and complete opaque-slot resolution. Operational dashboards may show aggregate counts and transaction signatures, but never decrypt or persist the private binding.
