"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { ClaimIcon, EyeIcon, EyeOffIcon, InfoIcon, ReceiveIcon, SendIcon, SettingsIcon, WalletIcon } from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet, apiPost } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import type { PaymentRecord, PendingBalanceSummary, WalletTokenOption } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { getConnectedWalletAddress, type DetectedWallet } from "@/src/lib/wallet";
import { connectTrustLinkWallet, getWalletConnectionErrorMessage, getWalletsForConnection } from "@/src/lib/wallet-actions";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function DashboardExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app");
  const { showToast } = useToast();
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
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

  async function handleConnectWallet() {
    setError(null);

    try {
      const wallets = getWalletsForConnection();
      setAvailableWallets(wallets);
      setWalletPickerOpen(true);
    } catch (walletError) {
      const nextError = getWalletConnectionErrorMessage(walletError);
      setError(nextError);
      showToast("No Solana wallet detected on this browser.");
    }
  }

  async function handleWalletSelect(walletId: string) {
    setConnectingWalletId(walletId);
    setError(null);

    try {
      const session = await connectTrustLinkWallet(walletId);
      setWalletAddress(session.address);
      setWalletPickerOpen(false);
      showToast(`${session.walletName} connected successfully.`);
    } catch (connectError) {
      setError(getWalletConnectionErrorMessage(connectError));
    } finally {
      setConnectingWalletId(null);
    }
  }

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

        <div className="relative overflow-hidden rounded-[30px] border border-[#76ffd8]/14 bg-[radial-gradient(circle_at_center,rgba(118,255,216,0.6),rgba(118,255,216,0.5)_20%,rgba(90,255,216,0.4)_42%,rgba(118,255,216,0.3)_62%,rgba(92,210,235,0.2)_100%)] p-5 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-[#76ffd8]/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex h-11 min-w-[114px] place-items-center items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/72 px-3 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                onClick={() => setBalanceVisible((current) => !current)}
              >
                {walletTokenLoading ? (
                  <span className="text-[0.76rem]">...</span>
                ) : balanceVisible ? (
                  formatPaymentUsd(combinedVisibleBalanceUsd)
                ) : (
                  <span className="text-[1.13rem] text-center mt-2 h-fit">****</span>
                )}

                {balanceVisible ? <EyeOffIcon className="h-4.5 w-4.5" /> : <EyeIcon className="h-4.5 w-4.5" />}
              </button>
              <button
                type="button"
                onClick={() => setBalanceInfoOpen(true)}
                className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.06] text-white/76 transition hover:bg-white/[0.1] button"
                aria-label="Show balance details"
                title="Show balance details"
              >
                <InfoIcon className="h-4 w-4" />
              </button>
            </div>

            <div>
              <span className="text-[0.76rem] font-medium uppercase tracking-[0.16em] text-white/48 text-nowrap whitespace-nowrap flex justify-end">
                {walletAddress
                  ? totalPendingUsd > 0
                    ? <div className="flex items-center gap-1.5 whitespace-nowrap text-[#8fffe0]"><WalletIcon size={16} className="opacity-90" />  <div className="mt-1 text-end text-sm font-semibold text-white/42">{walletAddress ? shortenAddress(walletAddress) : `loading...`}</div></div>
                    : <div className="flex items-center gap-1.5 whitespace-nowrap text-[#8fffe0]"><WalletIcon size={16} className="opacity-90" /> <div className="mt-1 text-end text-sm font-semibold text-white/42">{walletAddress ? shortenAddress(walletAddress) : `loading...`}</div> </div>
                  : totalPendingUsd > 0
                    ? "Claimable escrow available"
                    : <button type="button" onClick={() => void handleConnectWallet()} className="flex items-center gap-1.5 whitespace-nowrap text-[#8fffe0] text-sm py-1 button"><WalletIcon size={16} className="opacity-90" /> Connect</button>}
              </span>

              <div className="mt-1 text-end text-sm font-semibold text-[#76ffd8]">{`@${user.handle}`}</div>
            </div>
          </div>

          <div className="relative z-10 mt-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-[0.74rem] uppercase tracking-[0.16em] text-white/42">Holder</div>
              <div className="mt-1 whitespace-nowrap text-base font-semibold">{user.displayName}</div>
            </div>

            <div className="text-right">
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {stats.map((stat) => (
                  <article key={stat.label} className="flex w-fit items-center gap-2 rounded-full border border-white/8 bg-black/72 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="text-[0.44rem] uppercase tracking-[0.16em] text-white/42">{stat.label}</div>
                    <div className="text-[0.6rem] font-semibold tracking-[-0.04em] text-white">{loading ? "--" : stat.value}</div>
                  </article>
                ))}
              </div>
            </div>
          </div>

        </div>

        {loading ? (
          <div className="flex min-h-[76px] items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-[#111B1C]/5 px-4 py-3">
            <div className="space-y-2">
              <div className="h-2.5 w-20 rounded-full bg-white/8" />
              <div className="h-3.5 w-44 rounded-full bg-white/8" />
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
              <div className="mt-1 text-sm font-medium leading-6 text-white">
                You have {pendingPayments.length} unclaimed {pendingPayments.length === 1 ? "payment" : "payments"} waiting.
              </div>
              <div className="mt-1 text-[0.78rem] text-white/52">Tap to review and continue claim flow.</div>
            </div>
            <div className="grid justify-items-end gap-2">
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-white/84">Review</span>
              <div className="text-right">
                <div className="text-[0.68rem] uppercase tracking-[0.16em] text-white/38">Value</div>
                <div className="mt-1 text-sm font-semibold text-white">{formatPaymentUsd(totalPendingUsd)}</div>
              </div>
            </div>
          </Link>
        ) : null}

        <div className="grid grid-cols-3 gap-4 px-2">
          <Link href="/app/send" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-[16px] border border-[#76ffd8]/22 bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.08),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.025)_100%)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#76ffd8]/34 hover:bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.11),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] button">
              <SendIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-white">Send</div>
          </Link>
          <Link href="/app/claim" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-[16px] border border-[#76ffd8]/22 bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.08),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.025)_100%)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#76ffd8]/34 hover:bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.11),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] button">
              <ClaimIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-white">Claim</div>
          </Link>
          <Link href="/app/settings" className="text-center">
            <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-[16px] border border-[#76ffd8]/22 bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.08),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.025)_100%)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#76ffd8]/34 hover:bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.11),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] button">
              <SettingsIcon size={22} className="text-current" />
            </div>
            <div className="text-[0.92rem] font-semibold tracking-[-0.02em] text-white">Settings</div>
          </Link>
        </div>

        <section className="rounded-[28px] border border-[#76ffd8]/20 bg-[#111B1C]/5 px-3 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="mt-1 mb-3 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <h2 className="font-semibold text-sm sm:text-base tracking-[-0.016em] text-white">Recent activity</h2>
              <p className="leading-5 text-xs sm:text-sm text-white/50">Transfers, claims, releases, and WhatsApp delivery status.</p>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/25 px-3 py-3">
                    <div className="h-12 w-12 rounded-[18px] bg-white/8" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-24 rounded-full bg-white/8" />
                      <div className="h-3 w-36 rounded-full bg-white/8" />
                      <div className="h-2.5 w-20 rounded-full bg-white/8" />
                    </div>
                    <div className="justify-self-end space-y-2">
                      <div className="h-6 w-16 rounded-full bg-white/8" />
                      <div className="h-6 w-12 rounded-full bg-white/8" />
                    </div>
                  </div>
                ))}
              </>
            ) : paymentHistory.length === 0 ? (
              <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-white/46">No transfer activity yet.</div>
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
              className="mt-4 block w-full rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium text-white/80 transition hover:bg-white/[0.05]"
            >
              View all activity
            </Link>
          ) : null}
        </section>
      </section>

      {balanceInfoOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setBalanceInfoOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#111B1C]/5 px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Balance details</h2>
                <p className="text-sm text-white/48">Your total combines what is already spendable and what is still waiting in escrow.</p>
              </div>
              <button
                type="button"
                onClick={() => setBalanceInfoOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/72"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Total balance</div>
                <div className="mt-2 text-base font-semibold text-white">{balanceVisible ? formatPaymentUsd(combinedVisibleBalanceUsd) : "****"}</div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Connected wallet</div>
                    <div className="mt-2 text-base font-semibold text-white">{balanceVisible ? formatPaymentUsd(supportedBalanceUsd) : "****"}</div>
                  </div>
                  <div className="text-right text-[0.76rem] text-white/42">
                    {walletAddress ? shortenAddress(walletAddress) : "Not connected"}
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Unclaimed escrow</div>
                    <div className="mt-2 text-base font-semibold text-white">{balanceVisible ? formatPaymentUsd(totalPendingUsd) : "****"}</div>
                  </div>
                  <div className="text-right text-[0.76rem] text-white/42">
                    {pendingBalanceSummary.claimableCount} {pendingBalanceSummary.claimableCount === 1 ? "payment" : "payments"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <WalletPickerModal
        open={walletPickerOpen}
        wallets={availableWallets}
        connectingWalletId={connectingWalletId}
        onClose={() => {
          if (!connectingWalletId) {
            setWalletPickerOpen(false);
          }
        }}
        onSelect={(walletId) => void handleWalletSelect(walletId)}
      />
    </AppMobileShell>
  );
}
