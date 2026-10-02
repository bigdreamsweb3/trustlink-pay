import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import test from "node:test";

test("local JSON store creates unique challenge documents, queries, and deletes stale records", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-receiver-local-store-"));
  const storePath = path.join(directory, "receiver.json");
  const moduleDirectory = path.join(directory, "lib");
  const previousStorePath = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = storePath;

  try {
    await mkdir(moduleDirectory);
    for (const sourceName of ["local-firestore.ts", "work-contract.ts"]) {
      const sourcePath = new URL(`../lib/${sourceName}`, import.meta.url);
      const source = await readFile(sourcePath, "utf8");
      let compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText;
      if (sourceName === "local-firestore.ts") {
        compiled = compiled.replaceAll('from "./work-contract"', 'from "./work-contract.mjs"');
      }
      await writeFile(path.join(moduleDirectory, sourceName.replace(/\.ts$/, ".mjs")), compiled);
    }
    const adapterUrl = pathToFileURL(path.join(moduleDirectory, "local-firestore.mjs")).href;
    const { localDb } = await import(adapterUrl);
    const { localDb: secondWorkerDb } = await import(`${adapterUrl}?worker=second`);
    const challenges = localDb.collection("challenges");
    const reference = challenges.doc("used-challenge");
    await reference.create({ used: true, expiresAt: "2026-10-01T00:00:00.000Z" });

    await assert.rejects(
      reference.create({ used: false }),
      /ALREADY_EXISTS/,
    );

    const used = await challenges.where("used", "==", true).get();
    assert.equal(used.docs.length, 1);
    assert.equal(used.docs[0].get("used"), true);

    const expired = await challenges.where("expiresAt", "<=", "2026-10-02T00:00:00.000Z").get();
    assert.equal(expired.docs.length, 1);
    await expired.docs[0].ref.delete();
    assert.equal((await challenges.get()).docs.length, 0);

    const persisted = JSON.parse(await readFile(storePath, "utf8"));
    assert.deepEqual(persisted.challenges, {});

    const rateLimit = challenges.doc("rate-limit");
    await localDb.runTransaction(async (transaction) => {
      transaction.set(rateLimit, { count: 1 });
      transaction.set(rateLimit, { updated: true }, { merge: true });
    });
    assert.deepEqual((await rateLimit.get()).data(), { count: 1, updated: true });

    await Promise.all(Array.from({ length: 20 }, (_, index) => {
      const worker = index % 2 === 0 ? localDb : secondWorkerDb;
      return worker.collection("parallel").doc(String(index)).create({ index });
    }));
    assert.equal((await localDb.collection("parallel").get()).docs.length, 20);
  } finally {
    if (previousStorePath === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE;
    else process.env.TSN_RECEIVER_LOCAL_FILE = previousStorePath;
    await rm(directory, { recursive: true, force: true });
  }
});
