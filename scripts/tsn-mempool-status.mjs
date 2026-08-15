const mempoolUrl = (process.env.TSN_MEMPOOL_URL || "https://tsn-node.wasmer.app").replace(/\/$/, "");

async function fetchJson(path) {
  const response = await fetch(`${mempoolUrl}${path}`, {
    headers: {
      accept: "application/json",
      ...(process.env.TSN_MEMPOOL_API_KEY
        ? { "x-api-key": process.env.TSN_MEMPOOL_API_KEY }
        : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status})`);
  }
  return response.json();
}

const [intents, claims, recoveries, intentWork, work] = await Promise.all([
  fetchJson("/intents"),
  fetchJson("/claim-requests"),
  fetchJson("/recoveries"),
  fetchJson("/intent-work?limit=100"),
  fetchJson("/work?limit=100"),
]);

const activeClaimStatuses = new Set(["pending", "processing", "claimed"]);
const claimsByIntent = new Map();
for (const claim of claims) {
  if (!claimsByIntent.has(claim.intentId)) claimsByIntent.set(claim.intentId, []);
  claimsByIntent.get(claim.intentId).push(claim);
}

const pendingIntents = intents.filter((intent) => intent.status === "pending");
const pendingIntentsWithoutClaims = pendingIntents.filter((intent) => {
  const activeClaims = (claimsByIntent.get(intent.id) ?? []).filter((claim) =>
    activeClaimStatuses.has(claim.status),
  );
  return activeClaims.length === 0;
});

console.log(`TSN mempool: ${mempoolUrl}`);
console.log(`intents=${intents.length} pendingIntents=${pendingIntents.length}`);
console.log(`claims=${claims.length} intentSubmissionWork=${intentWork.length} claimWorkPairs=${work.length}`);
console.log(
  `recoveries=${recoveries.length} pendingRecoveries=${recoveries.filter((item) => ["pending", "failed"].includes(item.status)).length}`,
);
console.log(`pendingIntentsWithoutClaims=${pendingIntentsWithoutClaims.length}`);

function displayStatus(status) {
  return status === "onchain" ? "escrowed" : status;
}

if (intentWork.length > 0) {
  console.log("\nCranker intent-submission work:");
  for (const item of intentWork.slice(0, 20)) {
    console.log(`- ${item.intent.id} amount=${item.intent.amount} postedAt=${item.intent.postedAt}`);
  }
}

if (work.length > 0) {
  console.log("\nCranker claim-execution work:");
  for (const item of work.slice(0, 20)) {
    console.log(`- ${item.intent.id} claim=${item.claimRequest.id} amount=${item.intent.amount} status=${displayStatus(item.intent.status)}`);
  }
}

const recoveryWork = recoveries
  .filter((item) => ["pending", "failed", "leased"].includes(item.status))
  .sort((left, right) => right.priorityScore - left.priorityScore);
if (recoveryWork.length > 0) {
  console.log("\nCranker recovery work:");
  for (const item of recoveryWork.slice(0, 20)) {
    console.log(
      `- ${item.paymentId} transfer=${item.transferId} amount=${item.amount} priority=${item.priorityScore} status=${item.status}`,
    );
  }
}

if (pendingIntentsWithoutClaims.length > 0) {
  console.log("\nPending intents without active claim requests:");
  for (const intent of pendingIntentsWithoutClaims.slice(0, 20)) {
    console.log(`- ${intent.id} amount=${intent.amount} postedAt=${intent.postedAt}`);
  }
  console.log("\nThese are still valid intent-submission work; claim execution waits until a claim request exists.");
}
