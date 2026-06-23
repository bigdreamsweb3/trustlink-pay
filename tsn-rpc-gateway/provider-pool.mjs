const READ_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlock",
  "getBlockHeight",
  "getBlockTime",
  "getClusterNodes",
  "getEpochInfo",
  "getFeeForMessage",
  "getFirstAvailableBlock",
  "getHealth",
  "getHighestSnapshotSlot",
  "getIdentity",
  "getInflationGovernor",
  "getInflationRate",
  "getLatestBlockhash",
  "getLeaderSchedule",
  "getLatestBlockhashAndContext",
  "getMultipleAccounts",
  "getParsedAccountInfo",
  "getParsedProgramAccounts",
  "getProgramAccounts",
  "getRecentPerformanceSamples",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getSupply",
  "getTransaction",
  "getTokenAccountBalance",
  "getTokenLargestAccounts",
  "getVersion",
  "isBlockhashValid",
  "simulateTransaction",
]);

const WRITE_METHODS = new Set([
  "requestAirdrop",
  "sendRawTransaction",
  "sendTransaction",
]);

function classifyMethod(method) {
  if (READ_METHODS.has(method)) return "read";
  if (WRITE_METHODS.has(method)) return "write";
  return "mixed";
}

function averageLatency(previous, sample) {
  if (!Number.isFinite(previous) || previous <= 0) {
    return sample;
  }
  return previous * 0.8 + sample * 0.2;
}

function createProviderState(entry, index) {
  return {
    ...entry,
    index,
    stats: {
      requests: 0,
      successes: 0,
      failures: 0,
      averageLatencyMs: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      lastUsedAt: null,
      cooldownUntil: 0,
    },
  };
}

function scoreProvider(provider, methodKind, mode, now) {
  const { stats } = provider;
  let score = provider.index * 10;

  if (mode === "prefer-first") {
    score += provider.index;
  } else if (mode === "fastest") {
    score += stats.averageLatencyMs * 1.5;
  } else {
    score += stats.averageLatencyMs;
  }

  score += stats.failures * 250;
  score -= stats.successes * 5;

  if (methodKind === "write") {
    score += stats.failures * 100;
  } else if (methodKind === "read") {
    score -= Math.min(stats.successes * 2, 20);
  }

  if (stats.cooldownUntil > now) {
    score += 10_000;
  }

  return score;
}

export function createProviderPool(upstreams, { mode = "balanced" } = {}) {
  const providers = upstreams.map((entry, index) => createProviderState(entry, index));

  function getRankedProviders(method) {
    const methodKind = classifyMethod(method);
    const now = Date.now();
    return [...providers].sort(
      (left, right) =>
        scoreProvider(left, methodKind, mode, now) -
        scoreProvider(right, methodKind, mode, now),
    );
  }

  function recordOutcome(providerUrl, outcome) {
    const provider = providers.find((entry) => entry.url === providerUrl);
    if (!provider) return;

    const now = Date.now();
    provider.stats.requests += 1;
    provider.stats.lastUsedAt = now;

    if (outcome.type === "success") {
      provider.stats.successes += 1;
      provider.stats.averageLatencyMs = averageLatency(
        provider.stats.averageLatencyMs,
        outcome.latencyMs,
      );
      provider.stats.lastSuccessAt = now;
      provider.stats.cooldownUntil = 0;
      provider.stats.lastError = null;
      return;
    }

    provider.stats.failures += 1;
    provider.stats.averageLatencyMs = averageLatency(
      provider.stats.averageLatencyMs,
      Number.isFinite(outcome.latencyMs) ? outcome.latencyMs : provider.stats.averageLatencyMs || 1_000,
    );
    provider.stats.lastErrorAt = now;
    provider.stats.lastError = outcome.errorMessage;
    provider.stats.cooldownUntil = now + Math.min(30_000, 1_000 * Math.max(1, provider.stats.failures));
  }

  function snapshot() {
    return providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      displayUrl: provider.displayUrl,
      index: provider.index,
      stats: { ...provider.stats },
    }));
  }

  return {
    classifyMethod,
    getRankedProviders,
    recordOutcome,
    snapshot,
  };
}
