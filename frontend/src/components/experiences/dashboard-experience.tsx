"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { ClaimIcon, CopyIcon, EyeIcon, EyeOffIcon, InfoIcon, SendIcon } from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import type { PaymentRecord, PendingBalanceSummary, WalletTokenOption } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { getConnectedWalletAddress } from "@/src/lib/wallet";
import { ChevronRight, Landmark, ArrowUpRight, ArrowDownLeft, Wallet } from "lucide-react";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

function splitPhoneDisplay(phone: string): { countryCode: string; localNumber: string } {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) return { countryCode: "", localNumber: phone };
  const digits = cleaned.slice(1);
  let ccLen = 1;
  const oneDigitCodes = ["1", "7"];
  const twoDigitCodes = ["20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98"];
  if (oneDigitCodes.includes(digits.slice(0, 1))) ccLen = 1;
  else if (twoDigitCodes.includes(digits.slice(0, 2))) ccLen = 2;
  else ccLen = 3;
  const countryCode = "+" + digits.slice(0, ccLen);
  const local = digits.slice(ccLen);
  const localFormatted = local.length === 10
    ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
    : local.length === 9
      ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
      : local.length === 8
        ? `${local.slice(0, 4)} ${local.slice(4)}`
        : local.replace(/(\d{3})(?=\d)/g, "$1 ");
  return { countryCode, localNumber: localFormatted };
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
  const [pendingBalanceSummary, setPendingBalanceSummary] = useState<PendingBalanceSummary>({ claimableCount: 0, totalPendingUsd: 0, byToken: [] });
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceInfoOpen, setBalanceInfoOpen] = useState(false);

  useEffect(() => { setWalletAddress(getConnectedWalletAddress()); }, []);
  useEffect(() => { if (!walletAddress) { setWalletTokens([]); return; } const ctrl = new AbortController(); async function load() { setWalletTokenLoading(true); try { const r = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", { walletAddress }); if (!ctrl.signal.aborted) setWalletTokens(r.tokens.filter((t) => t.supported)); } catch { if (!ctrl.signal.aborted) setWalletTokens([]); } finally { if (!ctrl.signal.aborted) setWalletTokenLoading(false); } } void load(); return () => ctrl.abort(); }, [walletAddress]);
  useEffect(() => { if (!accessToken || !user) return; void loadDashboard(accessToken); }, [accessToken, user]);

  const supportedBalanceUsd = useMemo(() => walletTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0), [walletTokens]);
  const combinedVisibleBalanceUsd = useMemo(() => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)), [supportedBalanceUsd, totalPendingUsd]);
  const hasPendingSenderReceipt = useMemo(() => paymentHistory.some((p) => p.sender_user_id === user?.id && shouldPollPaymentNotification(p.notification_status)), [paymentHistory, user?.id]);
  const sentCount = useMemo(() => paymentHistory.filter((p) => p.sender_user_id === user?.id).length, [paymentHistory, user?.id]);
  const receivedCount = useMemo(() => paymentHistory.filter((p) => p.sender_user_id !== user?.id).length, [paymentHistory, user?.id]);

  useEffect(() => { if (!accessToken || !user || !hasPendingSenderReceipt) return; const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void loadDashboard(accessToken, { background: true }); }, DASHBOARD_REFRESH_INTERVAL_MS); return () => window.clearInterval(interval); }, [accessToken, hasPendingSenderReceipt, user]);

  async function loadDashboard(token: string, options?: { background?: boolean }) { if (!options?.background) setLoading(true); try { const [pr, hr] = await Promise.all([apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number; summary: PendingBalanceSummary }>("/api/payment/pending", token), apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=30", token)]); setPendingPayments(pr.payments); setTotalPendingUsd(pr.totalPendingUsd); setPendingBalanceSummary(pr.summary); setPaymentHistory(hr.payments); setError(null); } catch (e) { if (!options?.background) setError(e instanceof Error ? e.message : "Could not load dashboard"); } finally { if (!options?.background) setLoading(false); } }

  if (!hydrated || !user) return null;

  const userPhoneNumber = user.phoneNumber;
  const { countryCode, localNumber } = splitPhoneDisplay(userPhoneNumber);

  async function handleCopyPhoneNumber() { if (!navigator.clipboard?.writeText) { setError("Copy not available."); showToast("Copy not available."); return; } await navigator.clipboard.writeText(userPhoneNumber); showToast("TrustLink number copied."); }

  return (
    <AppMobileShell currentTab="home" title="Home" subtitle="Move crypto with the calm, speed, and clarity of a modern payments app." user={user}
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      {/* ═══════════════════════════════════════════════════════
                DESKTOP: 2-col grid (balance left, info right)
                MOBILE:  single column stack
                ═══════════════════════════════════════════════════════ */}
      <div className="grid gap-5 md:grid-cols-[1.15fr_0.85fr] md:items-start">

        {/* ─── LEFT COLUMN: Balance + Actions ─── */}
        <div className="space-y-4">

          {/* BALANCE HERO CARD */}
          <div className="tl-scanline relative overflow-hidden rounded-[28px] text-text border border-accent-border bg-accent-gradient p-5 shadow-softbox">
            <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-accent/8 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />

            {/* Row 1: Balance + Phone number */}
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-text/36">Balance</div>
                  <button type="button" onClick={() => setBalanceVisible((c) => !c)}
                    className="text-text/36 transition-colors hover:text-text/56 cursor-pointer active:scale-[0.9]"
                    aria-label={balanceVisible ? "Hide balance" : "Show balance"}
                  >
                    {balanceVisible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2.5">
                  {walletTokenLoading ? (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">...</div>
                  ) : balanceVisible ? (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">{formatPaymentUsd(combinedVisibleBalanceUsd)}</div>
                  ) : (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">****</div>
                  )}
                  <button type="button" onClick={() => setBalanceInfoOpen(true)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/4 text-text/36 transition-colors hover:text-text/56 cursor-pointer active:scale-[0.9]"
                    aria-label="Balance details"
                  >
                    <InfoIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {balanceVisible && totalPendingUsd > 0 ? (
                  <div className="mt-0.5 text-[0.68rem] text-text/36">+ {formatPaymentUsd(totalPendingUsd)} in escrow</div>
                ) : null}
              </div>

              <button type="button" onClick={() => void handleCopyPhoneNumber()}
                className="flex flex-col items-end gap-1.5 group cursor-pointer active:scale-[0.97] transition-transform"
                aria-label={`Copy ${userPhoneNumber}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="rounded-[6px] border border-white/6 bg-white/4 px-1.5 py-0.5 text-[0.66rem] font-semibold text-text/50">{countryCode}</span>
                  <span className="text-[0.84rem] font-bold tracking-wide text-text/78">{localNumber}</span>
                  <CopyIcon className="h-3 w-3 text-text/24 transition-colors group-hover:text-text/44" />
                </div>
              </button>
            </div>

            {/* Row 2: Send/Claim + Pending */}
            <div className="relative z-10 mt-6 flex items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <Link href="/app/send" className="group flex flex-col items-center gap-1.5 cursor-pointer">
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-white/6 bg-white/4 transition-all duration-200 group-hover:bg-white/8 group-active:scale-[0.93]">
                    <SendIcon size={18} className="text-text" />
                  </div>
                  <span className="text-[0.62rem] font-medium text-text/50">Send</span>
                </Link>
                <Link href="/app/claim" className="group flex flex-col items-center gap-1.5 cursor-pointer">
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-white/6 bg-white/4 transition-all duration-200 group-hover:bg-white/8 group-active:scale-[0.93]">
                    <ClaimIcon size={18} className="text-text" />
                  </div>
                  <span className="text-[0.62rem] font-medium text-text/50">Claim</span>
                </Link>
              </div>

              <div className="flex flex-col items-end gap-2 justify-end">
                <div className="w-fit flex items-center gap-1.5 rounded-[14px] border border-white/5 bg-white/3 px-3 py-2">
                  <Landmark className="h-3.5 w-3.5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
                  <span className="text-[0.76rem] font-semibold text-text">Pending</span>
                  <span className="text-[0.62rem] text-text/36">{loading ? "\u2014" : pendingPayments.length.toString().padStart(2, "0")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── STATS ROW (desktop: visible, mobile: below right col) ─── */}
          <div className="hidden md:grid grid-cols-3 gap-3">
            <div className="tl-field rounded-[16px] px-4 py-3.5">
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">Sent</div>
              <div className="mt-1 flex items-center gap-2">
                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--primary-accent)]" />
                <span className="text-[1.05rem] font-bold text-[var(--text)]">{loading ? "\u2014" : sentCount}</span>
              </div>
            </div>
            <div className="tl-field rounded-[16px] px-4 py-3.5">
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">Received</div>
              <div className="mt-1 flex items-center gap-2">
                <ArrowDownLeft className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span className="text-[1.05rem] font-bold text-[var(--text)]">{loading ? "\u2014" : receivedCount}</span>
              </div>
            </div>
            <div className="tl-field rounded-[16px] px-4 py-3.5">
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">Escrow</div>
              <div className="mt-1 flex items-center gap-2">
                <Landmark className="h-3.5 w-3.5 text-[var(--warning)]" />
                <span className="text-[1.05rem] font-bold text-[var(--text)]">{loading ? "\u2014" : balanceVisible ? formatPaymentUsd(totalPendingUsd) : "****"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Info Cards ─── */}
        <div className="space-y-4">

          {/* PENDING CLAIMS CARD */}
          {loading ? (
            <div className="tl-field flex min-h-[68px] items-center justify-between gap-3 rounded-[22px] px-4 py-3.5">
              <div className="space-y-2.5">
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                <div className="h-3.5 w-44 animate-pulse rounded-full bg-[var(--surface-soft)]" />
              </div>
              <SectionLoader label="Checking claims..." />
            </div>
          ) : pendingPayments.length > 0 ? (
            <Link href="/app/claim" className="tl-field group block rounded-[22px] px-4 py-4 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]">
              <div className="flex items-center justify-between">
                <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-accent/68">Pending claims</div>
                <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-[1.3rem] font-bold text-[var(--text)]">{formatPaymentUsd(totalPendingUsd)}</span>
                <span className="text-[0.76rem] text-[var(--text-faint)]">
                  {pendingPayments.length} unclaimed
                </span>
              </div>
              {/* Per-token breakdown */}
              {pendingBalanceSummary.byToken.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingBalanceSummary.byToken.map((t) => (
                    <span key={t.tokenSymbol ?? "unknown"} className="rounded-[8px] border border-accent-border bg-accent-soft px-2 py-0.5 text-[0.64rem] font-medium text-accent">
                      {t.tokenSymbol ?? "Token"}: {balanceVisible ? formatPaymentUsd(t.amountUsd ?? 0) : "****"}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ) : (
            <div className="tl-field rounded-[22px] px-4 py-4">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">Pending claims</div>
              <div className="mt-2 text-[0.82rem] text-[var(--muted)]">No pending claims</div>
            </div>
          )}

          {/* WALLET TOKENS CARD */}
          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">Wallet</div>
              {walletAddress ? (
                <span className="rounded-[6px] border border-[var(--field-border)] bg-[var(--surface-soft)] px-2 py-0.5 text-[0.62rem] font-medium text-[var(--text-faint)]">
                  {shortenAddress(walletAddress)}
                </span>
              ) : null}
            </div>

            {walletTokenLoading ? (
              <div className="space-y-3 py-2">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                      <div className="h-3 w-14 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    </div>
                    <div className="h-3.5 w-16 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  </div>
                ))}
              </div>
            ) : !walletAddress ? (
              <div className="flex items-center gap-3 rounded-[14px] bg-[var(--surface-soft)] px-3.5 py-3">
                <Wallet className="h-4 w-4 text-[var(--text-faint)]" />
                <span className="text-[0.78rem] text-[var(--muted)]">Connect a wallet to see your tokens</span>
              </div>
            ) : walletTokens.length === 0 ? (
              <div className="py-2 text-[0.78rem] text-[var(--muted)]">No supported tokens found</div>
            ) : (
              <div className="divide-y divide-[var(--field-border)]">
                {walletTokens.slice(0, 5).map((token) => (
                  <div key={token.symbol} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] text-[0.56rem] font-bold text-accent">
                        {token.symbol.slice(0, 3)}
                      </div>
                      <span className="text-[0.82rem] font-medium text-[var(--text)]">{token.symbol}</span>
                    </div>
                    <span className="text-[0.82rem] font-semibold text-[var(--text)]">
                      {balanceVisible ? formatPaymentUsd(token.balanceUsd ?? 0) : "****"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {walletAddress && walletTokens.length > 0 ? (
              <div className="mt-3 flex items-center justify-between rounded-[12px] bg-[var(--surface-soft)] px-3 py-2">
                <span className="text-[0.72rem] text-[var(--text-faint)]">Wallet total</span>
                <span className="text-[0.82rem] font-bold text-[var(--text)]">
                  {balanceVisible ? formatPaymentUsd(supportedBalanceUsd) : "****"}
                </span>
              </div>
            ) : null}
          </div>

          {/* MOBILE-ONLY STATS ROW */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            <div className="tl-field rounded-[14px] px-3 py-3 text-center">
              <ArrowUpRight className="mx-auto h-3.5 w-3.5 text-[var(--primary-accent)]" />
              <div className="mt-1 text-[0.92rem] font-bold text-[var(--text)]">{loading ? "\u2014" : sentCount}</div>
              <div className="text-[0.54rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">Sent</div>
            </div>
            <div className="tl-field rounded-[14px] px-3 py-3 text-center">
              <ArrowDownLeft className="mx-auto h-3.5 w-3.5 text-[var(--accent)]" />
              <div className="mt-1 text-[0.92rem] font-bold text-[var(--text)]">{loading ? "\u2014" : receivedCount}</div>
              <div className="text-[0.54rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">Received</div>
            </div>
            <div className="tl-field rounded-[14px] px-3 py-3 text-center">
              <Landmark className="mx-auto h-3.5 w-3.5 text-[var(--warning)]" />
              <div className="mt-1 text-[0.92rem] font-bold text-[var(--text)]">{loading ? "\u2014" : pendingPayments.length}</div>
              <div className="text-[0.54rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">Pending</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
                ACTIVITY — full width below the grid
                ═══════════════════════════════════════════════════════ */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Activity</div>
          {!loading && paymentHistory.length > 6 ? (
            <Link href="/app/activity" className="text-[0.68rem] font-medium text-accent hover:text-accent-deep transition-colors">
              View all
            </Link>
          ) : null}
        </div>

        {/* Desktop: table-like header (hidden on mobile) */}
        {!loading && paymentHistory.length > 0 ? (
          <div className="hidden md:grid md:grid-cols-[1fr_auto_auto] md:gap-4 md:px-4 md:pb-2 md:text-[0.62rem] md:font-medium md:uppercase md:tracking-[0.14em] md:text-[var(--text-faint)]">
            <span>Details</span>
            <span className="w-20 text-right">Amount</span>
            <span className="w-20 text-right">Status</span>
          </div>
        ) : null}

        <div className="space-y-2">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3">
                  <div className="h-10 w-10 animate-pulse rounded-[14px] bg-[var(--surface-soft)]" />
                  <div className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    <div className="h-2.5 w-36 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  </div>
                  <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                </div>
              ))}
            </>
          ) : paymentHistory.length === 0 ? (
            <div className="tl-field rounded-[18px] px-4 py-8 text-center">
              <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)]">
                <ArrowUpRight className="h-4 w-4 text-[var(--text-faint)]" />
              </div>
              <div className="text-[0.82rem] font-medium text-[var(--text-soft)]">No transfer activity yet</div>
              <div className="mt-1 text-[0.72rem] text-[var(--muted)]">Your transactions will appear here</div>
            </div>
          ) : (
            paymentHistory.slice(0, 6).map((payment) => (
              <PaymentActivityCard key={payment.id} payment={payment} currentUserId={user.id} onClick={(id) => router.push(`/app/activity/${id}`)} />
            ))
          )}
        </div>

        {!loading && paymentHistory.length > 0 ? (
          <Link href="/app/activity" className="tl-field group mt-2.5 flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]">
            <span className="text-[0.84rem] font-medium text-[var(--text)]">View all activity</span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>

      {/* ═══ BALANCE DETAILS MODAL ═══ */}
      {balanceInfoOpen ? (
        <div className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center" onClick={() => setBalanceInfoOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Balance details</h2>
                <p className="tl-text-muted mt-1 text-[0.82rem] leading-relaxed">Spendable balance plus funds waiting in escrow.</p>
              </div>
              <button type="button" onClick={() => setBalanceInfoOpen(false)} className="tl-button-secondary shrink-0 rounded-full px-3.5 py-2 text-xs font-medium cursor-pointer transition-colors hover:opacity-90 active:scale-[0.97]">Close</button>
            </div>
            <div className="space-y-2.5">
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Total</span>
                  <span className="text-[0.92rem] font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(combinedVisibleBalanceUsd) : "****"}</span>
                </div>
              </div>
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Wallet</span>
                  <div className="text-right">
                    <span className="block text-[0.84rem] font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(supportedBalanceUsd) : "****"}</span>
                    <span className="block text-[0.68rem] text-[var(--text-soft)]">{walletAddress ? shortenAddress(walletAddress) : "Not connected"}</span>
                  </div>
                </div>
              </div>
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Escrow</span>
                  <div className="text-right">
                    <span className="block text-[0.84rem] font-semibold text-[var(--text)]">{balanceVisible ? formatPaymentUsd(totalPendingUsd) : "****"}</span>
                    <span className="block text-[0.68rem] text-[var(--text-soft)]">{pendingBalanceSummary.claimableCount} {pendingBalanceSummary.claimableCount === 1 ? "payment" : "payments"}</span>
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
