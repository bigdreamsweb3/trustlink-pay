# TSN SDK

The TSN SDK is the application interface to the Transfer Settlement Network.

## What Is This?

Apps and services use this SDK to interact with TSN.

The SDK should be the place where TSN transaction construction, PDA derivation, authorization helpers, quote helpers, and settlement calls live.

## Why It Exists

Frontend apps should not need to understand TSN internals.

They should call SDK methods instead of manually building instructions or deriving program accounts.

## Responsibilities

- Resolve TSN routes.
- Build TSN transactions and instructions.
- Derive TSN PDAs.
- Create payment authorization payloads.
- Submit mempool work.
- Read settlement status.
- Support TIP resolution where TSN needs identity context.
- Expose safe helpers for Cranker and backend services.

## Important Rules

- Do not move TSN transaction-building logic into React components.
- Do not expose private settlement payloads in logs.
- Keep browser-safe and server-only APIs clearly separated.
- Rebuild the SDK after changing source files.

## Development

```bash
npm --prefix tsn-sdk install
npm --prefix tsn-sdk run build
```

## Related Docs

- `docs/TSN-COMMITMENT-SETTLEMENT.md`
- `docs/INTEGRATION.md`
- `docs/CRANKER.md`

## Prepare a funded credit

The current source credit path uses `tcap_funded_note_v1`. Call `createFundingNoteV1()` in the sender's browser before signing, pass its public `commitment` to `createPaymentAuthorization` and `buildTcapGpruWalletDepositTransaction`, and pass the complete `fundingNote` only to the restricted `buildPaymentAuthorizationIntentRequest` ingress. The canonical message signs `Funding Note Commitment`; the wallet signs `deposit_private_funding_v1`, containing amount and that commitment with the canonical `tcap:funding-root:v1` account. Keep the secret and blinding in memory and exclude them from logs, public receipts and application storage.

The current serializer uses a 905-byte `buildTsnRegisterTcapCreditAuthorizationV3Instruction` with sixteen TSNP accounts and thirteen proof inputs. Amount is replaced by a blinded commitment, reserve is readonly, and sealed pool/epoch accounts bind the transition. Separate pool and aggregate-accounting builders support leased Node work; historical 825/857-byte receipts remain independently readable. New circuit/key and epoch verifier activation are required; fixture/build tests do not prove live execution. See [ABI](../../../docs/laboratory/credit-abi.md).

## Read a TIN balance

`loadTinOwnerBalanceV1` from `@trustlink/tsn-sdk/tin-owner-balance` performs the complete owner read. Supply a Solana connection, connected wallet, TIN and authenticated owner identity client. The SDK requests the one-time identity challenge, validates its wallet/TIN binding and the TIP registry, unlocks the owner seed locally, and verifies the finalized encrypted credit history. XP only supplies transport and renders the result.

```ts
import { loadTinOwnerBalanceV1 } from "@trustlink/tsn-sdk/tin-owner-balance";

const balance = await loadTinOwnerBalanceV1({
  connection, ownerWallet: wallet, tin, identityClient,
});
```

`identityClient.post(path, body)` connects to the existing owner identity service at `/owner-tin-identity-challenge` and `/owner-tin-identity`. In protocol-tests, these paths are relative to `/api/tsn/sdk` and require its wallet session and CSRF headers. Applications that already hold the verified owner context can supply `registry`, `programId` and `displayName` instead of `identityClient`. The SDK still checks that context against the finalized account and wallet.

Results contain `tokenBalances` with exact `balanceBaseUnits` strings, governed `mint` and `decimals`, plus owner/global sequence and action count. Incomplete or unsupported history rejects the read. TCAP maintains the shared root and reserve liabilities; encrypted owner actions are recovered from transaction Memos. Recovery requires correctly constructed owner ciphertext and does not confer spending or payout authority.

The history reader recognizes finalized historical twelve-input receipts and current thirteen-input funded receipts. `fundingProofVersion` distinguishes those forms; historical recovery does not supply an old deposit or settlement runtime fallback.

Authorization reuse is opt-in with `cacheAuthorization: true`. Cached signatures stay in device memory; the seed is decrypted per read and erased afterward. The SDK invalidates access on wallet disconnect/account events. Call `clearTinOwnerBalanceAccessV1(wallet)` on application logout or when using an adapter without those events. The reusable seed signature never enters HTTP requests; only the one-time lookup signature goes to the identity service.

## Recurring Mandates (Planned, Disabled)

The SDK includes a disabled foundation for recurring mandate contracts and verified provider validation.

- Recurring mandates are currently blocked by feature flags and fail closed by default.
- No production payment path should consume or execute recurring mandates in this repository.
- TSN_TEST_PROVIDER is only permitted on Devnet and is rejected on mainnet-beta.
- Recurring mandate state must reference only commitments, not subscriber TINs, wallet addresses, or ZK-PRU secrets.
- Verified providers must be ACTIVE, recurring enabled, and support the requested token mint.
- A mock Devnet-only provider fixture exists for tests and development only.

This folder is intentionally isolated from the main TSN payment execution path:

- `src/recurring` contains mandate serialization and validation helpers.
- The recurring feature remains disabled by default.
- No token transfer or delegate approval logic is implemented in this foundation.
