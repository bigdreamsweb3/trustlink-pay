# TINS - Transfer Identity Number System

TINS is the on-chain identity registry used by TrustLink Pay. TrustLink Pay maps a user's WhatsApp phone number to a TIN in the backend database, while TINS stores the wallet-owned on-chain identity that settlement can verify.

## Program

| Network | Program id |
| --- | --- |
| Devnet | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |

The TSN program id is separate: `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V`.

## Current Account Model

### Global State

PDA seed: `global-state`

Fields:

| Field | Purpose |
| --- | --- |
| `version` | TINS account version |
| `bump` | PDA bump |
| `next_sequence` | Next numeric TIN sequence |

### TIN Identity Account

PDA seed: `identity`, `sha256(wallet_pubkey || TINS_SALT_2026)`

Fields:

| Field | Purpose |
| --- | --- |
| `tin` | Numeric Transfer Identity Number |
| `display_name` | Public display name shown in UX |
| `identity_pubkey` | TINS identity PDA |
| `encrypted_phone` | Client-encrypted phone payload |
| `created_at` | On-chain creation timestamp |

### Registry PDA

PDA seed: `registry`, `tin.to_le_bytes()`

TrustLink stores this derived address with the user record for registry compatibility. The active create/load path verifies the wallet-derived TIN identity account.

## TrustLink Pay Mapping

TrustLink Pay stores this backend mapping:

```text
WhatsApp phone number -> TIN -> TINS identity PDA -> settlement wallet
```

The backend only accepts the mapping after it verifies:

1. The user is authenticated for the WhatsApp phone number.
2. The submitted TINS identity PDA matches the submitted wallet and TINS program id.
3. The TINS account exists on Solana devnet and is owned by the configured TINS program.
4. The decoded on-chain TIN matches the submitted TIN.
5. The wallet signs the TrustLink phone-to-TIN binding message.

## Privacy Model

The phone number is not stored as plaintext in TINS. The frontend encrypts it before sending the `CreateTin` instruction.

Current public on-chain data:

| Data | Public? | Notes |
| --- | --- | --- |
| TIN | Yes | Numeric identity used for routing |
| Display name | Yes | Helps users confirm the recipient |
| TINS identity PDA | Yes | Wallet-derived PDA |
| Encrypted phone payload | Yes | Not plaintext; still public ciphertext |
| Main wallet public key | Not stored in `TinAccount` | The identity PDA is deterministically derived from the wallet, so wallet correlation is possible if someone already knows the wallet and program derivation |

`master_privacy`, `privacy_view_pubkey`, and `privacy_spend_pubkey` are not the active TIN creation path. A master privacy key only replaces view/spend keys if the protocol explicitly derives those roles from it. The production TrustLink flow currently uses the TIN identity account plus a wallet-signed backend binding.

## Payment Flow

1. User logs in with WhatsApp.
2. User connects the wallet that should receive settlement.
3. Frontend creates or loads a TIN through the TINS program.
4. Frontend sends TIN metadata and wallet binding signature to the backend.
5. Backend verifies the on-chain TINS account through Solana RPC.
6. Backend stores WhatsApp phone number -> TIN mapping.
7. Sender enters a recipient phone number.
8. Backend resolves the phone number to the recipient TIN and TINS settlement wallet.
9. TSN creates and tracks the payment intent.
10. A cranker submits eligible intents on-chain and advances payment state.

## SDK Entry Points

The TINS helpers are exported from:

```ts
import {
  DEFAULT_TINS_PROGRAM_ID,
  buildCreateTinInstruction,
  decodeTinAccount,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsRegistryPda,
} from "@trustlink/tsn-sdk/tins";
```

## Operational Rules

- TINS program id must remain `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` for the current devnet deployment.
- TSN program id must remain `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` for the current devnet deployment.
- Do not replace the TSN program id while updating TINS.
- Do not deploy TINS with a local generated keypair unless its public key is exactly the configured TINS program id.
- TrustLink backend is responsible for phone number ownership and phone-to-TIN mapping.
- TINS is responsible for wallet-owned on-chain identity.

