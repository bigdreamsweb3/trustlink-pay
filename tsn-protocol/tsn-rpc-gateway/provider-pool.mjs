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

const PROBE_PAYLOAD = {
  jsonrpc: "2.0",
  id: "tsn-rpc-probe",
  method: "getSlot",
  params: [{ commitment: "processed" }],
};

function classifyMethod(method) {
  if (READ_METHODS.has(method)) return "read";
  if (WRITE_METHODS.has(method)) return "write";
  return "mixed";
}

function averageLatency(previous, sample) {
  if (!Number.isFinite(previous) || previous <= 0) {
    return sample;
  }
  return previous * 0.75 + sample * 0.25;
}

function roundLatency(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
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
      lastProbeAt: null,
      lastProbeLatencyMs: null,
      lastProbeSuccessAt: null,
      lastProbeFailureAt: null,
      probeFailures: 0,
      probeSuccesses: 0,
      healthy: false,
    },
  };
}

function createProbeState() {
  return {
    lastStartedAt: null,
    lastCompletedAt: null,
    lastDurationMs: null,
    round: 0,
    inFlight: false,
    lastError: null,
  };
}

function createLeaderState() {
  return {
    providerUrl: null,
    selectedAt: null,
    selectionReason: "bootstrap",
  };
}

function scoreProvider(provider, methodKind, mode, now, leaderUrl) {
  const { stats } = provider;
  const observedLatency =
    stats.lastProbeLatencyMs ??
    (stats.averageLatencyMs > 0 ? stats.averageLatencyMs : 9_999);
  let score = provider.index * 10;

  if (!stats.healthy) {
    score += 50_000;
  }
  if (stats.cooldownUntil > now) {
    score += 25_000;
  }

  if (mode === "prefer-first") {
    score += provider.index;
  } else if (mode === "fastest") {
    score += observedLatency * 2;
  } else {
    score += observedLatency * 1.4;
  }

  score += stats.failures * 250;
  score += stats.probeFailures * 400;
  score -= Math.min(stats.probeSuccesses * 4, 40);
  score -= Math.min(stats.successes * 3, 30);

  if (methodKind === "write") {
    score += stats.failures * 150;
    score += stats.probeFailures * 250;
  }

  if (leaderUrl && provider.url === leaderUrl && stats.healthy) {
    score -= 75;
  }

  return score;
}

function snapshotProvider(provider, leaderUrl) {
  return {
    id: provider.id,
    label: provider.label,
    displayUrl: provider.displayUrl,
    index: provider.index,
    isLeader: provider.url === leaderUrl,
    stats: {
      ...provider.stats,
      averageLatencyMs: roundLatency(provider.stats.averageLatencyMs),
      lastProbeLatencyMs: roundLatency(provider.stats.lastProbeLatencyMs),
    },
  };
}

async function fetchProbe(provider, timeoutMs) {
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const startedAt = performance.now();
  const response = await globalThis.fetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(PROBE_PAYLOAD),
    signal,
  });
  const latencyMs = performance.now() - startedAt;
  const payload = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(`Probe HTTP ${response.status}`), { latencyMs });
  }
  if (payload?.error) {
    throw Object.assign(
      new Error(`Probe JSON-RPC ${payload.error.message ?? payload.error.code}`),
      { latencyMs },
    );
  }

  return { latencyMs };
}

