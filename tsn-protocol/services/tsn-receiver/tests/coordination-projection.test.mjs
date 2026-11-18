import test from "node:test";
import { nodeProjectionPreservesContract } from "./cases/coordination-projection/node-projection-preserves-contract.mjs";
import { coordinationReadsOneSnapshot } from "./cases/coordination-projection/coordination-reads-one-snapshot.mjs";

test("Node snapshot projection preserves encrypted payloads, redaction and public read errors", nodeProjectionPreservesContract);
test("coordination decrypts a full funding page using one query and no repeated document reads", coordinationReadsOneSnapshot);
