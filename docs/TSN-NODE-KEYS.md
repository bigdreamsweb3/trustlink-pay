# TSN Node keys and credentials

This runbook describes the secrets used by the TSN Node. Keep the Node `.env`
file on the operator machine only. Never place these values in browser code,
the frontend `.env`, Git, screenshots, or a public hackathon submission.

## Required service credentials

| Variable | Purpose | How to create or obtain it |
| --- | --- | --- |
| `TSN_RECEIVER_NODE_API_KEY` | Authenticates the Node to the TSN Receiver and protects Receiver wake, work, and state endpoints. | Obtain the shared value from the Receiver operator. Do not generate a different local value unless the Receiver is configured with the same value. |
| `TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY` | Signs bounded settlement authorization receipts issued by the Node. | Generate a new random 32-byte secret for each Node. The Node accepts hex, Base64, or a JSON byte array. |
| `TSN_ROUTE_DECRYPTION_PRIVATE_KEY` | Decrypts the encrypted public route envelope used for recipient TIN routing. | Generate or provision the private key that matches the public route encryption key registered with the Receiver/TIN route flow. Do not rotate it without rotating the corresponding public key. |
| `TSN_THRESHOLD_NONCE_SIGNING_KEY` | Signs threshold-access nonce receipts for authorized TIN access. | Generate a separate random 32-byte secret for each Node. Never reuse a wallet, route key, or settlement signing key. |

The three locally generated secrets must be different. A PowerShell command for
a 32-byte hex value is:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set each result in `tsn-protocol/services/tsn-node/.env`:

```env
TSN_RECEIVER_NODE_API_KEY=<shared-with-the-Receiver>
TSN_ROUTE_DECRYPTION_PRIVATE_KEY=<64-hex-characters>
TSN_THRESHOLD_NONCE_SIGNING_KEY=<64-hex-characters>
TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY=<64-hex-characters>
```

Restart the Node after changing any key. A running process does not reload its
environment automatically.

## Additional protected values

| Variable | Purpose |
| --- | --- |
| `TSN_NODE_CLAIM_SLOT_HMAC_SECRET` | HMAC key for claim-slot authorization and replay protection. Generate a separate random value with the command above. |
| `MEMPOOL_API_KEY` | Optional direct mempool credential. The Node accepts this as an alternative worker credential when the Receiver credential is unavailable. |
| `TSN_ROUTE_ATTESTATION_SIGNING_KEY` | Signs route attestations when enabled. Generate a separate key and follow the configured verifier format. |
| `GITHUB_TOKEN` | Allows epoch archival to the configured GitHub repository. Create a narrowly scoped GitHub token. |
| `FIREBASE_CREDENTIALS` or `FIREBASE_*` | Firebase Admin access when `MEMPOOL_STORE=firebase`. Use a service-account file or individual fields, never both. |
| `EVM_CRANKER_API_KEY` | Authenticates the optional cross-chain worker. Obtain it from that service operator. |

For local development, the Node can use its ignored JSON store:

```env
MEMPOOL_STORE=file
TSN_ALLOW_LOCAL_JSON_STORE=true
```

That removes the Firebase requirement for the local process, but it does not
remove the Receiver credential when `TSN_RECEIVER_URL` points at the real
Receiver.

## Ownership and rotation

The Receiver and Node operators must agree on `TSN_RECEIVER_NODE_API_KEY`.
Cranker operators do not need the Node's private route or settlement keys. The
browser and frontend never receive any Node secret. To rotate a key, update the
service that verifies it and the Node environment together, restart the Node,
then verify the protected endpoint and record the change in the operator log.

## Verification

Start the Node from its service directory:

```powershell
cd C:\Users\codepara\Desktop\trust-link\tsn-protocol\services\tsn-node
..\..\..\.venv\Scripts\python.exe -u server.py
```

Then check the local overview:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/settlement-networks
```

HTTP `200` confirms that the process started. It does not by itself prove that
TIN routing, settlement signing, or Receiver work processing is configured;
those paths require their corresponding keys and service-side evidence.