export function createProviderPool(
  upstreams,
  {
    mode = "balanced",
    probeIntervalMs = 60_000,
    probeTimeoutMs = 2_500,
    onLeaderChange = null,
    onProbeRound = null,
  } = {},
) {
  const providers = upstreams.map((entry, index) => createProviderState(entry, index));
  const probeState = createProbeState();
  const leaderState = createLeaderState();
  let probeTimer = null;

  function emitLeaderChange(previousLeaderUrl) {
    if (typeof onLeaderChange !== "function") return;
    const previous =
      providers.find((provider) => provider.url === previousLeaderUrl) ?? null;
    const current =
      providers.find((provider) => provider.url === leaderState.providerUrl) ?? null;
    onLeaderChange({
      previous,
      current,
      selectedAt: leaderState.selectedAt,
      selectionReason: leaderState.selectionReason,
    });
  }

  function emitProbeRound(summary) {
    if (typeof onProbeRound === "function") {
      onProbeRound(summary);
    }
  }

  function chooseLeader(reason) {
    const now = Date.now();
    const previousLeaderUrl = leaderState.providerUrl;
    const nextLeader = [...providers]
      .sort(
        (left, right) =>
          scoreProvider(left, "read", mode, now, previousLeaderUrl) -
          scoreProvider(right, "read", mode, now, previousLeaderUrl),
      )[0] ?? null;

    if (!nextLeader) return;

    leaderState.providerUrl = nextLeader.url;
    leaderState.selectedAt = now;
    leaderState.selectionReason = reason;

    if (previousLeaderUrl !== nextLeader.url) {
      emitLeaderChange(previousLeaderUrl);
    }
  }

  async function probeProvider(provider) {
    const now = Date.now();
    provider.stats.lastProbeAt = now;

    try {
      const result = await fetchProbe(provider, probeTimeoutMs);
      provider.stats.healthy = true;
      provider.stats.probeSuccesses += 1;
      provider.stats.lastProbeSuccessAt = now;
      provider.stats.lastProbeLatencyMs = result.latencyMs;
      provider.stats.averageLatencyMs = averageLatency(
        provider.stats.averageLatencyMs,
        result.latencyMs,
      );
      if (provider.stats.cooldownUntil <= now) {
        provider.stats.cooldownUntil = 0;
      }
      return {
        provider,
        ok: true,
        latencyMs: result.latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      provider.stats.healthy = false;
      provider.stats.probeFailures += 1;
      provider.stats.lastProbeFailureAt = now;
      provider.stats.lastErrorAt = now;
      provider.stats.lastError = message;
      provider.stats.cooldownUntil = now + Math.min(60_000, 3_000 * Math.max(1, provider.stats.probeFailures));
      return {
        provider,
        ok: false,
        latencyMs: Number(error?.latencyMs ?? probeTimeoutMs),
        error: message,
      };
    }
  }

  async function runProbeRound(reason = "scheduled") {
    if (probeState.inFlight) {
      return {
        skipped: true,
        reason: "probe-in-flight",
      };
    }

    probeState.inFlight = true;
    probeState.lastStartedAt = Date.now();
    probeState.round += 1;
    const startedAt = performance.now();

    try {
      const results = await Promise.all(providers.map((provider) => probeProvider(provider)));
      probeState.lastCompletedAt = Date.now();
      probeState.lastDurationMs = performance.now() - startedAt;
      probeState.lastError = null;
      chooseLeader(reason);

      const summary = {
        ok: true,
        reason,
        round: probeState.round,
        leader: providers.find((provider) => provider.url === leaderState.providerUrl) ?? null,
        durationMs: roundLatency(probeState.lastDurationMs),
        results: results.map((entry) => ({
          id: entry.provider.id,
          label: entry.provider.label,
          ok: entry.ok,
          latencyMs: roundLatency(entry.latencyMs),
          error: entry.error ?? null,
        })),
      };
      emitProbeRound(summary);
      return summary;
    } catch (error) {
      probeState.lastCompletedAt = Date.now();
      probeState.lastDurationMs = performance.now() - startedAt;
      probeState.lastError = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason,
        error: probeState.lastError,
      };
    } finally {
      probeState.inFlight = false;
    }
  }

  function startProbing() {
    if (probeTimer) return;
    void runProbeRound("startup");
    probeTimer = setInterval(() => {
      void runProbeRound("scheduled");
    }, probeIntervalMs);
    probeTimer.unref?.();
  }

  function stopProbing() {
    if (!probeTimer) return;
    clearInterval(probeTimer);
    probeTimer = null;
  }

  function getRankedProviders(method) {
    const methodKind = classifyMethod(method);
    const now = Date.now();
    const leaderUrl = leaderState.providerUrl;
    return [...providers].sort(
      (left, right) =>
        scoreProvider(left, methodKind, mode, now, leaderUrl) -
        scoreProvider(right, methodKind, mode, now, leaderUrl),
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
      provider.stats.healthy = true;
      provider.stats.averageLatencyMs = averageLatency(
        provider.stats.averageLatencyMs,
        outcome.latencyMs,
      );
      provider.stats.lastSuccessAt = now;
      provider.stats.cooldownUntil = 0;
      provider.stats.lastError = null;
      if (leaderState.providerUrl == null) {
        leaderState.providerUrl = provider.url;
        leaderState.selectedAt = now;
        leaderState.selectionReason = "first-success";
      }
      return;
    }

    provider.stats.failures += 1;
    provider.stats.healthy = false;
    provider.stats.averageLatencyMs = averageLatency(
      provider.stats.averageLatencyMs,
      Number.isFinite(outcome.latencyMs)
        ? outcome.latencyMs
        : provider.stats.averageLatencyMs || 1_000,
    );
    provider.stats.lastErrorAt = now;
    provider.stats.lastError = outcome.errorMessage;
    provider.stats.cooldownUntil = now + Math.min(60_000, 2_000 * Math.max(1, provider.stats.failures));

    if (leaderState.providerUrl === provider.url) {
      void runProbeRound("leader-failure");
    }
  }

  function snapshot() {
    return providers.map((provider) => snapshotProvider(provider, leaderState.providerUrl));
  }

  function getStatus() {
    const leader = providers.find((provider) => provider.url === leaderState.providerUrl) ?? null;
    return {
      mode,
      probeIntervalMs,
      probeTimeoutMs,
      probeState: {
        ...probeState,
        lastDurationMs: roundLatency(probeState.lastDurationMs),
      },
      leader: leader
        ? {
            id: leader.id,
            label: leader.label,
            displayUrl: leader.displayUrl,
            selectedAt: leaderState.selectedAt,
            selectionReason: leaderState.selectionReason,
            latencyMs:
              roundLatency(leader.stats.lastProbeLatencyMs) ??
              roundLatency(leader.stats.averageLatencyMs),
          }
        : null,
      providers: snapshot(),
    };
  }

  return {
    classifyMethod,
    getRankedProviders,
    getStatus,
    recordOutcome,
    runProbeRound,
    snapshot,
    startProbing,
    stopProbing,
  };
}
