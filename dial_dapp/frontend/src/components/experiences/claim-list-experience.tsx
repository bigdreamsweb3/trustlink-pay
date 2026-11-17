"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import type { PaymentRecord } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function claimStatusLabel(payment: PaymentRecord) {
  if (payment.tsn?.intentStatus === "failed" || payment.tsn?.intentStatus === "canceled") return "Settlement retry";
  if (payment.tsn?.intentStatus === "onchain") return "Settlement pending";
  return "Settlement available";
}

function claimStatusTone(payment: PaymentRecord) {
  if (payment.tsn?.intentStatus === "failed" || payment.tsn?.intentStatus === "canceled") {
    return "border-[#f3c96b]/20 bg-[#f3c96b]/10 text-[#f3c96b]";
  }
  if (payment.tsn?.intentStatus === "onchain") {
    return "border-[#4ae8d0]/16 bg-[#4ae8d0]/10 text-[#4ae8d0]";
  }
  return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]";
}

export function ClaimListExperience() {
  const {
    hydrated,
    accessToken,
    user,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession("/app/claim");
  const { showToast } = useToast();
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) return;

    async function loadClaimData() {
      setLoading(true);
      try {
        const result = await apiGet<{
          payments: PaymentRecord[];
          totalPendingUsd: number;
        }>("/api/payment/pending", accessToken ?? undefined);
        setPendingPayments(result.payments);
        setTotalPendingUsd(result.totalPendingUsd);
        setError(null);
      } catch (claimError) {
        const message =
          claimError instanceof Error
            ? claimError.message
            : "Could not load claims";
        setError(message);
        showToast(message);
      } finally {
        setLoading(false);
      }
    }

    void loadClaimData();
  }, [accessToken, showToast, user]);

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell
      currentTab="claim"
      title="Claim"
      subtitle="Review incoming payments waiting for settlement authorization."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal
            pendingAuth={pendingAuth}
            user={user}
            onAuthenticated={completePendingAuth}
            onSignOut={logout}
          />
        ) : null
      }
    >
      <section className="space-y-5">
        {error ? (
          <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.78rem] text-[#ffb1b1]">
            {error}
          </div>
        ) : null}

        {!loading && pendingPayments.length > 0 ? (
          <div className="tl-panel-header tl-field rounded-[22px] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
                Unclaimed
              </div>
              <div className="text-[0.62rem] font-medium text-[var(--text-soft)]">
                {pendingPayments.length}{" "}
                {pendingPayments.length === 1 ? "payment" : "payments"}
              </div>
            </div>
            <div className="mt-2.5 text-[1.4rem] font-bold tracking-tight text-[var(--text)]">
              {formatUsd(totalPendingUsd)}
            </div>
            <div className="mt-1.5 h-1 w-8 rounded-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" />
          </div>
        ) : null}

        <div>
          <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">
            Pending claims
          </div>

          {loading ? (
            <div className="tl-panel-header tl-field rounded-[22px] px-5 py-8">
              <SectionLoader label="Loading claims..." />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="tl-panel-header tl-field rounded-[18px] px-4 py-5 text-center text-[0.78rem] text-[var(--text-faint)]">
              No pending claims right now.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingPayments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/claim/${payment.id}`}
                  className="tl-panel-header tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.78rem] font-semibold text-[var(--text)]">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="mt-0.5 truncate text-[0.74rem] text-[var(--text-soft)]">
                      {payment.sender_display_name_snapshot} ·{" "}
                      {payment.reference_code}
                    </div>
                    <div className="mt-0.5 text-[0.64rem] text-[var(--text-faint)]">
                      {formatShortDate(payment.created_at)}
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-medium ${claimStatusTone(payment)}`}
                    >
                      {claimStatusLabel(payment)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppMobileShell>
  );
}
