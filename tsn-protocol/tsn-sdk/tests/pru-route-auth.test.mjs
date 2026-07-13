import test from "node:test";
import assert from "node:assert/strict";

import { loadPruRoute } from "../dist/pru-route-auth.js";

test("concurrent route loads request one wallet signature", async () => {
  const originalFetch = globalThis.fetch;
  let signatureRequests = 0;
  let sessionRequests = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/tin-routes/session")) {
      sessionRequests += 1;
      return Response.json({
        token: "route-session-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        tin: "1000000099",
      });
    }

    assert.equal(options.headers.authorization, "Bearer route-session-token");
    return Response.json({
      tin: "1000000099",
      pruConfigurationHash: "configured-route",
      status: "finalized",
      prus: [],
    });
  };

  const wallet = {
    publicKey: "11111111111111111111111111111111",
    signMessage: async () => {
      signatureRequests += 1;
      return new Uint8Array(64);
    },
  };

  try {
    await Promise.all([
      loadPruRoute("1000000099", wallet, "http://127.0.0.1:8000"),
      loadPruRoute("1000000099", wallet, "http://127.0.0.1:8000"),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(signatureRequests, 1);
  assert.equal(sessionRequests, 1);
});
