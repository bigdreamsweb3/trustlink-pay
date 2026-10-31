# TrustLink naming and protocol boundaries

Use these names consistently in code, documentation, and public explanations.

| Name | Meaning | Boundary |
| --- | --- | --- |
| **TSN** | Transfer Settlement Network | The complete TrustLink settlement infrastructure: programs, protocols, Nodes, Receiver, Crankers, SDKs, and applications. |
| **TSNP** | Transfer Settlement Network Protocol | The on-chain settlement protocol program within TSN. The source crate currently retains the internal identifier `trustlink_escrow`; TSNP does not change its program ID or ABI by itself. |
| **TIP** | Transfer Identity Protocol | Manages transfer identity and route discovery. |
| **TIN** | Transfer Identity Number | A 10-digit identity managed by TIP; it is not the whole identity protocol or a wallet key. |
| **GPRU** | Guarded Privacy Routing Unit | A protocol for transaction-specific routing material and privacy proofs. It does not own TCAP assets or reserves. |
| **TCAP** | Transfer Confidential Asset Protocol | Governs accepted assets, reserve liquidity, and atomic settlement accounting. |
| **DIP** | Deposit Ingress Protocol | Defines the deposit-ingress boundary and its integration with the settlement protocols. |
| **CCTP** | Circle Cross-Chain Transfer Protocol | Circle's external protocol. Describe it as an integration only where the relevant code and deployment support it; it is not a TrustLink protocol name. |

## Writing rules

- Name the overall infrastructure **TSN** and the on-chain settlement program **TSNP**. Do not call the protocol simply “TSN” where that confuses the program with the whole infrastructure.
- Keep TIP and TIN distinct: TIP is the protocol; a TIN is one identity type inside it.
- List TSNP, TIP, GPRU, TCAP, and DIP as separate TrustLink protocol layers where relevant. Mention Circle's CCTP separately as an external protocol.
- Do not use DESP as an umbrella name for TSN or TSNP. Use direct names and describe the concrete responsibility instead.
- Preserve existing program IDs, keypairs, account layouts, and instruction ABIs unless a separately reviewed code change updates them.
- Distinguish checked-in source, successful builds, deployment, and confirmed transactions. A protocol name or design statement is not evidence that a path is active.
