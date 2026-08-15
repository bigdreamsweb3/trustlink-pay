const mempoolUrl = (process.env.TSN_MEMPOOL_URL || "https://tsn-node.wasmer.app").replace(/\/$/, "");
const target = process.argv[2];

function usage() {
  console.log(`
Usage:
  npm run tsn:mempool:cancel -- <intentId>
  npm run tsn:mempool:cancel -- --all
  npm run tsn:mempool:cancel -- --orphans

Note:
  --orphans is dev cleanup only. Pending intents without claims are valid
  cranker intent-submission work in the current TSN design.

Environment:
  TSN_MEMPOOL_URL can override ${mempoolUrl}
`);
}

async function fetchJson(path, init) {
  const response = await fetch(`${mempoolUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(process.env.TSN_MEMPOOL_API_KEY
        ? { "x-api-key": process.env.TSN_MEMPOOL_API_KEY }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status})`);
  }
  return response.json();
}

async function patchStatus(path, status, settlementReason) {
  return fetchJson(path, {
    method: "PATCH",
    body: JSON.stringify({ status, settlementReason }),
  });
}

if (!target || target === "--help" || target === "-h") {
  usage();
  process.exit(target ? 0 : 1);
}

const reason = "Canceled from local TSN devnet test cleanup.";
const workItems = target === "--all"
  ? await fetchJson("/work?limit=100")
  : target === "--orphans"
    ? []
    : (await fetchJson(`/claim-requests?intent_id=${encodeURIComponent(target)}`)).map((claimRequest) => ({
        intent: { id: target },
        claimRequest,
      }));

if (target === "--orphans") {
  const [intents, claims] = await Promise.all([
    fetchJson("/intents"),
    fetchJson("/claim-requests"),
  ]);
  const activeClaimStatuses = new Set(["pending", "processing", "claimed"]);
  const activeClaimIntentIds = new Set(
    claims
      .filter((claim) => activeClaimStatuses.has(claim.status))
      .map((claim) => claim.intentId),
  );
  const orphanPendingIntents = intents.filter(
    (intent) => intent.status === "pending" && !activeClaimIntentIds.has(intent.id),
  );

  if (orphanPendingIntents.length === 0) {
    console.log("No pending intents without claims found.");
    process.exit(0);
  }

  for (const intent of orphanPendingIntents) {
    await patchStatus(`/intents/${encodeURIComponent(intent.id)}/status`, "canceled", reason);
    console.log(`[canceled-pending-intent-without-claim] intent=${intent.id}`);
  }

  console.log(`Canceled ${orphanPendingIntents.length} pending intent(s) without claims.`);
  process.exit(0);
}

if (!Array.isArray(workItems) || workItems.length === 0) {
  console.log(`No pending work found for ${target}.`);
  process.exit(0);
}

for (const item of workItems) {
  await patchStatus(`/claim-requests/${encodeURIComponent(item.claimRequest.id)}/status`, "canceled", reason);
  await patchStatus(`/intents/${encodeURIComponent(item.intent.id)}/status`, "canceled", reason);
  console.log(`[canceled] intent=${item.intent.id} claim=${item.claimRequest.id}`);
}

console.log(`Canceled ${workItems.length} pending work item(s).`);
