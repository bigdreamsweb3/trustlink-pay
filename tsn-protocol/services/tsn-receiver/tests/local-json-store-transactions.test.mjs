import test from "node:test";
import { transactionTest } from "./cases/storage/transaction-test.mjs";
test("file-backed transaction queries preserve snapshots, pagination, own writes and rollback", { timeout: 120_000 }, transactionTest);
