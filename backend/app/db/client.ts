import { neon } from "@neondatabase/serverless";

import { env } from "@/app/lib/env";

export const sql = neon(env.DATABASE_URL);
