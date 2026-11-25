import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";

export async function testHttpAuthentication(fixture) {
  const c = createRelayContext(fixture);
  const dependencies = { ...c.dependencies, requireService: () => { throw new Error("UNAUTHORIZED_SERVICE"); } };
  for (const method of ["GET","POST","PUT","PATCH"]) {
    const response = await c.relayHttp(dependencies, { method, nextUrl: new URL("https://receiver.invalid/api/internal/node/relay") });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error:"UNAUTHORIZED_SERVICE" });
  }
}
