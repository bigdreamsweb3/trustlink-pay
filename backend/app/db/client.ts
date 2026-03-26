import { neon } from "@neondatabase/serverless";

import { env } from "@/app/lib/env";

let sqlInstance: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (!sqlInstance) {
    const dbUrl = env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }
    sqlInstance = neon(dbUrl);
  }
  return sqlInstance;
}

export const sql = ((...args: Parameters<ReturnType<typeof neon>>) => getSql()(...args)) as ReturnType<typeof neon>;
