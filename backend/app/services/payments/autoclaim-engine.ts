import { sql } from "@/app/db/client";
import { ensureAutoclaimJobsTable, type AutoclaimJobRecord, type AutoclaimJobType } from "@/app/db/autoclaim-jobs";
import { ensurePaymentTraceColumns } from "@/app/db/payment-trace";
import { findPaymentById } from "@/app/db/payments";
import { findUserByPhoneNumber } from "@/app/db/users";
import { prepareEscrowClaim } from "@/app/blockchain/solana";
import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { getUsdPricesForSymbols } from "@/app/services/pricing";

type TriggerSource =
  | "payment.locked"
  | "receiver.onboarded"
  | "receiver.wallet_bound"
  | "receiver.settings_enabled"
  | "cron.tick"
  | "unknown";

function nowIso() {
  return new Date().toISOString();
}

async function paymentEligibleForAutoclaim(payment: {
  status: string;
  payment_mode?: string | null;
  receiver_phone: string;
  token_symbol: string;
  amount: string | number;
  receiver_wallet?: string | null;
  refund_requested_at?: string | null;
}) {
  if (payment.status !== "locked") return { ok: false, reason: "state_not_locked" as const };
  if (payment.payment_mode !== "secure" && payment.payment_mode !== "invite")
    return { ok: false, reason: "invalid_payment_mode" as const };
  if (!payment.receiver_wallet) return { ok: false, reason: "missing_receiver_wallet" as const };
  if (payment.refund_requested_at) return { ok: false, reason: "refund_requested" as const };

  const users = (await sql`
    SELECT receiver_autoclaim_enabled
    FROM users
    WHERE phone_number = ${payment.receiver_phone}
    LIMIT 1
  `) as { receiver_autoclaim_enabled?: boolean | null }[];

  if (!users[0]?.receiver_autoclaim_enabled) {
    return { ok: false, reason: "receiver_account_setting_disabled" as const };
  }

  const prices = await getUsdPricesForSymbols([payment.token_symbol]);
  const unitPriceUsd = prices[payment.token_symbol.toUpperCase()] ?? null;
  const amountUsd = unitPriceUsd != null ? Number((Number(payment.amount) * unitPriceUsd).toFixed(2)) : null;

  if (amountUsd == null) {
    return { ok: false, reason: "amount_usd_unavailable" as const };
  }

  if (amountUsd > getEscrowPolicyConfig().autoclaimMaxUsd) {
    return { ok: false, reason: "amount_exceeds_autoclaim_cap" as const };
  }

  return { ok: true, reason: "eligible" as const, amountUsd };
}

async function upsertJob(params: {
  paymentId: string;
  jobType: AutoclaimJobType;
  triggerSource: TriggerSource;
  runAfter?: Date;
}) {
  await ensureAutoclaimJobsTable();
  await ensurePaymentTraceColumns();

  const runAfter = params.runAfter ?? new Date();

  await sql`
    INSERT INTO autoclaim_jobs (
      payment_id,
      job_type,
      status,
      trigger_source,
      run_after,
      attempts,
      last_error,
      tx_signature,
      updated_at,
      created_at
    )
    VALUES (
      ${params.paymentId},
      ${params.jobType},
      'queued',
      ${params.triggerSource},
      ${runAfter},
      0,
      NULL,
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (payment_id, job_type) DO UPDATE
    SET
      status = CASE
        WHEN autoclaim_jobs.status = 'running' THEN 'running'
        ELSE 'queued'
      END,
      trigger_source = EXCLUDED.trigger_source,
      run_after = LEAST(autoclaim_jobs.run_after, EXCLUDED.run_after),
      updated_at = NOW()
  `;
}

