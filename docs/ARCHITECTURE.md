# Architecture

TrustLink Pay is a Web3 payment system with one user-facing product surface and several protocol layers. For the product overview, start from the [identity-first payments](../README.md) homepage.

The product surface is simple: users send stablecoins to a 10-digit TIN.

The architecture exists so that identity, privacy, settlement, execution, and accounting stay separate. That separation is what makes TrustLink Pay useful as an identity-first blockchain payment solution instead of another wallet-address transfer UI.

## What Is This?

TrustLink Pay is made of:

1. **TrustLink Pay app**: user experience, payment records, and identity display
2. **TIP**: Transfer Identity Protocol for TINs, phone routing, trust context, attestations, and credentials
3. **TSN**: Transfer Settlement Network for intents, epochs, Crankers, fees, authorization, and receipts
4. **TCAP**: Transfer Confidential Asset Protocol for confidential asset representation and reserve metadata
5. **ZK-PRU**: separate zero-knowledge privacy technology under development

## Why This Structure Exists

A direct transfer is simple, but it exposes a clear graph:

```text
sender wallet -> recipient wallet
```

TrustLink Pay avoids making that the normal payment path. It separates identity, funding, payout, and accounting into different parts.

## How The Layers Work

### Product Layer: TrustLink Pay

TrustLink Pay is the payment system users and developers interact with.

The frontend collects payment input, shows identity confidence, requests wallet signatures, displays payment state, and helps users understand the status of their money. The backend stores app-local records such as user profile data, payment history, notification state, and display-safe status. It does not act as a bridge for TSN protocol mutations.

### Identity Layer: TIP

TIP creates and resolves Transfer Identities.

A Transfer Identity is the public payment identity. It can include a 10-digit TIN that is shared like an account number. The wallet address is not the normal payment identity.

Identity assurance is a capability of TIP. Every TIN remains payment-capable without an attestation. Optional legal-name, business-name, and personhood attestations add trusted recipient context.

The Solana Attestation Service (SAS) is the designated credential framework for identity assurance. SAS credentials remain outside TSN settlement, and their contents do not become public payment records. Credential-provider connectivity follows the SAS provider interface.

The Transfer Identity registry can store:

- the TIN number
- public display or legal-name status
- encrypted social identities
- verification platform references
- encrypted recovery material and route commitments
- SHA-256 owner pubkey commitments instead of readable owner wallet addresses

### Privacy Layer: PRUs

PRUs are Privacy Receiving Units.

Every upgraded Transfer Identity has 30 PRUs by default. Recipient payouts go to PRU routes instead of the owner wallet. The authenticated owner can load public PRU addresses for balance reads, but the frontend never receives PRU private keys or the TIN Master Seed.

TIN balance is the sum of supported token balances across those PRUs. In the send flow, TrustLink Pay can use PRU funds first and then add connected-wallet top-up only when the user explicitly authorizes that mixed path.

### Settlement Layer: TSN

TSN is the Transfer Settlement Network Protocol. It accepts sender-authorized payment intents, coordinates epochs and Crankers, records fees and authorization, and emits settlement receipts. The current public architecture does not define escrow-backed settlement or Cranker-funded payouts as the finalized model.

### Crankers: Operator Layer

Crankers are operators that do work for the network.

They:

- watch the mempool
- validate payment work
- reject tampered or expired work
- submit eligible settlement work and authorization records
- coordinate settlement receipts and liveness
- build reputation through correct work

### Confidential Asset Layer: TCAP

TCAP is an independent program boundary for confidential asset representation, approved-asset metadata, reserve state, commitments, nullifiers, and confidential ownership roots. Its current implementation is initialization-only; deposits, transfers, redemption, and proof acceptance are not production capabilities.

### ZK-PRU

ZK-PRU is a separate zero-knowledge privacy technology under development. It is not a TCAP submodule and only verified capabilities should be presented as available.

### Epoch Accounting

An epoch is a settlement window.

Each epoch records accepted intents, eligibility, authorization, fees, and settlement receipts. Legacy reimbursement and liquidity records remain compatibility code and are not the canonical architecture.

## Example Flow

1. Recipient has a Transfer Identity with a 10-digit TIN and finalized PRU route.
2. Sender enters that TIN.
3. TrustLink resolves display-safe identity and verification context.
4. Sender approves a canonical TSN payment message.
5. Payment enters the TSN mempool as settlement work.
6. Cranker performs advisory preflight validation of work, nonce, expiry,
   amount, route, and signatures.
7. TSN coordinates the authorized settlement work.
8. Settlement receipts and epoch commitments make the work auditable.
9. Future TCAP confidential settlement and public exits remain separate, not yet production paths.

## Security Considerations

- Payment identity is a TIN, not a raw wallet address.
- TIP stores an owner pubkey hash commitment, not a readable owner wallet authority.
- The frontend never derives PRUs and never receives the TIN Master Seed.
- Public records use commitments and roots where possible.
- Crankers must validate structure, signatures, routing, and timing before acting.
- Cranker checks are never consensus security. TCAP atomically enforces the
  expected state version/nonce, expiry, fee authorization, proof validity, and
  unused nullifier while inserting the nullifier and writing replacement state.
- Epoch reservoirs limit the blast radius of accounting problems.
- Cranker reputation and slashing are part of the operator safety model.
- Operator tooling should warn before epoch handoff or recovery fails.

## Important Limits

TrustLink Pay does not make Solana private.

It makes the normal payment graph less direct. A determined observer with enough context may still inspect public program activity.

The system must never claim impossible privacy guarantees.

## Technical Details

| Component | Path |
| --- | --- |
| TIP Solana program | `transfer-identity-protocol/tin-registrar/program/` |
| Transfer Identity SDK | `transfer-identity-protocol/tip-sdk/` |
| TSN SDK | `tsn-protocol/tsn-sdk/` |
| Cranker daemon | `tsn-protocol/tsn-cranker-op-daemon/` |
| Cranker SDK | `tsn-protocol/tsn-cranker-sdk/` |
| Mempool backend | `tsn-protocol/tsn-mempool-backend/` |
| Mempool explorer | `tsn-protocol/tsn-mempool-frontend/` |
| RPC gateway | `tsn-protocol/tsn-rpc-gateway/` |
| TrustLink app | `frontend/` |
| TrustLink API | `backend/` |

## Related Docs

- [Transfer Identity](./TRANSFER-IDENTITY.md)
- [TSN commitment settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker guide](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)
- [Security](./SECURITY.md)
