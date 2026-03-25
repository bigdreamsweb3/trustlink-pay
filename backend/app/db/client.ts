import { neon } from "@neondatabase/serverless";

import { env } from "@/app/lib/env";

// This will throw at runtime if DATABASE_URL is not set (see env.ts proxy)
export const sql = neon(env.DATABASE_URL!);
