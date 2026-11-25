import { createCaseDependencies } from "../staged-funding/create-case-dependencies.mjs";

export function createRelayContext(fixture) {
  const context = createCaseDependencies(fixture);
  const { encryptPayloadForNode, decryptPayloadForNode } = context.dependencies;
  const db = fixture.persistenceFactory ? fixture.persistenceFactory() : context.dependencies.db;
  const workCollection = fixture.persistenceFactory ? db.collection("tsn_receiver_work") : context.dependencies.workCollection;
  const dependencies = { db, workCollection, jobs: db.collection("tsn_node_requests"), activity: db.collection("tsn_node_relay").doc("activity"), clock: Date,
    environment: { TSN_RECEIVER_NODE_PAYLOAD_KEY: "29".repeat(32), TSN_NODE_VERIFICATION_PUBLIC_KEY: context.nodePublic.toString("hex") },
    encrypt: encryptPayloadForNode, decrypt: decryptPayloadForNode };
  return { ...fixture, dependencies, nodeKeys: context.nodeKeys };
}
