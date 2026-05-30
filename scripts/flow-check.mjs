const checks = [
  {
    name: "backend",
    method: "GET",
    url: process.env.FLOW_BACKEND_URL || "http://localhost:3000",
    okStatuses: [200, 301, 302, 404],
  },
  {
    name: "frontend",
    method: "GET",
    url: process.env.FLOW_FRONTEND_URL || "http://localhost:3001",
    okStatuses: [200],
  },
  {
    name: "mempool-api",
    method: "POST",
    url: process.env.FLOW_MEMPOOL_API_URL || "http://localhost:8000",
    okStatuses: [200],
  },
  {
    name: "mempool-work",
    method: "GET",
    url: `${process.env.FLOW_MEMPOOL_API_URL || "http://localhost:8000"}/work?limit=5`,
    okStatuses: [200],
  },
  {
    name: "mempool-ui",
    method: "GET",
    url: process.env.FLOW_MEMPOOL_UI_URL || "http://localhost:3002",
    okStatuses: [200],
  },
];

const timeoutMs = Number(process.env.FLOW_CHECK_TIMEOUT_MS || 5000);

function summarizeJson(value) {
  if (!value || typeof value !== "object") return "";
  const keys = Object.keys(value).slice(0, 6);
  return keys.length ? ` keys=${keys.join(",")}` : "";
}

async function checkService(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(check.url, {
      method: check.method,
      signal: controller.signal,
      headers: { accept: "application/json,text/html,*/*" },
    });

    const contentType = response.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      try {
        detail = summarizeJson(await response.json());
      } catch {
        detail = " json=unreadable";
      }
    }

    const passed = check.okStatuses.includes(response.status);
    return {
      ...check,
      passed,
      status: response.status,
      detail,
    };
  } catch (error) {
    return {
      ...check,
      passed: false,
      status: "DOWN",
      detail: ` ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = await Promise.all(checks.map(checkService));

for (const result of results) {
  const label = result.passed ? "ok" : "fail";
  console.log(
    `[${label}] ${result.name} ${result.method} ${result.url} status=${result.status}${result.detail}`,
  );
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(
    `\nFlow check failed for: ${failed.map((result) => result.name).join(", ")}`,
  );
  process.exit(1);
}

console.log("\nFlow check passed. The local testing stack is reachable.");
