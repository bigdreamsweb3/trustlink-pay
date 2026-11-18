import test from "node:test";
import { verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnly } from "./cases/settlement-reconciliation/verify-finalized-receipt-repair-preserves-funding-rejects-mismatches-and-wakes-only.mjs";

/** Discovery facade; fixture bodies and mutable capture contexts live in cases/settlement-reconciliation. */
test("finalized receipt repair preserves funding, rejects mismatches, and wakes only after repair", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnly);
