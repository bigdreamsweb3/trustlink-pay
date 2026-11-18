import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { encryptNodeFixture } from "./encrypt-node-fixture.mjs";

export async function nodeProjectionPreservesContract() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "receiver-node-projection-"));
  try {
    await compileReceiverFixture(directory, ["work/projectWorkForNode.ts", "work/getWorkForNode.ts", "security/node-envelope/decrypt-payload-for-node.ts"]);
    const { projectWorkForNode } = await import(pathToFileURL(path.join(directory, "work/projectWorkForNode.mjs")).href);
    const { getWorkForNode } = await import(pathToFileURL(path.join(directory, "work/getWorkForNode.mjs")).href);
    const { decryptPayloadForNode } = await import(pathToFileURL(path.join(directory, "security/node-envelope/decrypt-payload-for-node.mjs")).href);
    const key = "23".repeat(32);
    const decrypt = decryptPayloadForNode.bind(null, { environment: { TSN_RECEIVER_NODE_PAYLOAD_KEY: key } });
    const plaintext = { fundingNote: { commitment: "synthetic-note", siblings: ["left", "right"] }, ownerAuthorization: { canonicalBytes: "synthetic-bytes" }, amount: "12345678901234567890", nested: { retained: true } };
    const envelope = encryptNodeFixture(key, JSON.stringify(plaintext));
    const common = { status: "RECEIVED", stateVersion: 9, verification: { retained: true }, authorization: { retained: "yes" }, nodeLease: { owner: "synthetic-node" }, arbitraryMetadata: [1, 2] };
    const cases = [
      { id: "absent", work: null, expected: null },
      { id: "settlement", work: { ...common, id: "settlement", kind: "SETTLEMENT", payload: { nodeEncryptedPayload: "not-an-envelope" } } },
      { id: "tin", work: { ...common, id: "tin", kind: "TIN_OPERATION", payload: null } },
      { id: "redacted", work: { ...common, id: "redacted", kind: "AUTHORIZED_FUNDING", status: "CONFIRMED", payload: { intentId: "redacted", payloadCommitment: "retained" } } },
      { id: "unencrypted", work: { ...common, id: "unencrypted", kind: "AUTHORIZED_FUNDING", payload: { retained: true } } },
      { id: "empty-envelope", work: { ...common, id: "empty-envelope", kind: "AUTHORIZED_FUNDING", payload: { nodeEncryptedPayload: "" } } },
      { id: "encrypted", work: { ...common, id: "encrypted", kind: "AUTHORIZED_FUNDING", payload: { nodeEncryptedPayload: envelope, publicMarker: "kept-in-stored-envelope" } }, expectedPayload: plaintext },
    ];
    const references = new Map();
    for (const item of cases) references.set(item.id, { get: Promise.resolve.bind(Promise, { exists: item.work !== null, data: structuredClone.bind(null, item.work) }) });
    const dependencies = { decryptPayloadForNode: decrypt, workCollection: { doc: references.get.bind(references) } };
    for (const item of cases) {
      const before = structuredClone(item.work);
      const expected = item.expectedPayload ? { ...item.work, payload: item.expectedPayload } : item.work;
      const projected = projectWorkForNode(dependencies, item.work);
      assert.deepEqual(projected, expected, item.id);
      assert.deepEqual(await getWorkForNode(dependencies, item.id), expected, "public ID lookup: " + item.id);
      assert.deepEqual(item.work, before, "projection must not mutate the encrypted snapshot: " + item.id);
      if (!item.expectedPayload) assert.equal(projected, item.work, "unprojected row keeps its original identity: " + item.id);
    }
    const failures = [
      { envelope: "malformed", error: /NODE_PAYLOAD_ENVELOPE_INVALID/ },
      { envelope: true, error: /NODE_PAYLOAD_ENVELOPE_INVALID/ },
      { envelope: { ...envelope, version: 2 }, error: /NODE_PAYLOAD_ENVELOPE_VERSION_UNSUPPORTED/ },
      { envelope: { ...envelope, tag: Buffer.alloc(16).toString("base64url") }, error: /authenticate|Unsupported state/ },
      { envelope: encryptNodeFixture(key, "[]"), error: /NODE_PAYLOAD_ENVELOPE_INVALID/ },
      { envelope: encryptNodeFixture(key, "null"), error: /NODE_PAYLOAD_ENVELOPE_INVALID/ },
      { envelope: encryptNodeFixture(key, "{"), error: /JSON/ },
      { envelope, environment: {}, error: /NODE_PAYLOAD_ENCRYPTION_KEY_REQUIRED/ },
      { envelope, environment: { TSN_RECEIVER_NODE_PAYLOAD_KEY: "23" }, error: /NODE_PAYLOAD_ENCRYPTION_KEY_INVALID/ },
    ];
    for (const item of failures) {
      const work = { ...common, id: "invalid", kind: "AUTHORIZED_FUNDING", payload: { nodeEncryptedPayload: item.envelope } };
      references.set(work.id, { get: Promise.resolve.bind(Promise, { exists: true, data: structuredClone.bind(null, work) }) });
      const errorDependencies = { ...dependencies, decryptPayloadForNode: item.environment ? decryptPayloadForNode.bind(null, { environment: item.environment }) : decrypt };
      assert.throws(projectWorkForNode.bind(null, errorDependencies, work), item.error);
      await assert.rejects(getWorkForNode(errorDependencies, work.id), item.error);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
