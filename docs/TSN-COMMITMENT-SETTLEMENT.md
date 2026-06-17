# TSN Private Commitment Settlement

TSN private settlement separates sender escrow, recipient payout, and liquidity recovery so no single public account connects all three operations.

## Public Accounts

### Commitment event

The sender-co-signed escrow transaction emits a commitment event containing the commitment hash, token mint, amount, and epoch. The encrypted route and the mapping between that event and later work remain in protected mempool state.

The event does not contain:

- the recipient wallet;
- the random escrow token-account address;
- the unique payout code;
- the unique recovery code;
- the encrypted settlement token.

### Replay protection

A single protocol-wide replay registry is created when the protocol admin enables private settlement. No per-payment replay accounts are created. The registry stores only the next payout and recovery sequence numbers.

Each permit binds its payout or recovery code to the exact next sequence:

```text
payout_code   = SHA256("TSN_PRIVATE_PAYOUT"   || secret)
recovery_code = SHA256("TSN_PRIVATE_RECOVERY" || secret)
```

Without the secret, an observer cannot derive one code from the other. The program atomically increments the relevant sequence after successful execution. A duplicate, stale, or out-of-order permit fails without creating a new account.

### Private settlement config

The private settlement config stores the active permit signing key. A permit signing key is a keypair the platform uses to issue short-lived permits for payout and recovery. The protocol admin can rotate or disable this signer. The secret key must remain in trusted platform infrastructure and must never be exposed to the frontend.

## End-to-End Flow

### 1. Sender escrow

The TSN SDK builds one Cranker-broadcast, sender-co-signed transaction:

1. Generate a random one-time SPL token account.
2. Ask the TSN program to fund its rent from the verifier account.
3. Assign its token authority to the shared TSN escrow-authority account.
4. Transfer the sender-approved amount into the token account.
5. Emit the settlement commitment from a sender-authorized TSN instruction.
6. Credit the validating Cranker with one claim credit.
7. Reimburse the Cranker's outer Solana transaction fee directly in SOL.
8. Route any sender protocol fee directly to the treasury.

The frontend signs but does not broadcast. The Cranker verifies and broadcasts the transaction. The Cranker is the outer transaction fee payer only. It does not fund escrow rent, recipient token-account creation, or protocol state. Those costs are paid by the verifier account, and escrow rent returns to that account when recovery closes the one-time token account.

The one-time SPL escrow token account is necessary because SPL Token transfers require a real source account that can hold the sender's funds.

### 2. Authenticated lease and permit

The Cranker signs a lease request with its operator wallet. The mempool atomically assigns the work, verifies the operator signature, decrypts the route inside trusted verifier infrastructure, and validates:

- commitment integrity;
- lease ownership;
- epoch and expiry;
- token mint and amount;
- recipient routing.

The Cranker daemon does not hold the platform route-decryption secret or permit signing secret. It receives only the leased payout fields and a short-lived permit bound to its operator key.

### 3. Recipient payout

The payout transaction contains:

- the Cranker liquidity vault;
- the recipient token account;
- a unique payout code;
- the fixed replay registry;
- an Ed25519 verification instruction;
- the private payout instruction.

It does not contain:

- the sender wallet;
- the sender escrow token account;
- a per-payment commitment account;
- the recovery code.

The program verifies the permit and current payout sequence, creates a missing recipient ATA with verifier account funds, increments the replay registry, consumes one claim credit, and pays the recipient from Cranker liquidity. The Cranker receives only a direct SOL gas reimbursement; no reimbursement token account is created.

### 4. Liquidity recovery

After payout confirmation, the mempool creates a recovery job. Recovery becomes eligible:

1. after the payment's seven-hour epoch closes; or
2. earlier only when smart recovery detects that the settlement Cranker's available liquidity is below a configured safety threshold.

Epoch recovery is the default. Set `RECOVERY_LOW_LIQUIDITY_UI` in the mempool backend only when early smart recovery is intentionally enabled; `0` disables early recovery.

An eligible Cranker signs a separate lease request and receives a recovery-only permit. The response contains the escrow source and replenishment destination but does not contain the recipient.

