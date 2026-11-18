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
- Rebuild the SDK after changing source files. Its build clears generated `dist` and uses forced TypeScript compilation so retired exports cannot survive an incremental build.

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

The experimental first-release v1 credit path uses `tcap_funded_note_v1`. Create one private note with `createFundingNoteV1()` and sign the canonical message containing its public commitment. Submit `buildPaymentAuthorizationIntentRequest` with that same message, signature and complete private note to restricted `/intents` ingress. Initial request builders and payment-job helpers reject a preattached funding transaction or blockhash context. Receiver stores authorization work; Node checks the signed identity, asset and available source funds before publishing `FUNDING_READY`. Keep the secret and blinding out of logs, public receipts and application storage.

Use `waitForTsnFundingReadiness` with the authenticated application's status reader and optional abort signal. Its ready result describes Receiver coordination; fetch the owner-authenticated deposit preparation from Node `/network/funding/readiness` using the original work ID, sender public key and canonical message signature. `assertTsnFundingReadiness` validates its version, expiry, signed amount, original note and canonical deposit accounts. The reference XP enables an explicit **Ready to approve funding** button only while readiness matches the original work and remains unexpired; its idle expiry timer disables the approval action. Cancelling before funding approval stops the local approval workflow; it does not remove the already stored signed intent or extend its original expiry.

After the user selects funding approval, fetch a fresh Node blockhash and preserve exactly `senderFundingBlockhashContext: { blockhash, lastValidBlockHeight, contextSlot }`. The hash must be canonical nonzero 32-byte Base58, the height a positive safe integer and the slot a nonnegative safe integer. Build the deposit from Node's verified accounts and the original note commitment, then ask the same wallet to sign it. `buildCompleteTsnFundingRequest` checks the owner signature, issued hash and exact deposit, allowing only canonical nonduplicate ComputeBudget settings. Send its result to `/network/funding/complete`; this attaches the funding approval to the original ready work instead of creating another intent or consuming another canonical-message nonce. Node performs final wire/context validation and simulation before Cranker submission.

XP pins the ready version, original authorization commitment, wallet, issued tuple and saved signed wire. Its readiness timer is cleared on cancellation, wallet changes, signed-completion retention, successful attachment and linked settlement confirmation. Cancellation holds the same control lock as approval, and its response can invalidate only the captured pending intent and wallet generation. Repeated clicks cannot create concurrent approvals, and a lost ingress or completion response retries the identical request. Once a signed completion is saved, retries preserve its exact wire and blockhash; inspect the original status and signature before considering another deposit. The context is a client-reported routing hint, rather than an issuer attestation or proof of nonexecution. Confirmed funding still has a separate settlement and owner-recovery outcome. See the [payment guide](../../tsn-docs/sdk/payment-guide.mdx) for the approval and submission boundaries.

The earlier November 17 blockhash-context repair passed SDK/browser builds, 16 focused SDK tests and 13 offline XP tests before intent-first staging; its full SDK run passed 103 of 108 tests, with five existing TIN envelope/route/creation failures reproduced against independently compiled original source. The staging change passed SDK/browser compilation, 21 focused SDK checks, 26 offline XP checks and the five typed examples with 13 offline example scenarios. Its full SDK run passed 108 of 113 checks with the same five TIN failures. Synthetic wallet approvals and mocked RPC validate this scoped implementation; service reload, live funding, settlement and visual browser verification remain separate checks.

The current serializer uses a 905-byte `buildTsnRegisterTcapCreditAuthorizationV3Instruction` with sixteen TSNP accounts and thirteen proof inputs. Amount is represented by a blinded commitment, reserve/global funding accounts are readonly, and the shared-root/epoch accounts bind the transition. A single funded note supports credit; separate aggregate-accounting builders support leased Node work; historical 825/857-byte receipts remain independently readable. New circuit/key and epoch verifier activation are required; fixture/build tests do not prove live execution. See [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md).

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