async function claimOnChain(params: {
  paymentId: string;
  escrowAccount: string;
  escrowVaultAddress: string;
  receiverWallet: string;
  paymentPhoneIdentityPublicKey: string;
  bindingPhoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string | null;
  paymentMode: "secure" | "invite";
  tokenMintAddress: string;
  amount: number;
}) {
  const prepared = await prepareEscrowClaim({
    paymentId: params.paymentId,
    escrowAccount: params.escrowAccount,
    escrowVaultAddress: params.escrowVaultAddress,
    receiverWallet: params.receiverWallet,
    paymentPhoneIdentityPublicKey: params.paymentPhoneIdentityPublicKey,
    bindingPhoneIdentityPublicKey: params.bindingPhoneIdentityPublicKey,
    paymentReceiverPublicKey: params.paymentReceiverPublicKey,
    paymentMode: params.paymentMode,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
  });

  if (env.SOLANA_MOCK_MODE) {
    logger.info("autoclaim.mock.claim_submitted", {
      paymentId: params.paymentId,
      receiverWallet: params.receiverWallet,
      paymentMode: params.paymentMode,
      preview: prepared.preview,
    });
    return { signature: `mock-autoclaim-${params.paymentId}`, mode: "mock" as const };
  }

  // NOTE: The existing claim pipeline prepares a partially-signed transaction that still
  // requires the receiver's wallet signature (and for secure mode, the receiver authority signature).
  // Autoclaim execution is therefore only supported in mock mode until a receiver signing mechanism exists.
  throw new Error("Autoclaim execution is not supported when SOLANA_MOCK_MODE=false");
}

async function markJob(params: {
  job: Pick<AutoclaimJobRecord, "payment_id" | "job_type">;
  status: "succeeded" | "failed";
  lastError?: string | null;
  txSignature?: string | null;
}) {
  await sql`
    UPDATE autoclaim_jobs
    SET
      status = ${params.status},
      last_error = ${params.lastError ?? null},
      tx_signature = COALESCE(${params.txSignature ?? null}, tx_signature),
      updated_at = NOW()
    WHERE payment_id = ${params.job.payment_id}
      AND job_type = ${params.job.job_type}
  `;
}

async function fetchNextDueJob(): Promise<AutoclaimJobRecord | null> {
  await ensureAutoclaimJobsTable();

  const updated = (await sql`
    UPDATE autoclaim_jobs
    SET
      status = 'running',
      attempts = attempts + 1,
      updated_at = NOW()
    WHERE (payment_id, job_type) IN (
      SELECT payment_id, job_type
      FROM autoclaim_jobs
      WHERE status = 'queued'
        AND run_after <= NOW()
      ORDER BY run_after ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      payment_id,
      job_type,
      status,
      trigger_source,
      run_after,
      attempts,
      last_error,
      tx_signature,
      updated_at,
      created_at
  `) as AutoclaimJobRecord[];

  return updated[0] ?? null;
}

