# Historical TCAP TIN-Tip V1 instruction family

> **Status: legacy source reference.** This page records an older per-TIN TCAP account experiment. It is not the current TSN credit flow and is not a setup or deployment guide. The current TSN credit caller uses `credit_gpru_memo_v1` and a shared TCAP commitment root; it does not create or update `TCapTinTipV1`.

TCAP source still contains the `TCapTinTipV1` account and legacy initialize, credit, debit, exit, and liability instructions. These define a per-TIN state model that remains in the repository for existing source paths. They must not be used to infer the account requirements of the current TSN/Node/Cranker settlement path.

Current status is documented in [Current architecture](./CURRENT-ARCHITECTURE.md), [GPRU hidden-head status](./gpru-tcap-route.md), and [TCAP balance-transition boundary](./TCAP-V2-DEBIT-CREDIT-DESIGN.md). The hidden-head source path is separate from the active caller and does not yet provide a verified encrypted-balance proof workflow.
