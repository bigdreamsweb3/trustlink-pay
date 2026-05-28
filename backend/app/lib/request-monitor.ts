type RequestSample = {
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastLoggedAt: number;
  duplicateCount: number;
};

const WINDOW_MS = 10_000;
const LOG_COOLDOWN_MS = 3_000;
const HIGH_TRAFFIC_THRESHOLD = 25;
const store = new Map<string, RequestSample>();

function now() {
  return Date.now();
}

export function recordRequest(key: string) {
  const timestamp = now();
  const sample = store.get(key);
  if (!sample) {
    const next: RequestSample = {
      count: 1,
      duplicateCount: 0,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastLoggedAt: 0,
    };
    store.set(key, next);
    return { shouldLog: true, level: "info" as const, ...next };
  }

  const expired = timestamp - sample.firstSeenAt > WINDOW_MS;
  if (expired) {
    const next: RequestSample = {
      count: 1,
      duplicateCount: 0,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastLoggedAt: 0,
    };
    store.set(key, next);
    return { shouldLog: true, level: "info" as const, ...next };
  }

  sample.count += 1;
  sample.duplicateCount += 1;
  sample.lastSeenAt = timestamp;

  const highTraffic = sample.count >= HIGH_TRAFFIC_THRESHOLD;
  const cooldownPassed = timestamp - sample.lastLoggedAt >= LOG_COOLDOWN_MS;
  const shouldLog = highTraffic ? cooldownPassed : sample.count === 2;

  if (shouldLog) {
    sample.lastLoggedAt = timestamp;
  }

  return {
    shouldLog,
    level: highTraffic ? ("warn" as const) : ("info" as const),
    ...sample,
  };
}
