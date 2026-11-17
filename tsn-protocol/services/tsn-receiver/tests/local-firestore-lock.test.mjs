import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("exclusive local-store lock retries transient open access errors", { timeout: 15_000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-receiver-local-lock-"));
  const storePath = path.join(directory, "receiver.json");
  const lockPath = `${storePath}.lock`;
  const moduleDirectory = path.join(directory, "lib");
  const previousStorePath = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = storePath;

  try {
    await mkdir(moduleDirectory);
    await writeFile(storePath, "{}");
    const mockPath = path.join(moduleDirectory, "filesystem-mock.mjs");
    await writeFile(mockPath, `
      import { promises as native } from "node:fs";
      export const state = { failures: [], opens: [], stats: [], unlinks: [] };
      export function configure(failures = []) {
        state.failures = [...failures];
        state.opens = [];
        state.stats = [];
        state.unlinks = [];
      }
      export const promises = new Proxy(native, {
        get(target, property) {
          if (property === "open") return async (...arguments_) => {
            state.opens.push(arguments_);
            const code = state.failures.shift();
            if (code) throw Object.assign(new Error("injected lock open failure"), { code });
            return native.open(...arguments_);
          };
          if (property === "stat") return async (...arguments_) => {
            state.stats.push(arguments_);
            return native.stat(...arguments_);
          };
          if (property === "unlink") return async (...arguments_) => {
            state.unlinks.push(arguments_);
            return native.unlink(...arguments_);
          };
          return Reflect.get(target, property);
        },
      });
    `);
    for (const sourceName of ["local-firestore.ts", "work-contract.ts"]) {
      const source = await readFile(new URL(`../lib/${sourceName}`, import.meta.url), "utf8");
      let compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText.replaceAll('from "./work-contract"', 'from "./work-contract.mjs"');
      if (sourceName === "local-firestore.ts") {
        compiled = compiled.replaceAll('from "node:fs"', 'from "./filesystem-mock.mjs"');
        // Expose the private helper only in the isolated compiled test adapter.
        compiled += "\nexport { withFileLock as testWithFileLock };\n";
      }
      await writeFile(path.join(moduleDirectory, sourceName.replace(/\.ts$/, ".mjs")), compiled);
    }
    const { localDb, testWithFileLock } = await import(pathToFileURL(path.join(moduleDirectory, "local-firestore.mjs")).href);
    const { configure, state } = await import(pathToFileURL(mockPath).href);
    await localDb.collection("fixture").get();

    await t.test("EPERM and EACCES recover by retrying exclusive creation", async () => {
      configure(["EPERM", "EACCES"]);
      let operationCount = 0;
      const result = await testWithFileLock(async () => {
        operationCount += 1;
        assert.equal(state.opens.length, 3);
        await access(lockPath);
        return "acquired";
      });
      assert.equal(result, "acquired");
      assert.equal(operationCount, 1);
      assert.deepEqual(state.opens, Array.from({ length: 3 }, () => [lockPath, "wx"]));
      assert.deepEqual(state.stats, []);
      assert.deepEqual(state.unlinks, [[lockPath]]);
      await assert.rejects(access(lockPath), { code: "ENOENT" });
    });

    for (const code of ["EPERM", "EACCES"]) {
      await t.test(`persistent ${code} stops after eight attempts without touching an existing lock`, async () => {
        const originalLock = "fixture-existing-lock";
        await writeFile(lockPath, originalLock);
        configure(Array(12).fill(code));
        let operationCount = 0;
        try {
          await assert.rejects(testWithFileLock(async () => { operationCount += 1; }), { code });
          assert.equal(operationCount, 0);
          assert.equal(state.opens.length, 8);
          assert.equal(state.failures.length, 4);
          assert.deepEqual(state.stats, []);
          assert.deepEqual(state.unlinks, []);
          assert.equal(await readFile(lockPath, "utf8"), originalLock);
          assert.equal(await readFile(storePath, "utf8"), "{}");
        } finally {
          await unlink(lockPath);
        }
      });
    }

    await t.test("unrelated open errors fail immediately", async () => {
      configure(["EIO", "EPERM"]);
      let operationCount = 0;
      await assert.rejects(testWithFileLock(async () => { operationCount += 1; }), { code: "EIO" });
      assert.equal(operationCount, 0);
      assert.equal(state.opens.length, 1);
      assert.deepEqual(state.stats, []);
      assert.deepEqual(state.unlinks, []);
      await assert.rejects(access(lockPath), { code: "ENOENT" });
    });

    await t.test("a successful retry still waits for the current exclusive lock holder", async () => {
      configure();
      let releaseHolder;
      const hold = new Promise((resolve) => { releaseHolder = resolve; });
      let acquiredHolder;
      const acquired = new Promise((resolve) => { acquiredHolder = resolve; });
      const holder = testWithFileLock(async () => {
        acquiredHolder();
        await hold;
      });
      await acquired;
      configure(["EPERM", "EACCES"]);
      let competingOperationCount = 0;
      const competitor = testWithFileLock(async () => { competingOperationCount += 1; });
      try {
        const waitingSince = Date.now();
        while (state.stats.length === 0 && Date.now() - waitingSince < 2_000) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(competingOperationCount, 0);
        assert.ok(state.opens.length >= 3);
        assert.ok(state.stats.length > 0, "the retry must resume ordinary EEXIST contention handling");
        assert.deepEqual(state.unlinks, []);
        await access(lockPath);
      } finally {
        releaseHolder();
        await holder;
        await competitor;
      }
      assert.equal(competingOperationCount, 1);
      assert.ok(state.opens.every(([target, flags]) => target === lockPath && flags === "wx"));
      await assert.rejects(access(lockPath), { code: "ENOENT" });
    });
  } finally {
    if (previousStorePath === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE;
    else process.env.TSN_RECEIVER_LOCAL_FILE = previousStorePath;
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^tsn-receiver-local-lock-/);
    await rm(directory, { recursive: true, force: true });
  }
});
