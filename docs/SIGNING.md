# TSN Signing

TrustLink Pay uses canonical structured messages for TSN signing. A TSN wallet prompt must show readable text, not raw bytes, hex blobs, or opaque hashes. The signed bytes are the same readable text the user sees: action type, amount in decimal USDC, recipient TIN, fee, nonce, expiry, and TSN domain.

This removes the blind-signing gap. A malicious page cannot show "pay 5 USDC" while asking the wallet to sign "pay 500 USDC", because the wallet displays the actual bytes being signed. The mempool then parses the amount, recipient, fee, nonce, and expiry from those same signed bytes. The cranker independently parses the same message again before execution.

## Verification Model

1. Wallet display: the user sees the exact TSN message they sign.
2. Mempool parse: operational fields are derived from the signed payload and checked against submitted metadata.
3. Cranker parse: work payloads are independently re-parsed before on-chain execution.
4. On-chain program: Ed25519-protected instructions verify their signed payloads against instruction data.

## Format

Every TSN signed message is a UTF-8 string:

```text
TSN [ACTION_TYPE]
---
[Field label]: [Value]
Nonce: [unique nonce]
Expires: [ISO 8601 timestamp]
Domain: ...[last 8 chars of TSN domain hash]
```

## Payment Intent

```text
TSN Payment Intent
---
Amount: 50.00 USDC
Recipient TIN: 7731029841
Fee: 0.25 USDC
Sender: Main Wallet
Nonce: c9d2e1f0-a4b5-4c6d-8e9f-0a1b2c3d4e5f
Expires: 2026-07-05T14:05:00.000Z
Domain: ...d772e0a4
```

## Mixed Payment

```text
TSN Mixed Payment
---
Amount: 50.00 USDC
Recipient TIN: 7731029841
Fee: 0.25 USDC
ZK-PRU Portion: 30.00 USDC
Wallet Top-Up Portion: 20.25 USDC
Nonce: c9d2e1f0-a4b5-4c6d-8e9f-0a1b2c3d4e5f
Expires: 2026-07-05T14:05:00.000Z
Domain: ...d772e0a4
```

Mixed funding is the fallback mode when TIN balance is not enough to cover the full send. TSN uses ZK-PRU balance first, then the connected wallet tops up the remainder inside the same settlement. This preserves one send experience while explicitly relaxing wallet privacy for the wallet-funded remainder.

## ZK-PRU Spend

```text
TSN ZK-PRU Spend
---
Amount: 12.50 USDC
Recipient TIN: 4821903217
Fee: 0.05 USDC
ZK-PRU Source: TIN Balance
Nonce: 8842019a-f3c1-4b2e-9d07-e1a2b3c4d5e6
Expires: 2026-07-05T14:00:00.000Z
Domain: ...d772e0a4
```

ZK-PRU-only spend does not require the owner wallet to co-sign a Solana settlement transaction. The owner authorizes the spend with the canonical ZK-PRU Spend message, and the TSN mempool and cranker execute the ZK-PRU path from that signed payload plus the private ZK-PRU route material.

## TIN Creation

```text
TSN TIN Creation
---
TIN: 1000000042
Display Name: Big Dreams Web3
Privacy: 30 ZK-PRU handles
Nonce: 11223344-5566-7788-99aa-bbccddeeff00
Expires: 2026-07-05T14:10:00.000Z
Domain: ...d772e0a4
```

## TIN Upgrade

```text
TSN TIN Upgrade
---
TIN: 1000000008
Display Name: Big Dreams Web3
Nonce: aabbccdd-eeff-0011-2233-445566778899
Expires: 2026-07-05T14:15:00.000Z
Domain: ...d772e0a4
```

## Balance Access

```text
TSN Balance Access
---
TIN: 1000000008
Purpose: Load TIN Balance
Nonce: 55667788-99aa-bbcc-ddee-ff0011223344
Expires: 2026-07-05T14:20:00.000Z
Domain: ...d772e0a4
```

## Sweep

```text
TSN Sweep
---
TIN: 1000000008
Destination: Main Wallet
Mode: Protected
Estimated Amount: 7.50 USDC
Nonce: 99aabbcc-ddee-ff00-1122-334455667788
Expires: 2026-07-05T14:25:00.000Z
Domain: ...d772e0a4
```

## TSN Will Never

TSN will never show hex in a signing prompt. TSN will never ask users to sign a raw hash. TSN will never accept amount, recipient, fee, nonce, expiry, or action type as trusted metadata outside the signed message. TSN will never trust frontend-supplied metadata that is not inside the signed payload.
