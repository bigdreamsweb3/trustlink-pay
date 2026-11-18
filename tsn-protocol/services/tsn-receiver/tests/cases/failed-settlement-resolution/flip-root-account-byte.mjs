/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

export async function flipRootAccountByte(offset, method, result) {
    if (method === "getAccountInfo") {
        const d = Buffer.from(result.value.data[0], "base64");
        d[offset] ^= 1;
        result.value.data[0] = d.toString("base64");
    }
    return result;
}
