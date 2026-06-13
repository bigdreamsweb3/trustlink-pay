# TSN Private Commitment Settlement

TSN private settlement version 2 separates sender escrow, recipient payout, and
liquidity recovery so one public lifecycle account does not connect all three
operations.

## Security Boundary

Solana programs cannot keep secrets. PDA data, instruction arguments, account
lists, events, and logs are public. TSN therefore keeps recipient routing and
the escrow-to-payout mapping encrypted off-chain.

The public program receives only:

- commitment hashes;
- domain-separated payout and recovery nullifiers;
- short-lived verifier-signed permits;
- token accounts required by the action being executed.

The program never receives a decryption key. Decryption happens locally after
the mempool grants a lease to an authorized Cranker.

## Public Accounts

### Commitment record

A commitment record proves that an encrypted settlement authorization was
funded. It contains the commitment hash, token mint, amount, epoch, registering
Cranker, and timestamp.

It does not contain:

- the recipient wallet;
- the random escrow token-account address;
- the payout nullifier;
- the recovery nullifier;
- the encrypted settlement token.

### Spent nullifier

Payout and recovery each create a separate spent-nullifier PDA. The nullifiers
are derived with different domains:

```text
payout_nullifier   = SHA256("TSN_PRIVATE_PAYOUT_V1"   || secret)
recovery_nullifier = SHA256("TSN_PRIVATE_RECOVERY_V1" || secret)
```

Without the secret, an observer cannot derive one nullifier from the other.
Creating the PDA atomically prevents replay.

### Private settlement config

The private settlement config stores the active Ed25519 permit signer. The TSN
Mother Escrow authority can rotate or disable this signer. The secret key must
remain in trusted platform infrastructure and must never be exposed to the
frontend.

## End-to-End Flow

### 1. Sender escrow

The TSN SDK builds one Cranker-sponsored, sender-co-signed transaction:

1. Generate a random one-time SPL token account.
2. Assign its token authority to the shared TSN escrow-authority PDA.
3. Transfer the sender-approved amount into the token account.
4. Register the settlement commitment.
5. Credit the validating Cranker with one claim credit.
6. Route any sender protocol fee directly to the treasury.

The frontend signs but does not broadcast. The Cranker verifies and broadcasts
the transaction.

No `VaultState` lifecycle PDA is created for private v2 payments.

### 2. Lease and decryption

The mempool grants an atomic settlement lease. Only the leased Cranker receives
the encrypted route and decrypts it locally.

The platform verifier validates:

- sender authorization;
- commitment integrity;
- lease ownership;
- epoch and expiry;
- token mint and amount;
- recipient routing.

It then signs a short-lived payout permit bound to the leased Cranker.

### 3. Recipient payout

The payout transaction contains:

- the Cranker liquidity vault;
- the recipient token account;
- a payout nullifier;
- an Ed25519 verification instruction;
- the private payout instruction.

It does not contain:

- the sender wallet;
- the sender escrow token account;
- the commitment record;
- the recovery nullifier.

The program verifies the permit and unused payout nullifier, consumes one claim
credit, and pays the recipient from Cranker liquidity.

### 4. Liquidity recovery

After payout confirmation, the mempool creates a recovery job. A Cranker claims
that off-chain lease and receives a separate recovery permit.

The recovery transaction:

1. Verifies the permit and unused recovery nullifier.
2. Drains the random escrow token account.
3. Returns principal to the Cranker vault that funded payout.
4. Closes the empty escrow token account.
5. Returns account rent to the verifier reservoir.
6. Reimburses the recovery operator.

Recovery must reference the escrow token account because Solana requires the
source account for a token transfer. It does not reference the recipient payout
or payout nullifier.

## Privacy Properties

Version 2 removes the public lifecycle PDA that previously connected escrow,
lease, payout, and recovery.

It provides:

- no direct sender-to-recipient transaction;
- no escrow account in the payout transaction;
- no recipient account in the recovery transaction;
- domain-separated replay protection;
- off-chain encrypted routing;
- verifier-controlled lease authorization.

It does not make Solana fully private:

- sender escrow is visible from the sender transaction;
- payout is visible from the recipient transaction;
- escrow and recovery share the one-time token account;
- a compromised verifier can reveal its private off-chain mapping.

Hiding escrow from recovery requires a shielded pool or zero-knowledge system,
not a conventional SPL token transfer.

## Operator Setup

Generate the routing encryption key and dedicated permit signer:

```bash
npm run tsn:security:keys
```

Configure:

```text
frontend/.env.local
  NEXT_PUBLIC_TSN_CRANKER_ENCRYPTION_PUBLIC_KEY

tsn-cranker-op-daemon/.env.local
  TSN_CRANKER_ENCRYPTION_SECRET_KEY
  TSN_PERMIT_SIGNER_SECRET_KEY
```

After building and deploying the updated TSN program, register the public permit
signer:

```bash
npm run tsn:sdk:build
npm run tsn:private:configure -- \
  ~/.config/solana/id.json \
  <TSN_PRIVATE_PERMIT_SIGNER_PUBKEY> \
  https://api.devnet.solana.com
```

The first keypair must be the Mother Escrow authority. Rotate the permit signer
by running the same command with a new public key.

## Migration

- Existing version 1 intents continue through the legacy `VaultState` path.
- New SDK-created intents set `privacyVersion = 2`.
- The Cranker daemon selects the correct path from that version.
- Do not remove legacy instructions until all existing version 1 escrow
  accounts have been recovered.
