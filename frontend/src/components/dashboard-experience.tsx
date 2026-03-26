"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/pin-gate-modal";
import { EyeIcon, EyeOffIcon, ProfileIcon, ReceiveIcon, SendIcon } from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet, apiPost } from "@/src/lib/api";
import { formatTokenAmount, shouldPollPaymentNotification } from "@/src/lib/formatters";
import type { PaymentRecord, PendingBalanceSummary, ReceiverWallet, WalletTokenOption } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { getConnectedWalletAddress } from "@/src/lib/wallet";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function DashboardExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app");
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
  const [receiverWallets, setReceiverWallets] = useState<ReceiverWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    () => [
      { label: "Pending", value: pendingPayments.length.toString().padStart(2, "0") },
      { label: "Wallets", value: receiverWallets.length.toString().padStart(2, "0") },
      { label: "Transfers", value: paymentHistory.length.toString().padStart(2, "0") }
    ],
    [paymentHistory.length, pendingPayments.length, receiverWallets.length]
  );

  const supportedBalanceUsd = useMemo(
    () => walletTokens.reduce((sum, token) => sum + (token.balanceUsd ?? 0), 0),
    [walletTokens]
  );
  const combinedVisibleBalanceUsd = useMemo(
    () => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)),
    [supportedBalanceUsd, totalPendingUsd]
  );
  const hasAnyBalance = supportedBalanceUsd > 0 || totalPendingUsd > 0;
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
      const [walletsResult, pendingResult, historyResult] = await Promise.all([
        apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", token),
        apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number; summary: PendingBalanceSummary }>("/api/payment/pending", token),
        apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=30", token)
      ]);

      setReceiverWallets(walletsResult.wallets);
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
      title="Wallet"
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

        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.88)_0%,rgba(206,206,206,0.92)_20%,rgba(120,120,120,0.94)_42%,rgba(238,238,238,0.98)_62%,rgba(56,56,56,0.98)_100%)] p-5 text-[#050505] shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <div className="absolute right-[-20%] top-[-30%] h-44 w-44 rounded-full bg-white/45 blur-3xl" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="grid h-11 min-w-[84px] grid-cols-2 place-items-center rounded-2xl bg-black/90 pl-3 text-sm font-bold text-white"
                onClick={() => setBalanceVisible((current) => !current)}
              >
                {walletTokenLoading ? (
                  <span className="text-[0.76rem]">...</span>
                ) : balanceVisible ? (
                  formatUsd(combinedVisibleBalanceUsd)
                ) : (
                  "****"
                )}

                {balanceVisible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div>
              <span className="text-[0.76rem] font-medium uppercase tracking-[0.16em] text-black/55">
                {walletAddress
                  ? totalPendingUsd > 0
                    ? "Wallet + claimable escrow"
                    : "Ready to send"
                  : totalPendingUsd > 0
                    ? "Claimable escrow available"
                    : "Wallet not connected"}
              </span>

              <div className="mt-1 text-end text-sm font-semibold">{walletAddress ? shortenAddress(walletAddress) : `@${user.handle}`}</div>
            </div>
          </div>

          <div className="relative z-10 mt-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-[0.74rem] uppercase tracking-[0.16em] text-black/52">Holder</div>
              <div className="mt-1 whitespace-nowrap text-base font-semibold">{user.displayName}</div>
            </div>

            <div className="text-right">
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {stats.map((stat) => (
                  <article key={stat.label} className="flex w-fit items-center gap-2 rounded-full border border-white/8 bg-black/90 px-3 py-1.5">
                    <div className="text-[0.44rem] uppercase tracking-[0.16em] text-white/42">{stat.label}</div>
                    <div className="text-[0.6rem] font-semibold tracking-[-0.04em] text-white">{loading ? "--" : stat.value}</div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-2">
            <article className="rounded-[22px] border border-black/10 bg-black/12 px-4 py-3">
              <div className="text-[0.68rem] uppercase tracking-[0.16em] text-black/52">Connected wallet</div>
              <div className="mt-1 text-base font-semibold text-black">
                {balanceVisible ? formatUsd(supportedBalanceUsd) : "****"}
              </div>
              <div className="mt-1 text-[0.78rem] text-black/58">
                {walletAddress ? "Spendable balance from the wallet currently connected to TrustLink." : "Connect a wallet to send or hold spendable on-chain balance here."}
              </div>
            </article>

            <article className="rounded-[22px] border border-black/10 bg-black/12 px-4 py-3">
              <div className="text-[0.68rem] uppercase tracking-[0.16em] text-black/52">Unclaimed escrow</div>
              <div className="mt-1 text-base font-semibold text-black">
                {balanceVisible ? formatUsd(totalPendingUsd) : "****"}
              </div>
              <div className="mt-1 text-[0.78rem] text-black/58">
                {pendingBalanceSummary.claimableCount > 0
                  ? `${pendingBalanceSummary.claimableCount} incoming ${pendingBalanceSummary.claimableCount === 1 ? "payment is" : "payments are"} still claimable from escrow.`
                  : "No unclaimed incoming funds are linked to this account right now."}
              </div>
            </article>
          </div>
        </div>

        {!loading && hasAnyBalance ? (
          <section className="rounded-[24px] border border-white/8 bg-white/5 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/72">Balance breakdown</h2>
                <p className="mt-1 text-sm text-white/48">
                  Your total balance combines connected-wallet funds and any incoming funds still waiting in escrow.
                </p>
              </div>
              <div className="text-right">
                <div className="text-[0.68rem] uppercase tracking-[0.16em] text-white/34">Total</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {balanceVisible ? formatUsd(combinedVisibleBalanceUsd) : "****"}
                </div>
              </div>
            </div>

            {pendingBalanceSummary.byToken.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {pendingBalanceSummary.byToken.map((token) => (
                  <div key={token.tokenSymbol} className="rounded-full border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-3 py-1.5">
                    <div className="text-[0.68rem] uppercase tracking-[0.16em] text-[#7dffd9]/78">{token.tokenSymbol} in escrow</div>
                    <div className="mt-0.5 text-sm font-semibold text-white">
                      {formatTokenAmount(token.amount.toString())} {token.tokenSymbol}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {loading ? (
          <div className="flex min-h-[76px] items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-white/5 px-4 py-3">
            <div className="space-y-2">
              <div className="h-2.5 w-20 rounded-full bg-white/8" />
              <div className="h-3.5 w-44 rounded-full bg-white/8" />
            </div>
            <SectionLoader label="Checking claims..." />
          </div>
        ) : pendingPayments.length > 0 ? (
          <Link
            href="/app/receive"
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
                <div className="mt-1 text-sm font-semibold text-white">{formatUsd(totalPendingUsd)}</div>
              </div>
            </div>
          </Link>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Link href="/app/send" className="text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/7 text-white">
              <SendIcon className="h-[1.05rem] w-[1.05rem]" />
            </div>
            <div className="text-sm font-semibold text-white">Send</div>
          </Link>
          <Link href="/app/receive" className="text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/7 text-white">
              <ReceiveIcon className="h-[1.05rem] w-[1.05rem]" />
            </div>
            <div className="text-sm font-semibold text-white">Receive</div>
          </Link>
          <Link href="/app/profile" className="text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/7 text-white">
              <ProfileIcon className="h-[1.05rem] w-[1.05rem]" />
            </div>
            <div className="text-sm font-semibold text-white">Profile</div>
          </Link>
        </div>

        <section className="rounded-[28px] border border-white/8 bg-white/5 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Recent activity</h2>
              <p className="text-sm text-white/46">Transfers, claims, releases, and WhatsApp delivery status.</p>
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
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/46">No transfer activity yet.</div>
            ) : (
              paymentHistory.slice(0, 10).map((payment) => {
                const isSend = payment.sender_user_id === user.id;
                const counterparty = isSend
                  ? `To ${payment.receiver_phone}`
                  : `From ${payment.sender_display_name_snapshot}`;

                return (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => router.push(`/app/activity/${payment.id}`)}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/25 px-3 py-3 text-left transition hover:border-white/12 hover:bg-black/35"
                  >
                    <div className={`grid h-12 w-12 place-items-center rounded-[18px] text-[0.68rem] font-bold tracking-[0.14em] ${isSend ? "bg-[#16283a] text-[#99cfff]" : "bg-[#0f261d] text-[#79ffcf]"}`}>
                      {isSend ? "OUT" : "IN"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {formatTokenAmount(payment.amount)} {payment.token_symbol}
                      </div>
                      <div className="truncate text-sm text-white/50">
                        {counterparty} - {payment.reference_code}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.72rem]">
                        <span className="text-white/34">{formatShortDate(payment.created_at)}</span>
                        {isSend ? <PaymentNotificationReceipt status={payment.notification_status} /> : null}
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium capitalize ${payment.status === "accepted" ? "bg-[#0f261d] text-[#79ffcf]" : payment.status === "pending" ? "bg-[#2a2412] text-[#f3c96b]" : "bg-[#321516] text-[#ff9c9c]"}`}>
                        {payment.status}
                      </span>
                      <span className="text-[0.72rem] text-white/46">{formatUsd(payment.amount_usd)}</span>
                      <span className="text-[0.72rem] font-medium text-white/70">Open</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {!loading ? (
            <Link
              href="/app/activity"
              className="mt-4 block w-full rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium text-white/76 transition hover:bg-white/[0.05]"
            >
              View all activity
            </Link>
          ) : null}
        </section>
      </section>
    </AppMobileShell>
  );
}





