# GPRU — the doorbell, not the house

TIN is who. TIP is the box. GPRU is this one knock so a stranger can pay you without the TIN showing up on the street.

**GPRU is not “my wallet’s TIN.”** It is **how a credit finds someone else’s TIN** without that TIN, wallet, or seed appearing on-chain.

---

**The privacy public key**

On the TIN registry you store an **encrypted privacy-receiving public key** (the root that can spawn GPRUs).

- Only the **Node** can decrypt it.
- Sender, Cranker, Solscan, and the other wallet **cannot**.
- Master seed never leaves the owner’s device. The registry holds ciphertext, not the seed.

That exists because **any wallet can credit any TIN.** The depositor does not own the destination. They only know the 10-digit TIN. The Node looks up that TIN, decrypts the receive key, and binds **this one** credit to **that** TIP.

---

**Three paths, three uses**

| Path                 | Money                                         | Destination                         | Privacy key / GPRU                                                                                    |
| -------------------- | --------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Deposit → credit** | Wallet ATA → vault, then TIP `available +`    | A TIN (yours **or someone else’s**) | Node decrypts **destination TIN** envelope → one-time GPRU/scope → credit **that** TIP                |
| **TIP → TIP**        | Vault still; A `available −`, B `available +` | Another TIN                         | Node decrypts **B’s** envelope. A’s GPRU is spend-auth, not B’s money                                 |
| **Debit → exit**     | Vault → **public wallet ATA**                 | A wallet, **not** a TIN             | **No dest TIN.** Destination is public on purpose. GPRU (if used) only proves **A may spend A’s TIP** |

Exit is not “credit another TIN.” If they wanted a TIN, that is Path 2, not exit.

---

**What GPRU actually does**

1. **Receive:** turn a TIN the sender typed into a TIP the program can write — without publishing the TIN.
2. **Once:** new GPRU/scope per payment so two credits to the same TIN don’t reuse the same public routing key.
3. **Never custody:** USDC is vault + TIP liability. GPRU does not hold tokens.

Solscan **#9** is that one-time receive/auth key or its PDA. **#6** (`6ZS66…`) is the stable TIP you read. Different jobs.

---

**What Codex just built (keep them separate)**

1. **Path 1 writes the same liability debit spends** — so a credit is spendable. Needed for wallet→TIN and TIN→TIN.
2. **`exit_tcap_tip_v1`** — TIP debit + vault → public ATA. Destination wallet is public **only on that tx**. No dest GPRU.

Both are **new TCap (+ TSN wrapper) bytecode**. Old slot cannot run them.

You deploy, then:

```bash
# after TCap + TSN upgrade
npm run tcap:one-time:credit:devnet -- --user A --amount 1000000
# liability.available must rise on the SAME PDA Path 2 uses

npm run tcap:one-time:debit-credit:devnet -- --from A --to B --amount 1000000

npm run tcap:one-time:debit-exit:devnet -- --user A --amount 1000000
```

Exit needs `TCAP_EXIT_DESTINATION_WALLET` + existing dest ATA. That dest is a **wallet**, not a TIN.

**Short version:** privacy key on TIN = **who may be paid in private.** GPRU = **this one payment’s use of that key.** Exit = **leave privacy, pay a public ATA.**
