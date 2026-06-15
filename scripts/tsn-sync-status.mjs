import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const backendUrl = (
  process.argv[2] ||
  process.env.TSN_BACKEND_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

/**
 * DEPRECATED: Background TSN sync has been removed.
 * Transaction status is now refreshed on-demand via:
 *   POST /api/payment/[paymentId]/refresh-status
 *
 * This script can trigger a single refresh for a given payment.
 * Usage: node scripts/tsn-sync-status.mjs [backendUrl] [paymentId]
 */

const paymentId = process.argv[3];

if (!paymentId) {
  console.log(
    JSON.stringify({
      deprecated: true,
      message:
        "Background TSN sync has been removed. To refresh a specific payment status, run: node scripts/tsn-sync-status.mjs <backendUrl> <paymentId>",
    }),
  );
  process.exit(0);
}

let response;
try {
  response = await fetch(
    `${backendUrl}/api/payment/${paymentId}/refresh-status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
} catch (error) {
  throw new Error(
    `Could not reach the TrustLink backend at ${backendUrl}. Start or restart it with "npm run dev:backend".`,
    { cause: error },
  );
}
const body = await response.text();

if (!response.ok) {
  if (
    body.includes("middleware-manifest.json") ||
    body.includes("ENOENT: no such file or directory")
  ) {
    throw new Error(
      'The backend Next.js cache was removed while the dev server was running. Stop that backend process, then run "npm run dev:backend" before retrying.',
    );
  }
  throw new Error(`TSN status refresh failed (${response.status}): ${body}`);
}

console.log(body);
