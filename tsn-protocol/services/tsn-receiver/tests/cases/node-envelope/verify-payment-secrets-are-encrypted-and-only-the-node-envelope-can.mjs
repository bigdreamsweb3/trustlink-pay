import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export async function verifyPaymentSecretsAreEncryptedAndOnlyTheNodeEnvelopeCan() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-node-envelope-"));
    const previous = process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY;
    process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY = "11".repeat(32);
    try {
        await compileReceiverFixture(directory, ["node-envelope.ts"]);
        const { decryptPayloadForNode, encryptPayloadForNode } = await import(pathToFileURL(path.join(directory, "node-envelope.mjs")).href);
        const payload = { recipientTin: "123456", senderAuthorizationSignature: "sig", senderSignedFundingTransaction: "tx",
            fundingNote: { version: 1, secret: "00".repeat(31) + "01", blinding: "00".repeat(31) + "02", commitment: "00".repeat(31) + "03" } };
        const envelope = encryptPayloadForNode(payload);
        assert.notEqual(envelope.ciphertext, JSON.stringify(payload));
        assert.deepEqual(decryptPayloadForNode(envelope), payload);
    }
    finally {
        if (previous === undefined)
            delete process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY;
        else
            process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY = previous;
        await rm(directory, { recursive: true, force: true });
    }
}
