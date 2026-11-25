import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createStagedFixture } from "../staged-funding/create-staged-fixture.mjs";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { loadReceiverFixtureModule } from "../shared/load-receiver-fixture-module.mjs";

export async function createRelayFixture() {
  const fixture = await createStagedFixture();
  await writeFile(path.join(fixture.directory, "next-stub.mjs"), "export const NextResponse = Response;\n");
  const names = ["enqueue", "claim", "renew", "complete", "sync", "signal-node", "reply-message", "verify-reply", "request-hash", "http", "wait-reply"];
  await compileReceiverFixture(fixture.directory, names.map(name => "node-relay/" + name + ".ts"));
  const modules = {};
  for (const name of names) Object.assign(modules, await loadReceiverFixtureModule(fixture.directory, "node-relay/" + name));
  return { ...fixture, ...modules };
}
