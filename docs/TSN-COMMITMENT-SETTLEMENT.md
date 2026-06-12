# TSN Commitment Settlement

TSN separates sender escrow, recipient payout, and liquidity recovery into different pieces of work. The public program state is a commitment registry; private routing remains encrypted off-chain.

## Security Boundary

Solana programs cannot privately decrypt secrets. Every instruction, account input, and program log is observable. TSN therefore uses this boundary:

- The frontend encrypts the settlement route to a Cranker X25519 public key.
- The mempool stores ciphertext, never the plaintext recipient wallet.
- The payment vault stores only a transfer ID, commitment hash, epoch, timestamps, lease state, and recovery state.
- A registered Cranker with valid DNA claims a settlement lease before decrypting.
- The program verifies the one-time decryption token and recomputes the complete settlement commitment before permitting payout.

Cranker DNA proves protocol registration. It is not an encryption key. The encryption keypair is separate.

## Flow

### 1. Escrow and commitment

The sender co-signs the SDK-built escrow transaction. A Cranker verifies it, adds the fee-payer signature, and broadcasts it.

The transaction:

1. Creates the isolated payment vault and vault token account.
2. Registers `transfer_id` and `commitment_hash` in the vault state.
3. Moves the sender-approved token amount into the vault.
4. Credits the validating Cranker with one on-chain claim credit.

No recipient wallet or plaintext settlement token is stored in the vault state.

### 2. Settlement lease and OTDT

A Cranker spends one claim credit to claim the settlement lease. It supplies the hash of a random 32-byte One-Time Decryption Token (OTDT).

The program rejects:

- a vault that is already paid or recovered;
- an active lease held by another Cranker;
- a used OTDT state;
- a zero OTDT hash;
- a Cranker without claim credit or valid DNA.

After the lease is recorded, the Cranker decrypts the settlement token off-chain. During payout it reveals the OTDT and commitment secret. The program verifies the OTDT and recomputes a domain-separated commitment over the transfer ID, recipient token-account owner, token mint, payout amount, claim fee, epoch, and secret. Changing any committed settlement field makes payout fail.

### 3. Recipient payout

The leased Cranker pays the recipient from its liquidity vault. Sender escrow and recipient payout remain separate transactions. The payment vault becomes `Paid` and `recoverable`.

### 4. Smart recovery

The mempool creates a recovery job after proof submission. Recovery jobs contain operational public data only: transfer ID, epoch, amount, vault, settlement Cranker, priority, and reward.

The daemon continuously:

1. Sorts recovery work by settlement-vault liquidity deficit, amount, age, and retry pressure.
2. Claims an off-chain queue lease.
3. Claims the matching on-chain recovery lease.
4. Returns the payment-vault tokens to the Cranker vault that funded settlement.
5. Closes the empty token account and marks the commitment record `Recovered`.

An expired lease returns to the queue so another Cranker can preserve liveness. If the RPC liquidity snapshot is unavailable, recovery remains live and falls back to amount, age, and retry priority.

## Privacy Guarantees and Limits

TSN breaks the direct sender-wallet-to-recipient-wallet graph. It does not make Solana private:

- Sender escrow activity is visible to observers who know the sender, transaction, or TSN vault.
- Recipient payout activity is visible in the separate Cranker payout transaction.
- Token mint and vault balances remain public.
- The commitment registry does not publish sender wallet, recipient wallet, or plaintext routing.

## Operator Setup

Generate a routing encryption keypair:

```bash
npm run tsn:security:keys
```

Put the public key in `frontend/.env.local` and the secret key in `tsn-cranker-op-daemon/.env.local`.

Run the local cryptographic test:

```bash
npm run tsn:security:test
```

Build and refresh all consumers:

```bash
npm run tsn:secure:rebuild
```

Build, deploy, and refresh all consumers:

```bash
npm run tsn:secure:deploy
```

## Status Synchronization

Frontend payment views read TSN state from the TrustLink database. The backend
synchronizes only active intents from the mempool, shares one short-lived
mempool snapshot across concurrent requests, and stops synchronizing terminal
intent states. It does not query Solana signature status during normal payment
history or detail reads.

Hosted deployments call the protected `/api/tsn/sync` route once per minute.
Set the same `CRON_SECRET` in the backend deployment and invoke a local/manual
sync with:

```bash
npm run tsn:status:sync -- http://localhost:3000 YOUR_CRON_SECRET
```
