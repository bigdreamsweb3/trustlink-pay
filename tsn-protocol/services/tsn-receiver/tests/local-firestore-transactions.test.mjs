import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("file-backed transaction queries use their locked snapshot", { timeout: 20_000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-receiver-local-transactions-"));
  const storePath = path.join(directory, "receiver.json");
  const moduleDirectory = path.join(directory, "lib");
  const previousStorePath = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = storePath;

  try {
    await mkdir(moduleDirectory);
    for (const sourceName of ["local-firestore.ts", "work-contract.ts"]) {
      const source = await readFile(new URL(`../lib/${sourceName}`, import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText.replaceAll('from "./work-contract"', 'from "./work-contract.mjs"');
      await writeFile(path.join(moduleDirectory, sourceName.replace(/\.ts$/, ".mjs")), compiled);
    }
    const adapterUrl = pathToFileURL(path.join(moduleDirectory, "local-firestore.mjs")).href;
    const { localDb } = await import(adapterUrl);
    const { localDb: secondWorkerDb } = await import(`${adapterUrl}?worker=second`);
    await secondWorkerDb.collection("work").get();
    const workCollection = localDb.collection("work");
    const failed = workCollection.doc("epoch-010");
    const batch = localDb.batch();
    for (let index = 0; index < 205; index += 1) {
      const id = `epoch-${String(index).padStart(3, "0")}`;
      batch.set(workCollection.doc(id), {
        id, kind: "TCAP_EPOCH_ACCOUNTING", status: "FAILED", stateVersion: 167,
        payload: { assetEntry: "asset", root: "root" }, result: { reason: "SIGNING_UNAVAILABLE" },
      });
    }
    batch.set(workCollection.doc("other-kind"), { id: "other-kind", kind: "TIN_OPERATION" });
    await batch.commit();

    await t.test("recovery concurrency scan paginates and commits without reacquiring its own lock", async () => {
      const startedAt = Date.now();
      const count = await localDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(failed);
        assert.equal(fresh.get("stateVersion"), 167);
        let after;
        let scanned = 0;
        while (true) {
          let query = workCollection.where("kind", "==", "TCAP_EPOCH_ACCOUNTING").orderBy("__name__");
          if (after) query = query.startAfter(after);
          const page = await transaction.get(query.limit(200));
          for (const row of page.docs) {
            assert.equal(row.ref.id, row.id);
            assert.equal(row.get("kind"), "TCAP_EPOCH_ACCOUNTING");
            assert.equal(row.get("status"), "FAILED");
          }
          scanned += page.docs.length;
          if (page.docs.length < 200) break;
          after = page.docs.at(-1);
        }
        transaction.update(failed, { status: "RECEIVED", stateVersion: 168, result: null });
        return scanned;
      });
      assert.equal(count, 205);
      assert.ok(Date.now() - startedAt < 5_000, "transaction query must not wait for the 10-second store lock timeout");
      assert.equal((await failed.get()).get("stateVersion"), 168);
      await assert.rejects(access(`${storePath}.lock`), { code: "ENOENT" });
    });

    await t.test("filtering, ordering and cursors share the ordinary query evaluator", async () => {
      const query = workCollection.where("kind", "==", "TCAP_EPOCH_ACCOUNTING")
        .where("id", ">=", "epoch-002").where("id", "<", "epoch-008")
        .where("id", "!=", "epoch-004").orderBy("__name__", "desc").limit(4);
      const ordinary = await query.get();
      const result = await localDb.runTransaction(async (transaction) => {
        const page = await transaction.get(query);
        const next = await transaction.get(query.startAfter(page.docs.at(-1)));
        const staged = workCollection.doc("epoch-099");
        transaction.update(staged, { status: "VERIFIED" });
        const ownWrites = await transaction.get(workCollection.where("status", "==", "VERIFIED"));
        return { ids: page.docs.map((row) => row.id), nextIds: next.docs.map((row) => row.id),
          ownWrites: ownWrites.docs.map((row) => row.id) };
      });
      assert.deepEqual(result.ids, ordinary.docs.map((row) => row.id));
      assert.deepEqual(result.ids, ["epoch-007", "epoch-006", "epoch-005", "epoch-003"]);
      assert.deepEqual(result.nextIds, (await query.startAfter(ordinary.docs.at(-1)).get()).docs.map((row) => row.id));
      assert.deepEqual(result.ownWrites, ["epoch-099"]);
    });

    await t.test("another worker cannot change the transaction query snapshot before commit", async () => {
      let competingWrite;
      let competingWriteFinished = false;
      await localDb.runTransaction(async (transaction) => {
        competingWrite = secondWorkerDb.collection("work").doc("epoch-new").create({
          id: "epoch-new", kind: "TCAP_EPOCH_ACCOUNTING", status: "CRANKER_LEASED",
        }).then(() => { competingWriteFinished = true; });
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(competingWriteFinished, false);
        const page = await transaction.get(workCollection.where("status", "==", "CRANKER_LEASED"));
        assert.deepEqual(page.docs, []);
        transaction.update(failed, { audit: "snapshot-checked" });
      });
      await competingWrite;
      assert.equal(competingWriteFinished, true);
      assert.equal((await workCollection.doc("epoch-new").get()).get("status"), "CRANKER_LEASED");
      assert.equal((await failed.get()).get("audit"), "snapshot-checked");
    });

    await t.test("a rejected transaction query rolls back staged writes and releases the lock", async () => {
      const before = await readFile(storePath, "utf8");
      await assert.rejects(localDb.runTransaction(async (transaction) => {
        transaction.update(failed, { status: "SUBMITTED", stateVersion: 169 });
        await transaction.get(workCollection.where("kind", "in", ["TCAP_EPOCH_ACCOUNTING"]));
      }), /LOCAL_QUERY_OPERATOR_UNSUPPORTED: in/);
      assert.equal(await readFile(storePath, "utf8"), before);
      await assert.rejects(access(`${storePath}.lock`), { code: "ENOENT" });
      assert.equal((await failed.get()).get("status"), "RECEIVED");
      await localDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(failed);
        assert.equal(fresh.get("stateVersion"), 168);
      });
    });
  } finally {
    if (previousStorePath === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE;
    else process.env.TSN_RECEIVER_LOCAL_FILE = previousStorePath;
    await rm(directory, { recursive: true, force: true });
  }
});
