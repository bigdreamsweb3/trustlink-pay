# Historical one-time TCAP TIN-tip experiment

> **Status: superseded as the current TSN credit path.** This file records the earlier design that used a TCAP per-TIN `TCapTinTipV1` account and off-chain encrypted snapshots. TCAP source still contains that instruction family, but the current TSN credit caller does not initialize or update it.

This historical note describes the retired per-TIN TCAP tip approach. Current TSN/TCAP source carries the GPRU hidden-head proof through `credit_gpru_memo_v1` and does not call a separate root-advance instruction. Node settlement authorization currently fails closed because no Groth16 prover or hidden-head witness source is configured. This experiment is not a setup guide for current TIN credit.

Use [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU hidden-head status](./gpru-tcap-route.md) as the current references. Do not use snapshot/tip setup commands in this historical experiment as current protocol procedures.
