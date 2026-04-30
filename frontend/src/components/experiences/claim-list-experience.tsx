"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { PaymentRecord } from "@/src/lib/types";

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function ClaimListExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/claim");
  const { showToast } = useToast();
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visiblePendingPayments = pendingPayments.slice(0, 2);
  const hiddenPendingCount = Math.max(0, pendingPayments.length - visiblePendingPayments.length);

  useEffect(() => { if (!accessToken || !user) return; void loadClaimData(accessToken); }, [accessToken, user]);

  async function loadClaimData(token: string) { setLoading(true); try { const r = await apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number }>("/api/payment/pending", token); setPendingPayments(r.payments); setTotalPendingUsd(r.totalPendingUsd); setError(null); } catch (e) { const msg = e instanceof Error ? e.message : "Could not load claims"; setError(msg); showToast(msg); } finally { setLoading(false); } }

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell currentTab="claim" title="Claim" subtitle="Review incoming payments waiting in escrow." user={user} showBackButton backHref="/app"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {error ? <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">{error}</div> : null}

        {/* Summary card */}
        {!loading && pendingPayments.length > 0 ? (
          <div className="tl-field rounded-[22px] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Unclaimed</div>
              <div className="text-[0.68rem] font-medium text-[var(--text-soft)]">{pendingPayments.length} {pendingPayments.length === 1 ? "payment" : "payments"}</div>
            </div>
            <div className="mt-2.5 text-[1.4rem] font-bold tracking-tight text-[var(--text)]">{formatUsd(totalPendingUsd)}</div>
            <div className="mt-1.5 h-1 w-8 rounded-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" />
          </div>
        ) : null}

        {/* Claim list */}
        <div>
          <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Pending claims</div>

          {loading ? (
            <div className="tl-field rounded-[22px] px-5 py-8"><SectionLoader label="Loading claims..." /></div>
          ) : pendingPayments.length === 0 ? (
            <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">No pending claims right now.</div>
          ) : (
            <div className="space-y-2">
              {visiblePendingPayments.map((payment) => (
                <Link key={payment.id} href={`/claim/${payment.id}`}
                  className="tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.84rem] font-semibold text-[var(--text)]">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="mt-0.5 truncate text-[0.74rem] text-[var(--text-soft)]">
                      {payment.sender_display_name_snapshot} · {payment.reference_code}
                    </div>
                    <div className="mt-0.5 text-[0.64rem] text-[var(--text-faint)]">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}

              {hiddenPendingCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setPendingModalOpen(true)}
                  className="tl-field group w-full flex items-center justify-center rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
                >
                  View {hiddenPendingCount} more {hiddenPendingCount === 1 ? "claim" : "claims"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* All claims modal */}
      {pendingModalOpen ? (
        <div className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center" onClick={() => setPendingModalOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">All pending claims</h2>
                <p className="tl-text-muted mt-1 text-[0.82rem] leading-relaxed">Tap any payment to review and claim.</p>
              </div>
              <button type="button" onClick={() => setPendingModalOpen(false)} className="tl-button-secondary shrink-0 rounded-full px-3.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:opacity-90 active:scale-[0.97]">Close</button>
            </div>
            <div className="space-y-2">
              {pendingPayments.map((payment) => (
                <Link key={payment.id} href={`/claim/${payment.id}`} onClick={() => setPendingModalOpen(false)}
                  className="tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.84rem] font-semibold text-[var(--text)]">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="mt-0.5 truncate text-[0.74rem] text-[var(--text-soft)]">
                      {payment.sender_display_name_snapshot} · {payment.reference_code}
                    </div>
                    <div className="mt-0.5 text-[0.64rem] text-[var(--text-faint)]">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
