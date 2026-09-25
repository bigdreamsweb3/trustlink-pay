# Real Devnet transaction evidence capture

Use this runbook when recording a real TIN creation for a demo or protocol
review. The evidence bundle must distinguish a queued intent, a Receiver
lease, and a finalized Solana transaction.

## Services and prerequisites

Run these as separate processes:

1. TSN Node on `http://127.0.0.1:8000` with its Receiver credential and Node
   keys configured.
2. The real TSN Receiver at the configured service URL.
3. The protocol UI with a browser wallet connected to Solana Devnet.
4. The Cranker daemon with a registered Devnet operator keypair and RPC URL.

The Cranker starts from the repository root with:

```powershell
npm run tsn:cranker:start
```

The daemon leases `TIN_OPERATION` work only after the Node has verified it. Do
not treat a successful UI response or an `intentId` as a completed creation.

## Capture points

Create an evidence directory before starting the flow:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidence = "evidence/tsn-tin-$stamp"
New-Item -ItemType Directory -Force $evidence | Out-Null
```

Capture the Node status and the Solana cluster:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/settlement-networks |
  Select-Object -ExpandProperty Content |
  Set-Content "$evidence/node-network.json"
solana cluster-version --url devnet | Set-Content "$evidence/cluster.txt"
```

In the UI activity rail, save the following values when they appear:

- owner wallet public key;
- display name;
- owner-encryption approval completed;
- owner intent hash and owner-intent signature completed;
- Node `intentId` and accepted status;
- Receiver operation ID, verification status, state version, and lease status;
- Cranker transaction signature, registry PDA, assigned TIN, and final status.

The owner-encryption and owner-intent signatures prove authorization. They are
not private keys. Never save the browser wallet seed, the plaintext master
seed, or Node/Receiver credentials in the evidence directory.

## Verify the final transaction

After the Cranker reports `CONFIRMED` and the signature is available, fetch the
transaction and account state from Devnet:

```powershell
$signature = "<confirmed-solana-signature>"
solana confirm $signature --url devnet | Set-Content "$evidence/confirm.txt"
solana transaction $signature --url devnet --output json |
  Set-Content "$evidence/transaction.json"

$registry = "<identity-registry-pda>"
solana account $registry --url devnet --output json |
  Set-Content "$evidence/registry-account.json"
```

Record the explorer link:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

The final record should contain at least:

```json
{
  "network": "devnet",
  "intentId": "<receiver-or-node-intent-id>",
  "signature": "<solana-signature>",
  "registry": "<identity-registry-pda>",
  "tin": "<assigned-10-digit-tin>",
  "status": "CONFIRMED",
  "explorer": "https://explorer.solana.com/tx/<signature>?cluster=devnet"
}
```

## Acceptance rule

Call the demo a successful TIN creation only when all of these are present:

- the Node accepted and verified the signed intent;
- the Receiver recorded the verified operation and Cranker lease;
- the Cranker submitted the exact authorized transaction;
- Solana returned a confirmed signature;
- the identity registry account exists at the reported PDA;
- the assigned TIN was decoded from that finalized account.

If any item is missing, describe the run as queued, verified, leased, or
submitted rather than finalized.