The recovery transaction:

1. Verifies the permit and current recovery sequence.
2. Drains the random escrow token account.
3. Returns principal to the Cranker vault that funded payout.
4. Closes the empty escrow token account.
5. Returns account rent to the verifier reservoir.
6. Reimburses the recovery operator.

Recovery must reference the escrow token account because Solana requires the source account for a token transfer. It does not reference the recipient payout or payout code.

The current program closes one escrow token account per recovery instruction. Multiple eligible recoveries may be packed into bounded transactions, but one Solana transaction cannot close an unlimited epoch because every source and destination account must fit within transaction account and compute limits.

## Privacy Properties

Solana programs cannot keep secrets. Account data, instruction arguments, account lists, events, and logs are public. TSN therefore keeps recipient routing and the escrow-to-payout mapping encrypted off-chain.

The public program receives only:

- commitment hashes;
- payout and recovery codes carried in events and permits;
- short-lived verifier-signed permits;
- token accounts required by the action being executed.

The program never receives a decryption key. The platform mempool verifier decrypts routing only after an authenticated Cranker wins a lease. The verifier then releases only the fields required for that action together with a short-lived permit bound to that Cranker.

The system provides:

- no direct sender-to-recipient transaction link;
- no escrow account in the payout transaction;
- no recipient account in the recovery transaction;
- domain-separated replay protection;
- no per-payment commitment or replay account;
- off-chain encrypted routing;
- verifier-controlled lease authorization;
- protected worker APIs and aggregate-only public epoch archives.

It does not make Solana fully private:

- sender escrow is visible from the sender transaction;
- payout is visible from the recipient transaction;
- escrow and recovery share the one-time token account;
- a compromised verifier can reveal its private off-chain mapping.

Hiding escrow from recovery requires a shielded pool or zero-knowledge system, not a conventional SPL token transfer.

## Operator Setup

Generate the routing encryption key and dedicated permit signing key:

```bash
npm run tsn:security:keys
```

Configure:

```text
frontend/.env.local
  NEXT_PUBLIC_TSN_ROUTE_ENCRYPTION_PUBLIC_KEY

tsn-mempool-backend/.env
  MEMPOOL_API_KEY
  TSN_ROUTE_ENCRYPTION_SECRET_KEY
  TSN_PERMIT_SIGNER_SECRET_KEY

tsn-cranker-op-daemon/.env
  TSN_MEMPOOL_URL
  TSN_MEMPOOL_API_KEY
  TSN_CRANKER_KEYPAIR_PATH

backend/.env.local
  TSN_MEMPOOL_URL
  TSN_MEMPOOL_API_KEY

tsn-mempool-frontend/.env.local
  MEMPOOL_API_URL
  MEMPOOL_API_KEY
```

Use the same mempool API key for trusted server-side consumers. Never expose it through a `NEXT_PUBLIC_` variable.

These configuration steps use devnet. For mainnet, use the mainnet program ID and RPC endpoint.

After building and deploying the TSN program, register the public permit signing key and initialize the replay registry:

```bash
npm run tsn:sdk:build
npm run tsn:private:configure -- \
  ~/.config/solana/id.json \
  <TSN_PRIVATE_PERMIT_SIGNER_PUBKEY> \
  https://api.devnet.solana.com
```

The first keypair must be the protocol admin. Rotate the permit signing key by running the same command with a new public key.

## Off-Chain Data Handling

The verifier store contains encrypted routes and internal work mappings. Worker list, status mutation, proof, recovery, heartbeat, and manual epoch endpoints require the mempool API key. Each payout or recovery permit additionally requires a fresh operator-wallet signature, so possession of the shared API key does not authorize settlement.

The public mempool dashboard receives hashed work identifiers and no escrow, payout, proof, recipient, Cranker, or recovery transaction signatures.

Epoch publication is aggregate-only. GitHub epoch records contain counts, status totals, and token-volume totals. They do not contain payment IDs, wallets, ciphertext, transaction signatures, payout codes, or recovery mappings.
