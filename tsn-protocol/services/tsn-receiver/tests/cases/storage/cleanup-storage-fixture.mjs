import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
export async function cleanupStorageFixture(fixture) {
  assert.equal(path.dirname(fixture.directory),path.resolve(os.tmpdir()));
  assert.match(path.basename(fixture.directory),/^tsn-receiver-storage-components-/);
  await rm(fixture.directory,{recursive:true,force:true});
}
