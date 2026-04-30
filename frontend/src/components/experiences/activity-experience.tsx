"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import type { PaymentRecord } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

type ActivityFilter = "all" | "transfers" | "claims" | "releases";
const ACTIVITY_REFRESH_INTERVAL_MS = 20_000;

export function ActivityExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/activity");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => { if (!accessToken || !user) return; void loadActivity(accessToken); }, [accessToken, user]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const isSend = p.sender_user_id === user?.id;
        if (filter === "all") return true;
      if (filter === "transfers") return isSend;
      if (filter === "claims") return !isSend && p.status === "locked";
      if (filter === "releases") return !isSend && p.status === "claimed";
      return true;
    });
  }, [filter, payments, user?.id]);

  const visiblePayments = filteredPayments.slice(0, visibleCount);
  const canLoadMore = filteredPayments.length > visiblePayments.length;
  const hasPendingSenderReceipt = useMemo(() => payments.some((p) => p.sender_user_id === user?.id && shouldPollPaymentNotification(p.notification_status)), [payments, user?.id]);

  useEffect(() => { if (!accessToken || !user || !hasPendingSenderReceipt) return; const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void loadActivity(accessToken, { background: true }); }, ACTIVITY_REFRESH_INTERVAL_MS); return () => window.clearInterval(interval); }, [accessToken, hasPendingSenderReceipt, user]);

  async function loadActivity(token: string, options?: { background?: boolean }) { if (!options?.background) setLoading(true); try { const r = await apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=50", token); setPayments(r.payments); setError(null); } catch (e) { if (!options?.background) setError(e instanceof Error ? e.message : "Could not load activity"); } finally { if (!options?.background) setLoading(false); } }

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell currentTab="home" title="Activity" subtitle="Review transfers, claims, releases, and WhatsApp receipt updates." user={user} showBackButton backHref="/app"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {error ? <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">{error}</div> : null}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ["all", "All"],
            ["transfers", "Transfers"],
            ["claims", "Claims"],
            ["releases", "Releases"]
          ] as const).map(([value, label]) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { setFilter(value); setVisibleCount(10); }}
                className={`rounded-[12px] px-3 py-1.5 text-[0.74rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.96] ${active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-deep)] dark:text-[var(--accent)]"
                  : "bg-[var(--surface-soft)] text-[var(--text-soft)]"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Activity list */}
        <div className="space-y-2">
          {loading ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3">
                  <div className="h-10 w-10 animate-pulse rounded-[14px] bg-[var(--surface-soft)]" />
                  <div className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    <div className="h-2.5 w-36 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    <div className="h-2 w-20 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  </div>
                  <div className="justify-self-end space-y-2">
                    <div className="h-5 w-14 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    <div className="h-3 w-12 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  </div>
                </div>
              ))}
            </>
          ) : visiblePayments.length === 0 ? (
            <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">No activity for this filter yet.</div>
          ) : (
            visiblePayments.map((payment) => (
              <PaymentActivityCard
                key={payment.id}
                payment={payment}
                currentUserId={user.id}
                onClick={(paymentId) => router.push(`/app/activity/${paymentId}`)}
              />
            ))
          )}
        </div>

        {/* Load more */}
        {!loading && canLoadMore ? (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 10)}
            className="tl-field group w-full flex items-center justify-center rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
          >
            Load more activity
          </button>
        ) : null}

        {loading ? (
          <div className="mt-2"><SectionLoader label="Loading activity..." /></div>
        ) : null}
      </section>
    </AppMobileShell>
  );
}
