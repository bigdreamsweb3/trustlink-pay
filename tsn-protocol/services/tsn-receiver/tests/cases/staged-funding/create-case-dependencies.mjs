import { createHash, generateKeyPairSync, randomInt, randomUUID } from "node:crypto";
import path from "node:path";
import { captureWake } from "./capture-wake.mjs";

/** Use an explicit fresh local store and synthetic keys without changing process configuration. */
export function createCaseDependencies(fixture) {
  const db = new fixture.LocalDb(fixture.createStoreContext({ file: path.join(fixture.directory, `${randomUUID()}.json`) }));
  const workCollection = db.collection("tsn_receiver_work");
  const nodeKeys = generateKeyPairSync("ed25519");
  const nodePublic = nodeKeys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const environment = { TSN_RECEIVER_NODE_PAYLOAD_KEY: "29".repeat(32), TSN_NODE_VERIFICATION_PUBLIC_KEY: nodePublic.toString("hex") };
  const nodeWakes = [], crankerWakes = [];
  const dependencies = { ...fixture.contract, db, workCollection, createHash, randomInt,
    encryptPayloadForNode: fixture.encryptPayloadForNode.bind(null, { environment }),
    decryptPayloadForNode: fixture.decryptPayloadForNode.bind(null, { environment }),
    assertNodeVerificationAttestation: fixture.assertNodeVerificationAttestation.bind(null, { environment, clock: Date }),
    wakeTsnNode: captureWake.bind(null, nodeWakes), publishCrankerWake: captureWake.bind(null, crankerWakes) };
  return { ...fixture, dependencies, nodeKeys, nodePublic, nodeWakes, crankerWakes,
    receive: fixture.receive.bind(null, dependencies), attach: fixture.attachSignedFunding.bind(null, dependencies),
    forNode: fixture.getWorkForNode.bind(null, dependencies), leaseNode: fixture.leaseForNode.bind(null, dependencies),
    leaseCranker: fixture.leaseForCranker.bind(null, dependencies), transition: fixture.transition.bind(null, dependencies),
    executeState: fixture.executeStateOperation.bind(null, { database: db, root: db.collection("tsn_node_state") }) };
}
