import { sql } from "@/app/db/client";

let autoclaimJobsReady: Promise<void> | null = null;

export type AutoclaimJobType = "autoclaim.check" | "autoclaim.execute";
export type AutoclaimJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface AutoclaimJobRecord {
  payment_id: string;
  job_type: AutoclaimJobType;
  status: AutoclaimJobStatus;
  trigger_source: string;
  run_after: string;
  attempts: number;
  last_error: string | null;
  tx_signature: string | null;
  updated_at: string;
  created_at: string;
}

export async function ensureAutoclaimJobsTable() {
  if (!autoclaimJobsReady) {
    autoclaimJobsReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS autoclaim_jobs (
          payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
          job_type VARCHAR(32) NOT NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'queued',
          trigger_source VARCHAR(64) NOT NULL DEFAULT 'unknown',
          run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          tx_signature VARCHAR(128),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (payment_id, job_type)
        )
      `;

      await sql`
        DO $$
        BEGIN
          ALTER TABLE autoclaim_jobs
            ADD CONSTRAINT autoclaim_jobs_type_check
            CHECK (job_type IN ('autoclaim.check', 'autoclaim.execute'));
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `;

      await sql`
        DO $$
        BEGIN
          ALTER TABLE autoclaim_jobs
            ADD CONSTRAINT autoclaim_jobs_status_check
            CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_autoclaim_jobs_status_run_after ON autoclaim_jobs (status, run_after)`;
    })().catch((error) => {
      autoclaimJobsReady = null;
      throw error;
    });
  }

  await autoclaimJobsReady;
}

