"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { PaymentRecord } from "@/src/lib/types";

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function ClaimListExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/claim");
  const { showToast } = useToast();
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visiblePendingPayments = pendingPayments.slice(0, 2);
  const hiddenPendingCount = Math.max(0, pendingPayments.length - visiblePendingPayments.length);
  const pendingClaimTotal = useMemo(() => totalPendingUsd, [totalPendingUsd]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadClaimData(accessToken);
  }, [accessToken, user]);

  async function loadClaimData(token: string) {
    setLoading(true);

    try {
      const pendingResult = await apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number }>("/api/payment/pending", token);
      setPendingPayments(pendingResult.payments);
      setTotalPendingUsd(pendingResult.totalPendingUsd);
      setError(null);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : "Could not load claim screen";
      setError(nextError);
      showToast(nextError);
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Claim"
      subtitle="Review every incoming payment waiting in escrow and continue into the claim flow when you are ready."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {notice ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Pending claims</h2>
              <p className="text-sm text-white/48">Incoming transfers waiting for your OTP confirmation.</p>
            </div>
            {!loading && pendingPayments.length > 0 ? (
              <div className="rounded-[18px] border border-[#58f2b1]/14 bg-[#58f2b1]/7 px-3 py-2 text-right">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[#7dffd9]/70">Unclaimed</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {formatUsd(pendingClaimTotal)}
                </div>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-5">
              <SectionLoader label="Loading claims..." />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/46">No pending claims right now.</div>
          ) : (
            <div className="space-y-3">
              {visiblePendingPayments.map((payment) => (
                <Link key={payment.id} href={`/claim/${payment.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4 transition hover:border-white/12 hover:bg-black/35">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="truncate text-sm text-white/54">
                      {payment.sender_display_name_snapshot} - {payment.reference_code}
                    </div>
                    <div className="mt-1 text-[0.72rem] text-white/34">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-white/82">Open</span>
                </Link>
              ))}

              {hiddenPendingCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setPendingModalOpen(true)}
                  className="w-full rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/76 transition hover:bg-white/[0.05]"
                >
                  View {hiddenPendingCount} more pending {hiddenPendingCount === 1 ? "claim" : "claims"}
                </button>
              ) : null}
            </div>
          )}
        </section>
      </section>

      {pendingModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setPendingModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">All pending claims</h2>
                <p className="text-sm text-white/48">Open any payment below to review the full details and continue the OTP release flow.</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingModalOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/72"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {pendingPayments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/claim/${payment.id}`}
                  onClick={() => setPendingModalOpen(false)}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4 transition hover:border-white/12 hover:bg-black/35"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="truncate text-sm text-white/54">
                      {payment.sender_display_name_snapshot} - {payment.reference_code}
                    </div>
                    <div className="mt-1 text-[0.72rem] text-white/34">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-white/82">Open</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
