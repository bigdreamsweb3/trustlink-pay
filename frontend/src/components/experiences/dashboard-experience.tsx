"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { ClaimIcon, CopyIcon, EyeIcon, EyeOffIcon, InfoIcon, SendIcon, SettingsIcon } from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet, apiPost } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import type { PaymentRecord, PendingBalanceSummary, WalletTokenOption } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { getConnectedWalletAddress } from "@/src/lib/wallet";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatGuardTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DashboardExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app");
  const { showToast } = useToast();
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<WalletTokenOption[]>([]);
  const [walletTokenLoading, setWalletTokenLoading] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState<number>(0);
  const [pendingBalanceSummary, setPendingBalanceSummary] = useState<PendingBalanceSummary>({
    claimableCount: 0,
    totalPendingUsd: 0,
    byToken: [],
  });
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceInfoOpen, setBalanceInfoOpen] = useState(false);

  useEffect(() => {
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setWalletTokens([]);
      return;
    }

    const controller = new AbortController();

    async function loadWalletTokens() {
      setWalletTokenLoading(true);

      try {
        const result = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", {
          walletAddress
        });

        if (!controller.signal.aborted) {
          setWalletTokens(result.tokens.filter((token) => token.supported));
        }
      } catch {
        if (!controller.signal.aborted) {
          setWalletTokens([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setWalletTokenLoading(false);
        }
      }
    }

    void loadWalletTokens();

    return () => controller.abort();
  }, [walletAddress]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadDashboard(accessToken);
  }, [accessToken, user]);

  const stats = useMemo(
    () => [{ label: "Pending", value: pendingPayments.length.toString().padStart(2, "0") }],
    [pendingPayments.length]
  );

  const supportedBalanceUsd = useMemo(
    () => walletTokens.reduce((sum, token) => sum + (token.balanceUsd ?? 0), 0),
    [walletTokens]
  );
  const combinedVisibleBalanceUsd = useMemo(
    () => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)),
    [supportedBalanceUsd, totalPendingUsd]
  );
  const hasPendingSenderReceipt = useMemo(
    () =>
      paymentHistory.some(
        (payment) => payment.sender_user_id === user?.id && shouldPollPaymentNotification(payment.notification_status)
      ),
    [paymentHistory, user?.id]
  );

  useEffect(() => {
    if (!accessToken || !user || !hasPendingSenderReceipt) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void loadDashboard(accessToken, { background: true });
    }, DASHBOARD_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshInterval);
  }, [accessToken, hasPendingSenderReceipt, user]);

  async function loadDashboard(token: string, options?: { background?: boolean }) {
    if (!options?.background) {
      setLoading(true);
    }

    try {
      const [pendingResult, historyResult] = await Promise.all([
        apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number; summary: PendingBalanceSummary }>("/api/payment/pending", token),
        apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=30", token)
      ]);

      setPendingPayments(pendingResult.payments);
      setTotalPendingUsd(pendingResult.totalPendingUsd);
      setPendingBalanceSummary(pendingResult.summary);
      setPaymentHistory(historyResult.payments);
      setError(null);
    } catch (loadError) {
      if (!options?.background) {
        setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
      }
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  const userPhoneNumber = user.phoneNumber;

  async function handleCopyPhoneNumber() {
    if (!navigator.clipboard?.writeText) {
      const nextError = "Copy is not available on this device.";
      setError(nextError);
      showToast(nextError);
      return;
    }

    await navigator.clipboard.writeText(userPhoneNumber);
    showToast("TrustLink number copied.");
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Home"
      subtitle="Move crypto with the calm, speed, and clarity of a modern payments app."
      user={user}
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}



        <div className="tl-scanline relative overflow-hidden rounded-[30px] text-text border border-accent-border/14 bg-accent-gradient p-5 shadow-softbox">
          <div className="">
            <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="tl-balance-inset flex h-11 min-w-28.5 place-items-center items-center justify-between gap-2 rounded-2xl border border-white/8 bg-accent-deep/48 px-3 text-primary"
                  onClick={() => setBalanceVisible((current) => !current)}
                >
                  {walletTokenLoading ? (
                    <span className="tl-balance-readout text-[0.92rem] sm:text-[1rem] font-semibold">...</span>
                  ) : balanceVisible ? (
                    <span className="tl-balance-readout text-[0.96rem] sm:text-[1.04rem] font-bold">
                      {formatPaymentUsd(combinedVisibleBalanceUsd)}
                    </span>
                  ) : (
                    <span className="tl-balance-readout text-[1rem] text-center mt-1 h-fit font-bold">****</span>
                  )}

                  {balanceVisible ? <EyeOffIcon className="h-4.5 w-4.5" /> : <EyeIcon className="h-4.5 w-4.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceInfoOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-2xl bg-pop-bg text-text/40 transition button"
                  aria-label="Show balance details"
                  title="Show balance details"
                >
                  <InfoIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="text-right">
                <div className="text-[0.64rem] font-medium uppercase tracking-[0.16em] text-text/42">TL.Number</div>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <div className="text-xs font-semibold text-text/82">{userPhoneNumber}</div>
                  <button
                    type="button"
                    onClick={() => void handleCopyPhoneNumber()}
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/8 bg-white/4 text-text/52 transition button"
                    aria-label={`Copy ${userPhoneNumber}`}
                    title="Copy TrustLink number"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* <div className="mt-1 text-end text-sm font-semibold tl-text-soft">{`@${user.handle}`}</div> */}
              </div>
            </div>

            <div className="relative z-10 mt-8 flex items-end justify-between gap-4">
              <div>
                <div className="text-[0.74rem] uppercase tracking-[0.16em] text-muted">Holder</div>
                <div className="mt-1 whitespace-nowrap text-text text-base font-semibold">{user.displayName}</div>
              </div>

              <div className="text-right">
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {stats.map((stat) => (
                    <article key={stat.label} className="flex w-fit items-center gap-2 rounded-full border border-white/8 bg-accent-deep/48 px-3 py-1.5  shadow-softbox ">
                      <div className="text-[0.44rem] uppercase tracking-[0.16em] text-primary">{stat.label}</div>
                      <div className="text-[0.6rem] font-semibold tracking-[-0.04em] text-primary">{loading ? "--" : stat.value}</div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="tl-coord-text relative z-10 mt-5 flex items-center justify-between gap-3">
              <span>Grid // TL.PAY</span>
              <span>{paymentHistory[0] ? `Log ${formatGuardTimestamp(paymentHistory[0].created_at)}` : "Standby"}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[76px] items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-pop-bg px-4 py-3">
            <div className="space-y-2">
              <div className="h-2.5 w-20 rounded-full bg-pop-bg" />
              <div className="h-3.5 w-44 rounded-full bg-pop-bg" />
            </div>
            <SectionLoader label="Checking claims..." />
          </div>
        ) : pendingPayments.length > 0 ? (
          <Link
            href="/app/claim"
            className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[22px] border border-[#58f2b1]/14 bg-[#58f2b1]/7 px-4 py-3.5 transition hover:border-[#58f2b1]/24 hover:bg-[#58f2b1]/10"
          >
            <div className="min-w-0">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Pending claims</div>
              <div className="mt-1 text-sm font-medium leading-6 text-text">
                You have {pendingPayments.length} unclaimed {pendingPayments.length === 1 ? "payment" : "payments"} waiting.
              </div>
              <div className="mt-1 text-[0.78rem] text-text/52">Tap to review and continue claim flow.</div>
            </div>
            <div className="grid justify-items-end gap-2">
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-text/84">Review</span>
              <div className="text-right">
                <div className="text-[0.68rem] uppercase tracking-[0.16em] text-text/38">Value</div>
                <div className="mt-1 text-sm font-semibold text-text">{formatPaymentUsd(totalPendingUsd)}</div>
              </div>
            </div>
          </Link>
        ) : null}

        <div className="grid grid-cols-3 gap-4 px-2">
          <Link href="/app/send" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-2xl border border-accent-border bg-pop-bg bg-accent-soft text-text  shadow-softbox  transition button">
              <SendIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-text">Send</div>
          </Link>
          <Link href="/app/claim" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-2xl border border-accent-border bg-pop-bg bg-accent-soft text-text  shadow-softbox  transition button">
              <ClaimIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-text">Claim</div>
          </Link>
          <Link href="/app/settings" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-2xl border border-accent-border bg-pop-bg bg-accent-soft text-text  shadow-softbox  transition button">
              <SettingsIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-text">Settings</div>
          </Link>
        </div>

        <section className="">
          <div className="tl-panel tl-scanline relative overflow-hidden rounded-2xl pb-0 text-sm">
            <div className="p-3 sm:p-3.5">
              <div className="mt-1 mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm sm:text-base tracking-[-0.016em] text-[var(--text)]">Recent activity</h2>
                  <p className="tl-text-muted leading-5 text-xs sm:text-sm">Transfers, claims, releases, and WhatsApp delivery status.</p>
                </div>
              </div>

              <div className="tl-chain-divider mb-3">
                <span>Chain Log</span>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <>
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-surface/1  
                      -mx-4.5 px-3 py-3">
                        <div className="h-12 w-12 rounded-[18px] bg-pop-bg" />
                        <div className="space-y-2">
                          <div className="h-3.5 w-24 rounded-full bg-pop-bg" />
                          <div className="h-3 w-36 rounded-full bg-pop-bg" />
                          <div className="h-2.5 w-20 rounded-full bg-pop-bg" />
                        </div>
                        <div className="justify-self-end space-y-2">
                          <div className="h-6 w-16 rounded-full bg-pop-bg" />
                          <div className="h-6 w-12 rounded-full bg-pop-bg" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : paymentHistory.length === 0 ? (
                  <div className="tl-field rounded-[16px] px-4 py-5 text-sm tl-text-muted">No transfer activity yet.</div>
                ) : (
                  paymentHistory.slice(0, 10).map((payment) => (
                    <PaymentActivityCard
                      key={payment.id}
                      payment={payment}
                      currentUserId={user.id}
                      onClick={(paymentId) => router.push(`/app/activity/${paymentId}`)}
                    />
                  ))
                )}
              </div>

              {!loading ? (
                <Link
                  href="/app/activity"
                  className="tl-button-secondary mt-4 block w-full rounded-2xl px-4 py-3 text-center text-sm font-medium transition button"
                >
                  View all activity
                </Link>
              ) : null}
            </div>
          </div>

        </section>
      </section>

      {balanceInfoOpen ? (
        <div className="tl-overlay fixed inset-0 z-50 grid place-items-end md:place-items-center" onClick={() => setBalanceInfoOpen(false)}>
          <div
            className="tl-modal w-full rounded-t-[28px] px-5 pb-6 pt-5 md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Balance details</h2>
                <p className="tl-text-muted text-sm">Your total combines what is already spendable and what is still waiting in escrow.</p>
              </div>
              <button
                type="button"
                onClick={() => setBalanceInfoOpen(false)}
                className="tl-button-secondary rounded-full px-3 py-2 text-xs font-medium"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="tl-field rounded-[22px] px-4 py-4">
                <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Total balance</div>
                <div className="mt-2 text-base font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(combinedVisibleBalanceUsd) : "****"}</div>
              </div>

              <div className="tl-field rounded-[22px] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Connected wallet</div>
                    <div className="mt-2 text-base font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(supportedBalanceUsd) : "****"}</div>
                  </div>
                  <div className="tl-text-muted text-right text-[0.76rem]">
                    {walletAddress ? shortenAddress(walletAddress) : "Not connected"}
                  </div>
                </div>
              </div>

              <div className="tl-field rounded-[22px] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Unclaimed escrow</div>
                    <div className="mt-2 text-base font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(totalPendingUsd) : "****"}</div>
                  </div>
                  <div className="tl-text-muted text-right text-[0.76rem]">
                    {pendingBalanceSummary.claimableCount} {pendingBalanceSummary.claimableCount === 1 ? "payment" : "payments"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
