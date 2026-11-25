import { db, workCollection } from "../database";
import { decryptPayloadForNode, encryptPayloadForNode } from "../node-envelope";
import type { RelayDependencies } from "./types";

export const relayDependencies: RelayDependencies = { db, workCollection, jobs: db.collection("tsn_node_requests"),
  activity: db.collection("tsn_node_relay").doc("activity"), environment: process.env, clock: Date,
  encrypt: encryptPayloadForNode, decrypt: decryptPayloadForNode };
