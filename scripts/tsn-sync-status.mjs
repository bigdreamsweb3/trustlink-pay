import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const backendUrl = (
  process.argv[2] ||
  process.env.TSN_BACKEND_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

function readBackendCronSecret() {
  try {
    const contents = readFileSync(resolve("backend/.env.local"), "utf8");
    const line = contents
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("CRON_SECRET="));
    if (!line) return undefined;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  } catch {
    return undefined;
  }
}

const secret =
  process.argv[3] || process.env.CRON_SECRET || readBackendCronSecret();

if (!secret) {
  throw new Error(
    "Missing CRON_SECRET. Add it to backend/.env.local, pass it as the second argument, or set CRON_SECRET.",
  );
}
if (secret.length < 16) {
  throw new Error(
    `CRON_SECRET must contain at least 16 characters; received ${secret.length}. Update backend/.env.local and restart the backend.`,
  );
}

let response;
try {
  response = await fetch(`${backendUrl}/api/tsn/sync`, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
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
  throw new Error(`TSN status sync failed (${response.status}): ${body}`);
}

console.log(body);