export const AutoclaimEngine = {
  async triggerPaymentLocked(params: { paymentId: string; triggerSource?: TriggerSource }) {
    await upsertJob({
      paymentId: params.paymentId,
      jobType: "autoclaim.check",
      triggerSource: params.triggerSource ?? "payment.locked",
    });

    logger.info("autoclaim.triggered", {
      triggerSource: params.triggerSource ?? "payment.locked",
      paymentId: params.paymentId,
      at: nowIso(),
    });
  },

  async triggerReceiverOnboarded(params: { receiverPhone: string; triggerSource?: TriggerSource }) {
    await ensurePaymentTraceColumns();

    const rows = (await sql`
      SELECT id
      FROM payments
      WHERE receiver_phone = ${params.receiverPhone}
        AND status = 'locked'
    `) as { id: string }[];

    await Promise.all(
      rows.map((row) =>
        upsertJob({
          paymentId: row.id,
          jobType: "autoclaim.check",
          triggerSource: params.triggerSource ?? "receiver.onboarded",
        }),
      ),
    );

    logger.info("autoclaim.triggered_batch", {
      triggerSource: params.triggerSource ?? "receiver.onboarded",
      receiverPhone: params.receiverPhone,
      paymentCount: rows.length,
      at: nowIso(),
    });
  },

  async triggerTick() {
    // Fallback periodic tick: enqueue checks for any locked payments that look eligible.
    await ensurePaymentTraceColumns();
    const rows = (await sql`
      SELECT id
      FROM payments
      WHERE status = 'locked'
        AND payment_mode IN ('secure', 'invite')
        AND receiver_wallet IS NOT NULL
        AND refund_requested_at IS NULL
      ORDER BY created_at ASC
      LIMIT 250
    `) as { id: string }[];

    await Promise.all(
      rows.map((row) =>
        upsertJob({
          paymentId: row.id,
          jobType: "autoclaim.check",
          triggerSource: "cron.tick",
        }),
      ),
    );

    logger.info("autoclaim.tick_enqueued", {
      paymentCount: rows.length,
      at: nowIso(),
    });
  },

  async processNextJob(): Promise<{ processed: boolean; job?: AutoclaimJobRecord | null }> {
    const job = await fetchNextDueJob();
    if (!job) {
      return { processed: false, job: null };
    }

    logger.info("autoclaim.job.started", {
      paymentId: job.payment_id,
      jobType: job.job_type,
      triggerSource: job.trigger_source,
      attempts: job.attempts,
    });

    try {
      if (job.job_type === "autoclaim.check") {
        const payment = await findPaymentById(job.payment_id);
        if (!payment) {
          await markJob({ job, status: "succeeded", lastError: null });
          return { processed: true, job };
        }

        const decision = await paymentEligibleForAutoclaim({
          status: payment.status,
          payment_mode: payment.payment_mode,
          receiver_phone: payment.receiver_phone,
          token_symbol: payment.token_symbol,
          amount: payment.amount,
          receiver_wallet: payment.receiver_wallet,
          refund_requested_at: payment.refund_requested_at,
        });
        logger.info("autoclaim.check.decision", {
          paymentId: payment.id,
          triggerSource: job.trigger_source,
          eligible: decision.ok,
          reason: decision.reason,
          status: payment.status,
        });

        if (decision.ok) {
          await upsertJob({
            paymentId: payment.id,
            jobType: "autoclaim.execute",
            triggerSource: job.trigger_source as TriggerSource,
          });
        }

        await markJob({ job, status: "succeeded", lastError: null });
        return { processed: true, job };
      }

      // autoclaim.execute
      const paymentRows = (await sql`
        SELECT
          id,
          status,
          payment_mode,
          receiver_phone,
          token_symbol,
          receiver_wallet,
          refund_requested_at,
          phone_identity_pubkey,
          payment_receiver_pubkey,
          escrow_account,
          escrow_vault_address,
          token_mint_address,
          amount
        FROM payments
        WHERE id = ${job.payment_id}
        LIMIT 1
      `) as any[];

      const current = paymentRows[0] as any | undefined;
      if (!current) {
        await markJob({ job, status: "succeeded", lastError: null });
        return { processed: true, job };
      }

      const decision = await paymentEligibleForAutoclaim(current);
      if (!decision.ok) {
        logger.info("autoclaim.execute.skipped", {
          paymentId: job.payment_id,
          triggerSource: job.trigger_source,
          reason: decision.reason,
        });
        await markJob({ job, status: "succeeded", lastError: null });
        return { processed: true, job };
      }

      const paymentMode = (current.payment_mode === "invite" ? "invite" : "secure") as "secure" | "invite";
      const receiverUser = await findUserByPhoneNumber(current.receiver_phone);
      if (!receiverUser?.phone_identity_pubkey) {
        throw new Error("Receiver identity binding key is missing");
      }

      const chain = await claimOnChain({
        paymentId: current.id,
        escrowAccount: current.escrow_account ?? "",
        escrowVaultAddress: current.escrow_vault_address ?? "",
        receiverWallet: current.receiver_wallet,
        paymentPhoneIdentityPublicKey: current.phone_identity_pubkey ?? "",
        bindingPhoneIdentityPublicKey: receiverUser.phone_identity_pubkey,
        paymentReceiverPublicKey: current.payment_receiver_pubkey ?? null,
        paymentMode,
        tokenMintAddress: current.token_mint_address ?? "",
        amount: Number(current.amount ?? 0),
      });

      // Mark claimed only after "confirmation" (mock = immediate).
      const updatedRows = (await sql`
        UPDATE payments
        SET
          status = 'claimed',
          release_signature = COALESCE(${chain.signature}::text, release_signature),
          released_to_wallet = COALESCE(${current.receiver_wallet}::text, released_to_wallet)
        WHERE id = ${current.id}
          AND status = 'locked'
          AND payment_mode IN ('secure', 'invite')
          AND receiver_wallet IS NOT NULL
          AND refund_requested_at IS NULL
        RETURNING id, status
      `) as { id: string; status: string }[];

      const updated = updatedRows[0] ?? null;

      logger.info("autoclaim.execute.succeeded", {
        paymentId: current.id,
        triggerSource: job.trigger_source,
        txSignature: chain.signature,
        status: updated?.status ?? null,
      });

      await markJob({ job, status: "succeeded", lastError: null, txSignature: chain.signature });
      return { processed: true, job };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn("autoclaim.job.failed", {
        paymentId: job.payment_id,
        jobType: job.job_type,
        triggerSource: job.trigger_source,
        error: message,
      });

      await markJob({ job, status: "failed", lastError: message });
      return { processed: true, job };
    }
  },
};
