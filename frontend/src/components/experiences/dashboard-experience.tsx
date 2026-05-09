"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { FloatingGuidanceOverlay } from "@/src/components/floating-guidance-overlay";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { ClaimIcon, CopyIcon, EyeIcon, EyeOffIcon, InfoIcon, SendIcon, WalletIcon } from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { TrustLinkGuidance } from "@/src/components/trustlink-guidance";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import { getOrCreatePrivacyKeyBundle } from "@/src/lib/privacy-keys";
import type { IdentitySecurityState, PaymentRecord, PendingBalanceSummary, WalletTokenOption } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { signAndSendSerializedSolanaTransaction } from "@/src/lib/wallet";
import { useWallet } from "@/src/lib/wallet-provider";
import { ChevronRight, Landmark, ArrowUpRight, ArrowDownLeft, Wallet, Lock } from "lucide-react";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

/* ── WhatsApp icon ── */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/* ── X (Twitter) icon ── */
function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function splitPhoneDisplay(phone: string): { countryCode: string; localNumber: string; localDigits: string; fullNumber: string } {
  const cleaned = phone.replace(/[^\d+]/g, "");
  const rawDigits = cleaned.replace(/\D/g, "");
  if (!cleaned.startsWith("+")) {
    const localDigits = rawDigits.length === 11 && rawDigits.startsWith("0") ? rawDigits.slice(1) : rawDigits;
    return {
      countryCode: "",
      localNumber: localDigits.length === 10 ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}` : phone,
      localDigits,
      fullNumber: rawDigits || phone,
    };
  }
  const digits = cleaned.slice(1);
  let ccLen = 1;
  const oneDigitCodes = ["1", "7"];
  const twoDigitCodes = ["20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98"];
  if (oneDigitCodes.includes(digits.slice(0, 1))) ccLen = 1;
  else if (twoDigitCodes.includes(digits.slice(0, 2))) ccLen = 2;
  else ccLen = 3;
  const countryCode = "+" + digits.slice(0, ccLen);
  const localDigits = digits.slice(ccLen);
  const localNumber = localDigits.length === 10
    ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`
    : localDigits.length === 9
      ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`
      : localDigits.length === 8
        ? `${localDigits.slice(0, 4)} ${localDigits.slice(4)}`
        : localDigits.replace(/(\d{3})(?=\d)/g, "$1 ");
  return { countryCode, localNumber, localDigits, fullNumber: `${countryCode}${localDigits}` };
}

export function DashboardExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app");
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const { showToast } = useToast();
  const router = useRouter();
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
  const [identitySecurity, setIdentitySecurity] = useState<IdentitySecurityState | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [mainWalletGuidanceDismissed, setMainWalletGuidanceDismissed] = useState(false);

  useEffect(() => { if (!walletAddress) { setWalletTokens([]); return; } const ctrl = new AbortController(); async function load() { setWalletTokenLoading(true); try { const r = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", { walletAddress }); if (!ctrl.signal.aborted) setWalletTokens(r.tokens.filter((t) => t.supported)); } catch { if (!ctrl.signal.aborted) setWalletTokens([]); } finally { if (!ctrl.signal.aborted) setWalletTokenLoading(false); } } void load(); return () => ctrl.abort(); }, [walletAddress]);
  useEffect(() => { if (!accessToken || !user) return; void loadDashboard(accessToken); }, [accessToken, user]);
  useEffect(() => { if (!accessToken || !user) return; void loadIdentitySecurity(accessToken); }, [accessToken, user]);

  const supportedBalanceUsd = useMemo(() => walletTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0), [walletTokens]);
  const combinedVisibleBalanceUsd = useMemo(() => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)), [supportedBalanceUsd, totalPendingUsd]);
  const hasPendingSenderReceipt = useMemo(() => paymentHistory.some((p) => p.sender_user_id === user?.id && shouldPollPaymentNotification(p.notification_status)), [paymentHistory, user?.id]);
  const sentCount = useMemo(() => paymentHistory.filter((p) => p.sender_user_id === user?.id).length, [paymentHistory, user?.id]);
  const receivedCount = useMemo(() => paymentHistory.filter((p) => p.receiver_phone === user?.phoneNumber).length, [paymentHistory, user?.phoneNumber]);
  const showMainWalletGuidance = !identityLoading && !identitySecurity?.mainWallet && !mainWalletGuidanceDismissed;

  useEffect(() => { if (!accessToken || !user || !hasPendingSenderReceipt) return; const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void loadDashboard(accessToken, { background: true }); }, DASHBOARD_REFRESH_INTERVAL_MS); return () => window.clearInterval(interval); }, [accessToken, hasPendingSenderReceipt, user]);

  async function loadDashboard(token: string, options?: { background?: boolean }) { if (!options?.background) setLoading(true); try { const [pr, hr] = await Promise.all([apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number; summary: PendingBalanceSummary }>("/api/payment/pending", token), apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=30", token)]); setPendingPayments(pr.payments); setTotalPendingUsd(pr.totalPendingUsd); setPendingBalanceSummary(pr.summary); setPaymentHistory(hr.payments); setError(null); } catch (e) { if (!options?.background) setError(e instanceof Error ? e.message : "Could not load dashboard"); } finally { if (!options?.background) setLoading(false); } }

  async function loadIdentitySecurity(token: string) { setIdentityLoading(true); try { const result = await apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", token); setIdentitySecurity(result.identity); } catch (e) { setError(e instanceof Error ? e.message : "Could not load wallet binding"); } finally { setIdentityLoading(false); } }

  async function handleBindMainWallet() {
    if (!accessToken) return;
    if (!walletAddress || !session) { requestWalletConnection(); showToast("Connect the wallet you want to use as your TrustLink Pay main wallet."); return; }
    setIdentityBusy(true); setError(null);
    try {
      const bundle = getOrCreatePrivacyKeyBundle();
      const payload = { phoneIdentityPublicKey: bundle.phoneIdentityPublicKey, privacyViewPublicKey: bundle.privacyViewPublicKey, privacySpendPublicKey: bundle.privacySpendPublicKey, settlementWalletPublicKey: walletAddress, recoveryWalletPublicKey: null };
      const prepared = await apiPost<{ requiresBlockchainSignature: boolean; binding: { mode: "prepare-bind" | "already-bound"; serializedTransaction?: string; rpcUrl?: string; identityBinding?: string } }>("/api/identity", payload, accessToken);
      if (!prepared.requiresBlockchainSignature) { await loadIdentitySecurity(accessToken); showToast("This wallet is already bound on-chain."); return; }
      if (!prepared.binding.serializedTransaction || !prepared.binding.rpcUrl) throw new Error("TrustLink could not prepare the wallet binding transaction");
      showToast("Your wallet will ask you to approve this main wallet binding.");
      const blockchainSignature = await signAndSendSerializedSolanaTransaction({ walletId: session.walletId, rpcUrl: prepared.binding.rpcUrl, serializedTransaction: prepared.binding.serializedTransaction });
      const confirmed = await apiPost<{ identityBindingAddress: string; settlementWalletPublicKey: string | null }>("/api/identity", { ...payload, blockchainSignature }, accessToken);
      await loadIdentitySecurity(accessToken);
      showToast(`Main wallet bound: ${shortenAddress(confirmed.settlementWalletPublicKey ?? walletAddress)}`);
    } catch (e) { const message = e instanceof Error ? e.message : "Could not bind main wallet"; setError(message); showToast(message); } finally { setIdentityBusy(false); }
  }

  if (!hydrated || !user) return null;

  const userPhoneNumber = user.phoneNumber;
  const { countryCode, localNumber, localDigits, fullNumber } = splitPhoneDisplay(userPhoneNumber);

  async function copyNumber(value: string, label: string) {
    if (!navigator.clipboard?.writeText) {
      setError("Copy not available.");
      showToast("Copy not available.");
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast(`${label} copied.`);
  }

  async function handleCopyPhoneNumber() { await copyNumber(fullNumber, "WhatsApp number"); }
  async function handleCopyLocalNumber() { await copyNumber(localDigits, "10-digit TrustLink ID"); }

  return (
    <AppMobileShell currentTab="home" title="Home" subtitle="Move crypto with the calm, speed, and clarity of a modern payments app." user={user}
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <FloatingGuidanceOverlay
        open={showMainWalletGuidance}
        dismissible
        onClose={() => setMainWalletGuidanceDismissed(true)}
      >
        <TrustLinkGuidance
          tone="warning"
          title="Bind your main wallet"
          description="Any wallet you bind here becomes your main TrustLink Pay wallet. Choose the wallet you want to receive with and approve payments from."
          steps={[
            { title: "Connect the right wallet", description: walletAddress ? `${shortenAddress(walletAddress)} is connected.` : "Connect the wallet you want as your main wallet.", done: Boolean(walletAddress) },
            { title: "Approve one Solana transaction", description: "The transaction binds this wallet to your phone identity. TrustLink pays the network fee." },
            { title: "Keep control of your funds", description: "This does not give TrustLink custody of your wallet or permission to move funds." },
          ]}
          action={
            <button type="button" onClick={() => void handleBindMainWallet()} disabled={identityBusy}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3 text-[0.82rem] font-semibold text-[#04110a] disabled:opacity-60 cursor-pointer active:scale-[0.97] transition-transform"
            >
              {identityBusy ? "Binding..." : walletAddress ? "Bind this wallet" : "Connect main wallet"}
            </button>
          }
          secondaryAction={
            <Link href="/app/settings" className="tl-button-secondary rounded-[18px] px-4 py-3 text-center text-[0.82rem] font-medium">
              Security settings
            </Link>
          }
        />
      </FloatingGuidanceOverlay>

      <div className="grid gap-5 md:grid-cols-[1.15fr_0.85fr] md:items-start">

        {/* ─── LEFT COLUMN ─── */}
        <div className="space-y-0 md:space-y-4">

          {/* BALANCE HERO CARD */}
          <div className="tl-scanline relative overflow-hidden rounded-[28px] text-text border border-accent-border bg-accent-gradient p-5 shadow-softbox">
            <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-accent/8 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />

            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
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

              {/* ── WhatsApp payment identity chip ── */}
              <button type="button" onClick={() => void handleCopyPhoneNumber()}
                className="flex flex-col items-end gap-1.5 group cursor-pointer active:scale-[0.97] transition-transform shrink-0"
                aria-label={`Copy ${userPhoneNumber}`}
              >
                <div className="flex items-center gap-1">
                  {/* WA icon + country code — identity provider badge */}
                  <span className="flex items-center gap-1 rounded-[6px] border border-white/6 bg-white/4 px-1.5 py-0.5">
                    <WhatsAppIcon className="h-2.5 w-2.5 text-[#25D366]" />
                    <span className="text-[0.6rem] font-semibold text-text/40">{countryCode}</span>
                  </span>

                  {/* Divider — separates country prefix from local number */}
                  <span className="mx-1 h-3 w-px bg-white/12" />

                  {/* Local number — the standalone 10-digit payment ID */}
                  <span className="text-[0.84rem] font-bold tracking-wide text-text/78 whitespace-nowrap">{localNumber}</span>

                  {/* Copy full number */}
                  <CopyIcon className="ml-1 h-3 w-3 text-text/22 transition-colors group-hover:text-text/44" />
                </div>

                {/* Micro-label: hint that the 10-digit alone also works */}
                <span className="text-[0.54rem] font-medium tracking-[0.08em] text-text/24 whitespace-nowrap">
                  10-digit works without country code
                </span>
              </button>
            </div>

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

          {/* STATS ROW — desktop only */}
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

          {/* ─── ACTIVITY — desktop: starts right after stats ─── */}
          <div className="hidden md:block">
            <div className="flex items-center justify-between mb-3">
              <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Activity</div>
              {!loading && paymentHistory.length > 6 ? (
                <Link href="/app/activity" className="text-[0.68rem] font-medium text-accent hover:text-accent-deep transition-colors">View all</Link>
              ) : null}
            </div>
            {!loading && paymentHistory.length > 0 ? (
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 pb-2 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
                <span>Details</span>
                <span className="w-20 text-right">Amount</span>
                <span className="w-20 text-right">Status</span>
              </div>
            ) : null}
            <div className="space-y-2">
              {loading ? (
                <>{[0, 1, 2].map((i) => (
                  <div key={i} className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3">
                    <div className="h-10 w-10 animate-pulse rounded-[14px] bg-[var(--surface-soft)]" />
                    <div className="space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                      <div className="h-2.5 w-36 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    </div>
                    <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  </div>
                ))}</>
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
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className="space-y-4 mt-1.5">

          {/* PENDING CLAIMS */}
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
                <span className="text-[0.76rem] text-[var(--text-faint)]">{pendingPayments.length} unclaimed</span>
              </div>
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
          ) : null}

          {/* ── IDENTITY CARD ── */}
          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">Identity</div>
              <Link href="/app/settings"
                className="text-[0.62rem] font-medium text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors"
              >
                Manage
              </Link>
            </div>

            {/* WhatsApp — ACTIVE (current only identity) */}
            <div className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}
            >
              <WhatsAppIcon className="h-4 w-4 text-[#25D366] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[0.78rem] font-semibold truncate">
                  {userPhoneNumber}
                </div>
                <div className="text-[0.6rem] mt-0.5 text-text-faint" >
                  WhatsApp · Payment identity
                </div>
              </div>
              <span className="shrink-0 text-[0.58rem] font-semibold rounded-full px-2 py-0.5"
                style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}
              >
                Active
              </span>
            </div>

            {/* Coming soon identities */}
            <div className="mt-2 space-y-1">
              {/* X / Twitter */}
              <div className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 opacity-45">
                <XIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="text-[0.74rem] font-medium text-text-faint">X / Twitter</div>
                  <div className="text-[0.58rem] text-text-faint text-text-faint" >Verification identity</div>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-[0.56rem] font-medium rounded-full px-2 py-0.5"
                  style={{ border: "1px solid var(--field-border)", color: "var(--text-faint)" }}
                >
                  <Lock className="h-2.5 w-2.5" />
                  Soon
                </span>
              </div>

              {/* TIN */}
              <div className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 opacity-35">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0 text-text-faint"
                >
                  <circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" /><path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.74rem] font-medium">
                    TIN
                    <span className="ml-1.5 text-[0.52rem] font-normal opacity-60">Transfer Identity Number</span>
                  </div>
                  <div className="text-[0.58rem] text-text-faint" >On-chain payment identity · TINS Protocol</div>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-[0.56rem] font-medium rounded-full px-2 py-0.5"
                  style={{ border: "1px solid var(--field-border)", color: "var(--text-faint)" }}
                >
                  <Lock className="h-2.5 w-2.5" />
                  Roadmap
                </span>
              </div>
            </div>
          </div>

          {/* WALLET TOKENS CARD */}
          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">Wallet</div>
              <div className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--field-border)] bg-[var(--accent-soft)] pl-2.5 pr-1 py-0.5">
                <WalletIcon size={13} className="shrink-0 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
                <span className="text-[0.72rem] font-bold text-[var(--accent-deep)] dark:text-[var(--accent)] whitespace-nowrap">
                  {walletAddress ? (balanceVisible ? formatPaymentUsd(supportedBalanceUsd) : "****") : "Connect"}
                </span>
                {walletAddress ? (
                  <span className="rounded-full border border-[var(--field-border)] bg-[var(--surface)] px-2 py-0.5 text-[0.58rem] font-medium text-[var(--text-soft)]">
                    {shortenAddress(walletAddress)}
                  </span>
                ) : null}
              </div>
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
          </div>

          {/* MOBILE STATS */}
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

      {/* ACTIVITY — mobile only (desktop version is inside left column) */}
      <div className="mt-6 md:hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Activity</div>
          {!loading && paymentHistory.length > 6 ? (
            <Link href="/app/activity" className="text-[0.68rem] font-medium text-accent hover:text-accent-deep transition-colors">View all</Link>
          ) : null}
        </div>

        {!loading && paymentHistory.length > 0 ? (
          <div className="hidden md:grid md:grid-cols-[1fr_auto_auto] md:gap-4 md:px-4 md:pb-2 md:text-[0.62rem] md:font-medium md:uppercase md:tracking-[0.14em] md:text-[var(--text-faint)]">
            <span>Details</span>
            <span className="w-20 text-right">Amount</span>
            <span className="w-20 text-right">Status</span>
          </div>
        ) : null}

        <div className="space-y-2">
          {loading ? (
            <>{[0, 1, 2].map((i) => (
              <div key={i} className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3">
                <div className="h-10 w-10 animate-pulse rounded-[14px] bg-[var(--surface-soft)]" />
                <div className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                  <div className="h-2.5 w-36 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                </div>
                <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--surface-soft)]" />
              </div>
            ))}</>
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

      {/* BALANCE MODAL */}
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
              {[
                { label: "Total", value: formatPaymentUsd(combinedVisibleBalanceUsd), sub: null },
                { label: "Wallet", value: formatPaymentUsd(supportedBalanceUsd), sub: walletAddress ? shortenAddress(walletAddress) : "Not connected" },
                { label: "Escrow", value: formatPaymentUsd(totalPendingUsd), sub: `${pendingBalanceSummary.claimableCount} ${pendingBalanceSummary.claimableCount === 1 ? "payment" : "payments"}` },
              ].map((row) => (
                <div key={row.label} className="tl-field rounded-[18px] px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">{row.label}</span>
                    <div className="text-right">
                      <span className="block text-[0.84rem] font-semibold text-[var(--text)]">{balanceVisible ? row.value : "****"}</span>
                      {row.sub ? <span className="block text-[0.68rem] text-[var(--text-soft)]">{row.sub}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
