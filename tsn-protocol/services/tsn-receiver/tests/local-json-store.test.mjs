import test from "node:test";
import { localFirestoreInterfaceTest } from "./cases/storage/local-json-store-interface-test.mjs";
test("local JSON documents, queries, merges, batches and concurrent workers preserve their interfaces", localFirestoreInterfaceTest);
