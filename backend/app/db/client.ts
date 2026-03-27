import { neon, neonConfig } from "@neondatabase/serverless";

import { env } from "@/app/lib/env";

type SqlFunction = (...args: any[]) => Promise<any>;

let sqlInstance: SqlFunction | null = null;
let neonConfigured = false;
const DATABASE_FETCH_TIMEOUT_MS = 8000;

function isTransientDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|networkerror|network error|socket|timeout|ecconnreset|enotfound|eai_again/i.test(
    error.message,
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DATABASE_FETCH_TIMEOUT_MS,
  );

  try {
    return await globalThis.fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Database fetch timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function configureNeon() {
  if (neonConfigured) {
    return;
  }

  neonConfig.fetchFunction = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchWithTimeout(input, init);
      } catch (error) {
        lastError = error;

        if (!isTransientDatabaseError(error) || attempt === 1) {
          throw error;
        }

        await delay(250 * (attempt + 1));
      }
    }

    throw lastError;
  };

  neonConfigured = true;
}

function createSqlInstance(): SqlFunction {
  configureNeon();
  const dbUrl = env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return neon(dbUrl) as unknown as SqlFunction;
}

export function getSql() {
  if (!sqlInstance) {
    sqlInstance = createSqlInstance();
  }
  return sqlInstance;
}

export const sql = (async (...args: any[]) => {
  try {
    return await getSql()(...args);
  } catch (error) {
    if (!isTransientDatabaseError(error)) {
      throw error;
    }

    sqlInstance = createSqlInstance();
    const retrySql = getSql();

    try {
      return await retrySql(...args);
    } catch (retryError) {
      if (isTransientDatabaseError(retryError)) {
        throw new Error("Database connection unavailable");
      }

      throw retryError;
    }
  }
}) as SqlFunction;
