# TSN + TINS Mempool Implementation Handoff

Version: TSN V1 Cranker-mediated TINS operations
Commit reference: current branch worktree

## Summary

The main repository now contains TINS program and SDK support for Cranker-mediated TIN creation and update registry writes. The TSN Mempool backend/frontend live in submodules that are not checked out in this environment, so this handoff adds patch files under `docs/submodule-patches/` for local Codex to apply when the submodules are available.

## Implementation notes

### TypeScript components

Apply these patches inside the relevant submodules:

```bash
cd tsn-mempool-backend
git apply ../docs/submodule-patches/tsn-mempool-backend-tins-cranker-v1.patch

cd ../tsn-mempool-frontend
git apply ../docs/submodule-patches/tsn-mempool-frontend-tins-cranker-v1.patch
```

Backend patch adds:

- `TinOperationRuntime` for TIN creation/update intents.
- Status pipeline: `pending_verification → verified → fee_committed → submitted → completed`.
- Fee split constants: 30% verifier, 40% submitter, 20% treasury, 10% bonus pool.
- Separate work queues for verification, fee commitment, and registry submission.
- Single-Cranker fallback gate through `TSN_ALLOW_SINGLE_CRANKER_TINS=1`.

Frontend patch adds:

- A masked TINS operation panel for creation/update intents.
- Status counts for Cranker A verification, fee commitment, registry submission, and completion.
- Masking for owner and commitment identifiers.
- No rendering of encrypted phone payloads, owner signatures, raw phone numbers, or PRU arrays.

### Python Cranker daemon

The daemon should consume the backend endpoints in three stages:

```bash
tsn-cranker tins verify-create-intent --intent <INTENT_ID>
tsn-cranker tins commit-create-fee --intent <INTENT_ID>
tsn-cranker tins submit-create-registry --intent <INTENT_ID>
tsn-cranker tins verify-update-intent --intent <INTENT_ID>
tsn-cranker tins submit-update --intent <INTENT_ID>
```

Cranker A marks the intent verified. Cranker B should be preferred for registry submission; if only one Cranker is online, set `TSN_ALLOW_SINGLE_CRANKER_TINS=1`.

## Usage examples

Post a creation intent to the Mempool runtime:

```bash
curl -X POST http://localhost:8000/tin-operations \
  -H 'content-type: application/json' \
  -d '{
    "kind":"tin_creation",
    "ownerPubkey":"<OWNER>",
    "displayName":"private receiver",
    "encryptedPhoneBase64":"<ENCRYPTED>",
    "privacyLevel":2,
    "encryptedMetadataHash":"<32_BYTE_HEX>",
    "pruConfigurationHash":"<32_BYTE_HEX>",
    "intentHash":"<32_BYTE_HEX>",
    "ownerSignatureBase64":"<SIG>",
    "nonce":"<32_BYTE_HEX>",
    "expiryTs":1893456000
  }'
```

List registry submission work for Cranker B:

```bash
curl 'http://localhost:8000/tin-operations/registry-work?operator_pubkey=<CRANKER_B>&limit=20'
```

## Security & privacy considerations

Hidden: raw phone numbers, owner operational network path, PRU lists, PRU derivation seeds, private keys, and clear balances.

Exposed to the Mempool runtime: owner pubkey, masked/display-safe metadata, encrypted phone payload, owner signature over intent hash, fee commitment hash, and PRU commitment hash. This is enough for Crankers to verify and relay without taking ownership.

The backend must require Cranker DNA auth before `verified`, `fee_committed`, or `submitted` state transitions in production.

## Testing notes

After applying patches, run the submodule checks:

```bash
npm --prefix tsn-mempool-backend test
npm --prefix tsn-mempool-frontend test
npm --prefix tsn-mempool-frontend run build
```

Then run the root checks:

```bash
npm --prefix tins-sdk run build
npm --prefix tsn-sdk test
cargo test --manifest-path tins-registrar/program/Cargo.toml --lib
```
