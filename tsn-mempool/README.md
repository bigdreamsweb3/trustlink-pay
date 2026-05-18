# TSN Mempool

TSN Mempool is the live settlement queue for TrustLink payments. It gives payment services, Crankers, and the explorer one shared place to publish payment intents, request claims, discover available work, submit proofs, and track epoch activity.

## What It Does

- Stores payment intents posted by TrustLink services.
- Stores recipient claim requests.
- Shows claimable intent and claim pairs to Crankers.
- Accepts Proof of Payment from Crankers.
- Tracks epoch status and archives closed epochs to GitHub.
- Provides a live explorer UI for intents, claims, proofs, and pending work.

## How It Works

1. A payment service posts a payment intent.
2. A recipient claim request is added when the recipient starts the claim path.
3. TSN Mempool matches pending intents with pending claim requests.
4. Crankers poll for available settlement work.
5. A Cranker processes the settlement, updates the work status, and submits Proof of Payment.
6. The explorer shows live intents, claims, proofs, work, and epoch status.

## Backend Setup

Requirements:

- Python 3.11+
- Redis
- GitHub PAT with Contents:Write access to `bigdreamsweb3/tsn-epoch-records`

From PowerShell:

```powershell
cd C:\Users\codepara\Desktop\trust-link\tsn-mempool\backend
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```bash
GITHUB_TOKEN=ghp_your_token_here
REDIS_URL=redis://localhost:6379
PORT=8000
EPOCH_HOURS=7
```

Start Redis in a separate terminal:

```powershell
docker run -d -p 6379:6379 redis:alpine
```

Start the backend API:

```powershell
cd C:\Users\codepara\Desktop\trust-link\tsn-mempool\backend
python server.py
```

The backend runs at `http://localhost:8000`.

## Frontend Setup

From PowerShell:

```powershell
cd C:\Users\codepara\Desktop\trust-link\tsn-mempool\frontend
npm install
copy .env.local.example .env.local
```

The frontend environment should point to the backend:

```bash
MEMPOOL_API_URL=http://localhost:8000
```

Start the explorer:

```powershell
cd C:\Users\codepara\Desktop\trust-link\tsn-mempool\frontend
npm run dev
```

The explorer runs at `http://localhost:3000` by default.

## Connect Crankers

Point Crankers at the TSN Mempool backend before starting them:

```powershell
$env:TSN_MEMPOOL_URL="http://localhost:8000"
$env:TSN_CRANKER_OPERATOR_PUBKEY="local-dev-cranker"
cd C:\Users\codepara\Desktop\trust-link\tsn
npm run cranker
```

Status check:

```powershell
$env:TSN_MEMPOOL_URL="http://localhost:8000"
cd C:\Users\codepara\Desktop\trust-link\tsn
npm run setup -- status
```

## Connect Payment Services

Any TrustLink service that creates TSN work should post to the shared mempool:

```ts
await fetch(`${process.env.TSN_MEMPOOL_URL}/intents`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(intentPayload),
});

await fetch(`${process.env.TSN_MEMPOOL_URL}/claim-requests`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(claimPayload),
});
```

Crankers poll:

```ts
const work = await fetch(`${process.env.TSN_MEMPOOL_URL}/work`).then((res) => res.json());
```

Crankers update status and submit proofs:

```ts
await fetch(`${process.env.TSN_MEMPOOL_URL}/claim-requests/${claimId}/status`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "processing" }),
});

await fetch(`${process.env.TSN_MEMPOOL_URL}/proofs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(proofPayload),
});
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/intents` | Submit a payment intent |
| `GET` | `/intents` | List payment intents |
| `PATCH` | `/intents/{id}/status` | Update intent status |
| `POST` | `/claim-requests` | Submit a claim request |
| `GET` | `/claim-requests` | List claim requests |
| `PATCH` | `/claim-requests/{id}/status` | Update claim status |
| `GET` | `/work` | List pending Cranker work |
| `POST` | `/proofs` | Submit Proof of Payment |
| `GET` | `/proofs` | List proofs |
| `GET` | `/epoch/status` | Show current epoch state |
| `POST` | `/epoch/close` | Close and archive the current epoch |
