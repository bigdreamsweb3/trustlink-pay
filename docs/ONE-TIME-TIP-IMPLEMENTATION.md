# Historical one-time TCAP TIN-tip experiment

> **Status: superseded as the current TSN credit path.** This file records the earlier design that used a TCAP per-TIN `TCapTinTipV1` account and off-chain encrypted snapshots. TCAP source still contains that instruction family, but the current TSN credit caller does not initialize or update it.

The current TSN credit source validates a GPRU encrypted credit transition and advances the global TCAP commitment root through `credit_gpru_memo_v1`. The hidden-head verifier and `advance_gpru_hidden_head_v1` are separate source additions with no current Node/SDK/Cranker caller. Neither the active credit caller nor the hidden-head source provides an end-to-end latest-per-TIN balance reader or a completed debit/exit proof.

Use [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md) as the current references. Do not use snapshot/tip setup commands in this historical experiment as current protocol procedures.
