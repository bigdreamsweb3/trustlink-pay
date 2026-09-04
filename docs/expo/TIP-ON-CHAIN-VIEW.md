Think of it like a **bank box with a frosted window**.

**The box is the TIP** (`6ZS66`). One box per person. Everyone can *see the box* on the street. Nobody can *read the number inside* unless they have your house key (master seed).

---

### What you have today

The real number (“how many USDC”) lives in a **file on your computer**.

The chain only stores a **lock fingerprint** (“this is version 26”).

That’s like writing your balance in a notebook at home, and on the bank door only writing “notebook page 26.”

If you lose the notebook (`5adf97` missing), the bank **still has the cash in the vault**. You just **can’t read your own balance** or prove the next page follows the last one. The app stops. That’s what just happened.

---

### What the 64-byte head is

Put a **tiny sealed slip inside the box itself**, and **replace that slip** every time money moves.

- Slip is **always the same size** (32 bytes of ciphertext + 32 bytes fingerprint).
- 1 USDC and 1,000,000 USDC look the **same length**. No “this blob is bigger so they got more.”
- Your phone, with the seed, opens the slip: “you have 1 USDC.”
- A stranger sees: “the box was touched.” They do **not** see how much.

Lose the laptop → still have the seed → open the **same box** on the chain → number is back.

Lose the seed → you can’t read it. The vault still holds the USDC. That’s a different recovery problem (backup seed), not “snapshot files.”

---

### What you are *getting*

| | |
|---|---|
| **One address to check** | Always `6ZS66`. No hunting 20 files. |
| **No lost credits** | Balance lives on-chain (encrypted), not only on disk. |
| **Size doesn’t leak** | Always the same 64 bytes. |
| **Still private-ish** | Amount is sealed. People still see *that* your box moved. |
| **Spendable is separate** | The liability (`241Jos`) is the **till**: “this 1 USDC may be sent.” The slip is the **receipt you can read**. Both should move together. |

You are **not** getting: invisible payments. Solana will still show “this TIP was written.” You’re getting: **don’t lose the books**, and **don’t leak amount by blob size**.

---

### What you are *not* getting from “put a message on every tx”

That’s photocopying the slip onto a billboard each time. Extra cost, extra trail, and if that’s the *only* copy, you still lose it if logs get dropped. The box is the filing cabinet. A tx memo is an optional photocopy.

---

**One sentence:** vault = the cash in the building; TIP slip = your encrypted statement in the box; liability = the spendable till; GPRU = the one-time stamp that this payment was allowed.