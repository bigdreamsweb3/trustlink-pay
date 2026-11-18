/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseEncodeFixtureBase58(bytes) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let number = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
    let output = "";
    while (number) {
        const remainder = Number(number % 58n);
        output = alphabet[remainder] + output;
        number /= 58n;
    }
    for (const byte of bytes) {
        if (byte === 0)
            output = `1${output}`;
        else
            break;
    }
    return output;
}
