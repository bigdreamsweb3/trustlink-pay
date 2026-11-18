import { rm } from "node:fs/promises";

/** Remove only the resolved, test-created temporary directory. */
export async function cleanupFixture(fixture) {
  await rm(fixture.directory, { recursive: true, force: true });
}
