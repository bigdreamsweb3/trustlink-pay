"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { FloatingGuidanceOverlay } from "@/src/components/floating-guidance-overlay";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import {
  ClaimIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  SendIcon,
  WalletIcon,
} from "@/src/components/app-icons";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { TrustLinkGuidance } from "@/src/components/trustlink-guidance";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import {
  formatTokenAmount,
  shouldPollPaymentNotification,
  shouldPollTsnPayment,
} from "@/src/lib/formatters";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import { loadTinTokenBalances } from "@/src/lib/tin-balance";
import { resolveTinFromChain, type BrowserResolvedTin } from "@/src/lib/tins";
import type {
  IdentitySecurityResponse,
  PaymentRecord,
  PendingBalanceSummary,
  TinIdentityState,
  WalletTokenOption,
} from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useWallet } from "@/src/lib/wallet-provider";
import {
  Check,
  ChevronRight,
  Copy,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Lock,
} from "lucide-react";

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;

/* â”€â”€ WhatsApp icon â”€â”€ */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/* â”€â”€ X (Twitter) icon â”€â”€ */
function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function splitPhoneDisplay(phone: string): {
  countryCode: string;
  localNumber: string;
  localDigits: string;
  fullNumber: string;
} {
  const cleaned = phone.replace(/[^\d+]/g, "");
  const rawDigits = cleaned.replace(/\D/g, "");
  if (!cleaned.startsWith("+")) {
    const localDigits =
      rawDigits.length === 11 && rawDigits.startsWith("0")
        ? rawDigits.slice(1)
        : rawDigits;
    return {
      countryCode: "",
      localNumber:
        localDigits.length === 10
          ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`
          : phone,
      localDigits,
      fullNumber: rawDigits || phone,
    };
  }
  const digits = cleaned.slice(1);
  let ccLen = 1;
  const oneDigitCodes = ["1", "7"];
  const twoDigitCodes = [
    "20",
    "27",
    "30",
    "31",
    "32",
    "33",
    "34",
    "36",
    "39",
    "40",
    "41",
    "43",
    "44",
    "45",
    "46",
    "47",
    "48",
    "49",
    "51",
    "52",
    "53",
    "54",
    "55",
    "56",
    "57",
    "58",
    "60",
    "61",
    "62",
    "63",
    "64",
    "65",
    "66",
    "81",
    "82",
    "84",
    "86",
    "90",
    "91",
    "92",
    "93",
    "94",
    "95",
    "98",
  ];
  if (oneDigitCodes.includes(digits.slice(0, 1))) ccLen = 1;
  else if (twoDigitCodes.includes(digits.slice(0, 2))) ccLen = 2;
  else ccLen = 3;
  const countryCode = "+" + digits.slice(0, ccLen);
  const localDigits = digits.slice(ccLen);
  const localNumber =
    localDigits.length === 10
      ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`
      : localDigits.length === 9
        ? `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`
        : localDigits.length === 8
          ? `${localDigits.slice(0, 4)} ${localDigits.slice(4)}`
          : localDigits.replace(/(\d{3})(?=\d)/g, "$1 ");
  return {
    countryCode,
    localNumber,
    localDigits,
    fullNumber: `${countryCode}${localDigits}`,
  };
}

function extractTinInfo(
  result: IdentitySecurityResponse | null,
): TinIdentityState | null {
  if (!result?.tin) return null;
  return {
    tin: result.tin,
    tinsIdentityPublicKey: result.tinsIdentityPublicKey ?? null,
    tinsRegistryPublicKey: result.tinsRegistryPublicKey ?? null,
    tinsProgramId: result.tinsProgramId ?? null,
    tinsCreatedAt: result.tinsCreatedAt ?? null,
  };
}

export function DashboardExperience() {
  const {
    hydrated,
    accessToken,
    user,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession("/app");
  const { session: walletSession, walletAddress } = useWallet();
  const { showToast } = useToast();
  const router = useRouter();
  const [walletTokens, setWalletTokens] = useState<WalletTokenOption[]>([]);
  const [walletTokenLoading, setWalletTokenLoading] = useState(false);
  const [tinTokens, setTinTokens] = useState<WalletTokenOption[]>([]);
  const [tinTokenLoading, setTinTokenLoading] = useState(false);
  const [tinPruCount, setTinPruCount] = useState(0);
  const [tinActivePruCount, setTinActivePruCount] = useState(0);
  const [tinFundedPruCount, setTinFundedPruCount] = useState(0);
  const [tinBalanceStatus, setTinBalanceStatus] = useState<string | null>(null);
  const [tinBalanceLocked, setTinBalanceLocked] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState<number>(0);
  const [pendingBalanceSummary, setPendingBalanceSummary] =
    useState<PendingBalanceSummary>({
      claimableCount: 0,
      totalPendingUsd: 0,
      byToken: [],
    });
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceInfoOpen, setBalanceInfoOpen] = useState(false);
  const [tinInfo, setTinInfo] = useState<TinIdentityState | null>(null);
  const [resolvedTin, setResolvedTin] = useState<BrowserResolvedTin | null>(
    null,
  );
  const [identityLoading, setIdentityLoading] = useState(true);
  const [mainWalletGuidanceDismissed, setMainWalletGuidanceDismissed] =
    useState(false);
  const [tinCopied, setTinCopied] = useState(false);
  const tinBalanceSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setWalletTokens([]);
      return;
    }
    const ctrl = new AbortController();
    async function load() {
      setWalletTokenLoading(true);
      try {
        const r = await apiPost<{ tokens: WalletTokenOption[] }>(
          "/api/wallet/tokens",
          { walletAddress },
          undefined,
          // Wallet token balances are public chain data. Keep a short
          // session cache so a page reload does not immediately repeat the
          // same RPC-backed read; payment mutations invalidate this cache.
          { cache: "default", ttlMs: 20_000, persist: true },
        );
        if (!ctrl.signal.aborted)
          setWalletTokens(r.tokens.filter((t) => t.supported));
      } catch {
        if (!ctrl.signal.aborted) setWalletTokens([]);
      } finally {
        if (!ctrl.signal.aborted) setWalletTokenLoading(false);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [walletAddress]);
  useEffect(() => {
    if (!accessToken || !user) return;
    void loadDashboard(accessToken);
  }, [accessToken, user]);
  useEffect(() => {
    if (!accessToken || !user) return;
    void loadIdentitySecurity(accessToken);
  }, [accessToken, user]);

  const walletBalanceUsd = useMemo(
    () => walletTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0),
    [walletTokens],
  );
  const tinBalanceUsd = useMemo(
    () => tinTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0),
    [tinTokens],
  );
  const supportedBalanceUsd = useMemo(
    () => Number((walletBalanceUsd + tinBalanceUsd).toFixed(2)),
    [walletBalanceUsd, tinBalanceUsd],
  );
  const combinedVisibleBalanceUsd = useMemo(
    () => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)),
    [supportedBalanceUsd, totalPendingUsd],
  );
  const pendingClaimsUsd =
    pendingBalanceSummary.totalPendingUsd || totalPendingUsd;
  const hasPendingStatus = useMemo(
    () =>
      paymentHistory.some(
        (p) =>
          shouldPollTsnPayment(p) ||
          (p.sender_user_id === user?.id &&
            shouldPollPaymentNotification(p.notification_status)),
      ),
    [paymentHistory, user?.id],
  );
  const sentCount = useMemo(
    () => paymentHistory.filter((p) => p.sender_user_id === user?.id).length,
    [paymentHistory, user?.id],
  );
  const receivedCount = useMemo(
    () =>
      paymentHistory.filter((p) => p.receiver_phone === user?.phoneNumber)
        .length,
    [paymentHistory, user?.phoneNumber],
  );
  const displayPayments = useMemo(() => {
    const items: {
      payment: PaymentRecord;
      forceReceiveView: boolean;
      displayKey: string;
    }[] = [];
    const userPhone = user?.phoneNumber;
    const userId = user?.id;
    for (const payment of paymentHistory) {
      const isSelfSend =
        payment.sender_user_id === userId &&
        payment.receiver_phone === userPhone;
      items.push({
        payment,
        forceReceiveView: false,
        displayKey: `${payment.id}-send`,
      });
      if (isSelfSend) {
        items.push({
          payment,
          forceReceiveView: true,
          displayKey: `${payment.id}-receive`,
        });
      }
    }
    return items.slice(0, 12);
  }, [paymentHistory, user?.id, user?.phoneNumber]);

  const activeTin = tinInfo?.tin ?? user?.tin ?? null;
  const activeTinIdentity =
    tinInfo?.tinsIdentityPublicKey ?? user?.tinsIdentityPublicKey ?? null;
  const showMainWalletGuidance =
    !identityLoading && !activeTin && !mainWalletGuidanceDismissed;

  useEffect(() => {
    if (!activeTin) {
      setResolvedTin(null);
      return;
    }
    let cancelled = false;
    void resolveTinFromChain(activeTin)
      .then((identity) => {
        if (!cancelled) setResolvedTin(identity);
      })
      .catch(() => {
        if (!cancelled) setResolvedTin(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTin]);

  useEffect(() => {
    if (
      !activeTin ||
      !walletSession ||
      walletTokens.length === 0 ||
      !accessToken
    ) {
      tinBalanceSessionRef.current = null;
      setTinTokens([]);
      setTinPruCount(0);
      setTinActivePruCount(0);
      setTinFundedPruCount(0);
      setTinBalanceStatus(
        activeTin
          ? "Waiting for the active session to unlock your TIN balance..."
          : null,
      );
      setTinBalanceLocked(Boolean(activeTin));
      return;
    }
    const sessionKey = `${accessToken}:${activeTin}:${walletSession.address}`;
    if (tinBalanceSessionRef.current === sessionKey) return;
    tinBalanceSessionRef.current = sessionKey;
    const tin = activeTin;
    const session = walletSession;
    const ctrl = new AbortController();
    async function load() {
      setTinTokenLoading(true);
      setTinBalanceLocked(false);
      setTinBalanceStatus("Preparing your TIN balance...");
      try {
        showToast(
          "Checking authorized-device access for your private TIN balance. No transaction is sent.",
        );
        const result = await loadTinTokenBalances({
          tin,
          walletSession: session,
          supportedTokens: walletTokens,
          signal: ctrl.signal,
          onProgress: (message) => {
            if (!ctrl.signal.aborted) setTinBalanceStatus(message);
          },
        });
        if (!ctrl.signal.aborted) {
          setTinTokens(result.tokens);
          setTinPruCount(result.pruCount);
          setTinActivePruCount(result.activePruCount);
          setTinFundedPruCount(result.nonZeroPruCount);
          setTinBalanceLocked(false);
          setTinBalanceStatus(
            `${result.nonZeroPruCount} funded ZK-PRU handle${result.nonZeroPruCount === 1 ? "" : "s"}`,
          );
        }
      } catch (error) {
        if (!ctrl.signal.aborted) {
          setTinTokens([]);
          setTinPruCount(0);
          setTinActivePruCount(0);
          // Never present a failed private read as a real zero balance.
          setTinBalanceLocked(true);
          setTinBalanceStatus(
            error instanceof Error
              ? `TIN balance unavailable: ${error.message}`
              : "TIN balance unavailable: unexpected error",
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setTinTokenLoading(false);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [
    accessToken,
    activeTin,
    walletSession,
    walletTokens,
    showToast,
  ]);

  useEffect(() => {
    if (!accessToken || !user || !hasPendingStatus) return;
    const interval = window.setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      void loadDashboard(accessToken, { background: true });
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [accessToken, hasPendingStatus, user]);

  async function loadDashboard(
    token: string,
    options?: { background?: boolean },
  ) {
    if (!options?.background) setLoading(true);
    try {
      const [pr, hr] = await Promise.all([
        apiGet<{
          payments: PaymentRecord[];
          totalPendingUsd: number;
          summary: PendingBalanceSummary;
        }>("/api/payment/pending", token),
        apiGet<{ payments: PaymentRecord[] }>(
          "/api/payment/history?limit=30",
          token,
        ),
      ]);
      setPendingPayments(pr.payments);
      setTotalPendingUsd(pr.totalPendingUsd);
      setPendingBalanceSummary(pr.summary);
      setPaymentHistory(hr.payments);
      setError(null);
    } catch (e) {
      if (!options?.background)
        setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      if (!options?.background) setLoading(false);
    }
  }

  async function loadIdentitySecurity(token: string) {
    setIdentityLoading(true);
    try {
      const result = await apiGet<IdentitySecurityResponse>(
        "/api/identity",
        token,
      );
      setTinInfo(extractTinInfo(result));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load Transfer Identity",
      );
    } finally {
      setIdentityLoading(false);
    }
  }

  if (!hydrated || !user) return null;

  const userPhoneNumber = user.phoneNumber;
  const { countryCode, localNumber, localDigits, fullNumber } =
    splitPhoneDisplay(userPhoneNumber);

  async function copyNumber(value: string, label: string) {
    if (!navigator.clipboard?.writeText) {
      setError("Copy not available.");
      showToast("Copy not available.");
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast(`${label} copied.`);
  }

  async function handleCopyTinNumber() {
    if (!activeTin) {
      router.push("/app/identity");
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setError("Copy not available.");
      showToast("Copy not available.");
      return;
    }

    await navigator.clipboard.writeText(activeTin);
    setTinCopied(true);
    window.setTimeout(() => setTinCopied(false), 1400);
  }

  function handleOpenIdentityPanel() {
    router.push("/app/identity");
  }

  async function handleCopyPhoneNumber() {
    await copyNumber(fullNumber, "WhatsApp number");
  }
  async function handleCopyLocalNumber() {
    await copyNumber(localDigits, "10-digit TrustLink ID");
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Home"
      subtitle="Move crypto with the calm, speed, and clarity of a modern payments app."
      user={user}
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
      <FloatingGuidanceOverlay
        open={showMainWalletGuidance}
        dismissible
        onClose={() => setMainWalletGuidanceDismissed(true)}
      >
        <TrustLinkGuidance
          tone="warning"
          title="Link your TIN"
          description="Connect your existing TIN, or create one if this wallet does not have one yet."
          steps={[
            {
              title: "Connect the right wallet",
              description: walletAddress
                ? `${shortenAddress(walletAddress)} is connected.`
                : "Connect the wallet you want to register with Transfer Identity.",
              done: Boolean(walletAddress),
            },
            {
              title: "Check for your TIN",
              description:
                "TrustLink checks the connected wallet and links its existing TIN. A new TIN is created only when needed.",
            },
            {
              title: "Keep control of your funds",
              description:
                "Your wallet remains in control throughout the identity check.",
            },
          ]}
          action={
            <button
              type="button"
              onClick={() => router.push("/app/identity")}
              className="tl-button-primary rounded-[18px] px-4 py-3 tl-body-sm font-semibold disabled:opacity-60 cursor-pointer active:scale-[0.97] transition-transform"
            >
              Link your TIN
            </button>
          }
          secondaryAction={
            <Link
              href="/app/identity?section=security"
              className="tl-button-secondary rounded-[18px] px-4 py-3 text-center tl-body-sm font-medium"
            >
              Security settings
            </Link>
          }
        />
      </FloatingGuidanceOverlay>

      <div className="flex-col gap-5 md:grid md:grid-cols-[1.25fr_0.85fr] md:items-start">
        {/* â”€â”€â”€ LEFT COLUMN â”€â”€â”€ */}
        <div className="space-y-0 md:space-y-4">
          {/* BALANCE HERO CARD */}
          <div className="tl-scanline relative flex min-h-[210px] flex-col overflow-hidden rounded-[28px] border border-accent-border bg-accent-gradient bg-bg p-5 text-text shadow-softbox">
            {/* Ambient glow */}
            <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-accent/8 blur-3xl" />

            {/* Top highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />

            {/* TOP CONTENT */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              {/* Balance block */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-text/36">
                    Balance
                  </div>

                  <button
                    type="button"
                    onClick={() => setBalanceVisible((c) => !c)}
                    className="cursor-pointer text-text/36 transition-colors hover:text-text/56 active:scale-[0.9]"
                    aria-label={
                      balanceVisible ? "Hide balance" : "Show balance"
                    }
                  >
                    {balanceVisible ? (
                      <EyeOffIcon className="h-3.5 w-3.5" />
                    ) : (
                      <EyeIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="mt-1 flex items-center gap-2.5">
                  {walletTokenLoading || tinTokenLoading ? (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">
                      ...
                    </div>
                  ) : balanceVisible ? (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">
                      {formatPaymentUsd(combinedVisibleBalanceUsd)}
                    </div>
                  ) : (
                    <div className="text-[1.8rem] font-bold tracking-tight text-text">
                      ****
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setBalanceInfoOpen(true)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/4 text-text/36 transition-colors hover:text-text/56 cursor-pointer active:scale-[0.9]"
                    aria-label="Balance details"
                  >
                    <InfoIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {balanceVisible && totalPendingUsd > 0 ? (
                  <div className="mt-0.5 tl-meta-sm text-text/36">
                    + {formatPaymentUsd(totalPendingUsd)} pending settlement
                  </div>
                ) : null}
              </div>

              {/* TIN identity chip */}
              <button
                type="button"
                onClick={() => void handleCopyTinNumber()}
                className="group flex shrink-0 flex-col items-end gap-1.5 cursor-pointer transition-transform active:scale-[0.97]"
                aria-label={
                  activeTin ? `Copy TIN ${activeTin}` : "Link your TIN"
                }
              >
                <div className="flex items-center gap-1">
                  {/* Provider badge */}
                  <span className="flex items-center gap-1 rounded-[6px] border border-white/6 bg-white/4 px-1.5 py-0.5">
                    <span className="text-[0.6rem] font-semibold text-text/40">
                      TIN
                    </span>
                  </span>

                  {/* Divider */}
                  <span className="mx-1 h-3 w-px bg-white/12" />

                  {/* Local number */}
                  <span className="whitespace-nowrap tl-body-sm font-bold tracking-wide text-text/78">
                    {activeTin ?? "Link TIN"}
                  </span>

                  {tinCopied ? (
                    <Check className="ml-1 h-3 w-3 text-[var(--accent)]" />
                  ) : (
                    <Copy className="ml-1 h-3 w-3 text-text/22 transition-colors group-hover:text-text/44" />
                  )}
                </div>

                {/* Micro label */}
                <span className="whitespace-nowrap text-[0.54rem] font-medium tracking-[0.08em] text-text/24">
                  {activeTin ? "Transfer Identity Number" : "TIN not linked"}
                </span>
              </button>
            </div>

            {/* BOTTOM ACTION SECTION */}
            <div className="relative z-10 mt-auto flex items-end justify-between gap-3 pt-6">
              {/* Action buttons */}
              <div className="flex items-center gap-3">
                {/* Send */}
                <Link
                  href="/app/send"
                  className="group flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-white/6 bg-white/4 transition-all duration-200 group-hover:bg-white/8 group-active:scale-[0.93]">
                    <SendIcon size={18} className="text-text" />
                  </div>

                  <span className="text-[0.62rem] font-medium text-text/50">
                    Send
                  </span>
                </Link>

                {/* Claim */}
                <Link
                  href="/app/claim"
                  className="group flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-white/6 bg-white/4 transition-all duration-200 group-hover:bg-white/8 group-active:scale-[0.93]">
                    <ClaimIcon size={18} className="text-text" />
                  </div>

                  <span className="text-[0.62rem] font-medium text-text/50">
                    Claim
                  </span>
                </Link>
              </div>

              {/* TIN balance chip */}
              <div className="tl-field rounded-[16px] px-4 pb-1.5 max-w-fit">
                <div className="flex items-center justify-between">
                  <span className="truncate text-[0.54rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                    TIN bal.
                  </span>
                  <span className="whitespace-nowrap text-[0.45rem] font-semibold text-[var(--accent)]">
                    {tinTokenLoading
                      ? "Loading ZK-PRU handles..."
                      : `${tinFundedPruCount} / ${tinPruCount} ${tinFundedPruCount === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Landmark className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span className="text-[1.05rem] font-bold text-[var(--text)]">
                    {tinTokenLoading
                      ? "\u2014"
                      : balanceVisible
                        ? tinBalanceLocked
                          ? "Locked"
                          : formatPaymentUsd(tinBalanceUsd)
                        : "****"}
                  </span>
                </div>
              </div>
              {/* */}
            </div>
          </div>

          {/* STATS ROW */}
          <div className="my-3 gap-1.5 px-0.5 sm:gap-2 sm:px-2">
            <div className="flex min-w-0 w-fit items-center justify-end rounded-[13px] border border-[var(--field-border)] bg-[var(--field)] px-2 py-2 sm:px-3">
              <div
                className="flex min-w-0 max-w-fit flex-1 items-center gap-1.5"
                title={`Sent: ${loading ? "\u2014" : sentCount}`}
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--primary-accent)]" />
                <span className="truncate text-[0.54rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Sent
                </span>
                <span className="ml-auto shrink-0 text-[0.68rem] font-bold tabular-nums text-text">
                  {loading ? "\u2014" : sentCount}
                </span>
              </div>

              <span className="mx-2 h-5 w-px shrink-0 bg-[var(--field-border)]" />

              <div
                className="flex min-w-0 max-w-fit flex-1 items-center gap-1.5"
                title={`Received: ${loading ? "\u2014" : receivedCount}`}
              >
                <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate text-[0.54rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Received
                </span>
                <span className="ml-auto shrink-0 text-[0.68rem] font-bold tabular-nums text-text">
                  {loading ? "\u2014" : receivedCount}
                </span>
              </div>

              <span className="mx-2 h-5 w-px shrink-0 bg-[var(--field-border)]" />

              <div className="flex min-w-0 max-w-fit flex-1 items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />

                <span className="truncate text-[0.54rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Pending
                </span>

                <span className="text-[0.62rem] text-text/36">
                  {loading
                    ? "\u2014”"
                    : pendingPayments.length.toString().padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>

          {/* â”€â”€â”€ ACTIVITY â€” desktop: starts right after stats â”€â”€â”€ */}
          <div className="tl-panel-header hidden md:block">
            <div className="flex items-start justify-between mx-[0.75rem] mb-3">
              <div className="tl-text-muted text-[0.62rem] font-semibold  uppercase tracking-[0.2em]">
                Activity
              </div>
              {!loading && paymentHistory.length > 6 ? (
                <Link
                  href="/app/activity"
                  className="tl-meta-sm font-medium text-accent hover:text-accent-deep transition-colors"
                >
                  View all
                </Link>
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
                <>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3"
                    >
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
                  {/* no tx ux */}
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)]">
                    <ArrowUpRight className="h-4 w-4 text-[var(--text-faint)]" />
                  </div>
                  <div className="tl-body-sm font-medium text-[var(--text-soft)]">
                    No transfer activity yet
                  </div>
                  <div className="mt-1 text-[0.72rem] text-[var(--muted)]">
                    Your transactions will appear here
                  </div>
                </div>
              ) : (
                displayPayments
                  .slice(0, 6)
                  .map(({ payment, forceReceiveView, displayKey }) => (
                    <PaymentActivityCard
                      key={displayKey}
                      payment={payment}
                      currentUserId={user.id}
                      onClick={(id) =>
                        router.push(
                          `/app/activity/${id}?view=${forceReceiveView ? "receiver" : "sender"}`,
                        )
                      }
                      forceReceiveView={forceReceiveView || undefined}
                    />
                  ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* PENDING CLAIMS */}
          {loading ? (
            <div className="tl-panel-header tl-field flex min-h-[68px] items-center justify-between gap-3 rounded-[22px] px-4 py-3.5">
              <div className="space-y-2.5">
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                <div className="h-3.5 w-44 animate-pulse rounded-full bg-[var(--surface-soft)]" />
              </div>
              <SectionLoader label="Checking claims..." />
            </div>
          ) : pendingPayments.length > 0 ? (
            <div className="mb-0 md:mb-4">
              <Link
                href="/app/claim"
                className="group block rounded-[22px] px-4 py-4 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-accent/68">
                    Pending claims
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-[1.3rem] font-bold text-[var(--text)]">
                    {balanceVisible
                      ? formatPaymentUsd(pendingClaimsUsd)
                      : "****"}
                  </span>
                  <span className="text-[0.76rem] text-[var(--text-faint)]">
                    {pendingPayments.length} unclaimed
                  </span>
                </div>
                {pendingBalanceSummary.byToken.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pendingBalanceSummary.byToken.map((t) => (
                      <span
                        key={t.tokenSymbol ?? "unknown"}
                        className="rounded-[8px] border border-accent-border bg-accent-soft px-2 py-0.5 text-[0.64rem] font-medium text-accent"
                      >
                        {t.tokenSymbol ?? "Token"}:{" "}
                        {balanceVisible
                          ? `${formatTokenAmount(t.amount)}${t.amountUsd != null ? ` · ${formatPaymentUsd(t.amountUsd)}` : ""}`
                          : "****"}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </div>
          ) : null}

          {/* â”€â”€ IDENTITY CARD â”€â”€ */}
          <div className="tl-panel-header rounded-[22px] hidden md:block">
            <div className="flex items-start justify-between mx-[0.75rem] mb-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Identity
              </div>
              <Link
                href="/app/identity"
                className="text-[0.62rem] font-medium text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors"
              >
                Manage
              </Link>
            </div>

            <div className="tl-field rounded-[18px]">
              {/* TIN */}
              <button
                type="button"
                onClick={handleOpenIdentityPanel}
                className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 shrink-0 ${activeTin ? "text-[var(--accent)]" : "text-[#ffb86b]"}`}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 14.14 14.14" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.74rem] font-medium">
                    {activeTin
                      ? resolvedTin?.legalName || "No verified legal name"
                      : "Link your TIN"}
                    <span className="ml-1.5 text-[0.52rem] font-normal opacity-60">
                      Transfer Identity Number
                    </span>
                  </div>
                  <div className="text-[0.58rem] text-text-faint">
                    {activeTin
                      ? `TIN ${activeTin}${resolvedTin?.name ? ` · Registry name: ${resolvedTin.name}` : ""}${activeTinIdentity ? ` · ${shortenAddress(activeTinIdentity)}` : ""}`
                      : "Connect an existing TIN or create one if needed"}
                  </div>
                </div>
                <span
                  className="shrink-0 flex items-center gap-1 text-[0.56rem] font-medium rounded-full px-2 py-0.5"
                  style={
                    activeTin
                      ? {
                          background: "var(--accent-soft)",
                          border: "1px solid var(--accent-border)",
                          color: "var(--accent)",
                        }
                      : {
                          border: "1px solid var(--field-border)",
                          color: "var(--text-faint)",
                        }
                  }
                >
                  {activeTin ? "Active" : "Create"}
                </span>
              </button>

              {/* Registered identities */}
              <div className="mt-2 space-y-1">
                {/* WhatsApp identity */}
                <div className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5">
                  <WhatsAppIcon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.78rem] font-semibold truncate">
                      {userPhoneNumber}
                    </div>
                    <div className="text-[0.6rem] mt-0.5 text-text-faint">
                      WhatsApp - TrustLink login
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-[0.58rem] font-semibold rounded-full px-2 py-0.5"
                    style={{
                      background: "var(--accent-soft)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent)",
                    }}
                  >
                    Active
                  </span>
                </div>

                {/* Wallet login */}
              </div>
            </div>
          </div>

          {/* WALLET TOKENS CARD */}
          <div className="tl-panel-header rounded-[22px] hidden md:block">
            <div className="flex items-start justify-between mx-[0.75rem] mb-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Wallet + TIN
              </div>
              <div className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--field-border)] bg-[var(--accent-soft)] pl-2.5 pr-1 py-0.5">
                <WalletIcon
                  size={13}
                  className="shrink-0 text-[var(--accent-deep)] dark:text-[var(--accent)]"
                />
                <span className="text-[0.72rem] font-bold text-[var(--accent-deep)] dark:text-[var(--accent)] whitespace-nowrap">
                  {walletAddress
                    ? balanceVisible
                      ? formatPaymentUsd(supportedBalanceUsd)
                      : "****"
                    : "Connect"}
                </span>
                {walletAddress ? (
                  <span className="rounded-full border border-[var(--field-border)] bg-[var(--surface)] px-2 py-0.5 text-[0.58rem] font-medium text-[var(--text-soft)]">
                    {shortenAddress(walletAddress)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="tl-field rounded-t-0 rounded-[18px] px-4 py-4">
              {walletTokenLoading || tinTokenLoading ? (
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
                  <span className="text-[0.78rem] text-[var(--muted)]">
                    Connect a wallet to see your tokens
                  </span>
                </div>
              ) : walletTokens.length === 0 && tinTokens.length === 0 ? (
                <div className="py-2 text-[0.78rem] text-[var(--muted)]">
                  No supported tokens found
                </div>
              ) : (
                <div className="space-y-4">
                  {tinTokens.length > 0 ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        <span>TIN balance</span>
                        <span>
                          {tinFundedPruCount} funded ZK-PRU handle
                          {tinFundedPruCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {tinTokens.slice(0, 5).map((token) => (
                        <div
                          key={`tin-${token.symbol}`}
                          className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--accent-soft)] text-[0.56rem] font-bold text-accent">
                              {token.symbol.slice(0, 3)}
                            </div>
                            <span className="tl-body-sm font-medium text-[var(--text)]">
                              {token.symbol}
                            </span>
                          </div>
                          <span className="tl-body-sm font-semibold text-[var(--text)]">
                            {balanceVisible
                              ? formatPaymentUsd(token.balanceUsd ?? 0)
                              : "****"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Main wallet
                    </div>
                    {walletTokens.slice(0, 5).map((token) => (
                      <div
                        key={`wallet-${token.symbol}`}
                        className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] text-[0.56rem] font-bold text-accent">
                            {token.symbol.slice(0, 3)}
                          </div>
                          <span className="tl-body-sm font-medium text-[var(--text)]">
                            {token.symbol}
                          </span>
                        </div>
                        <span className="tl-body-sm font-semibold text-[var(--text)]">
                          {balanceVisible
                            ? formatPaymentUsd(token.balanceUsd ?? 0)
                            : "****"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MOBILE STATS */}
        </div>
      </div>

      {/* ACTIVITY â€” mobile only (desktop version is inside left column) */}
      <div className="tl-panel-header mt-6 md:hidden">
        <div className="flex items-start justify-between mx-[0.75rem] mb-3">
          <div className="tl-text-muted text-[0.62rem] font-semibold  uppercase tracking-[0.2em]">
            Activity
          </div>
          {!loading && paymentHistory.length > 6 ? (
            <Link
              href="/app/activity"
              className="tl-meta-sm font-medium text-accent hover:text-accent-deep transition-colors"
            >
              View all
            </Link>
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
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="tl-field grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3"
                >
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
              <div className="tl-body-sm font-medium text-[var(--text-soft)]">
                No transfer activity yet
              </div>
              <div className="mt-1 text-[0.72rem] text-[var(--muted)]">
                Your transactions will appear here
              </div>
            </div>
          ) : (
            displayPayments
              .slice(0, 6)
              .map(({ payment, forceReceiveView, displayKey }) => (
                <PaymentActivityCard
                  key={displayKey}
                  payment={payment}
                  currentUserId={user.id}
                  onClick={(id) =>
                    router.push(
                      `/app/activity/${id}?view=${forceReceiveView ? "receiver" : "sender"}`,
                    )
                  }
                  forceReceiveView={forceReceiveView || undefined}
                />
              ))
          )}
        </div>
      </div>

      {/* BALANCE MODAL */}
      {balanceInfoOpen ? (
        <div
          className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center"
          onClick={() => setBalanceInfoOpen(false)}
        >
          <div
            className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="tl-h3 font-semibold tracking-[-0.04em] text-[var(--text)]">
                  Balance details
                </h2>
                <p className="tl-text-muted mt-1 tl-body-sm leading-relaxed">
                  Your main-wallet balance, private TIN balance, and pending
                  settlement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBalanceInfoOpen(false)}
                className="tl-button-secondary shrink-0 rounded-full px-3.5 py-2 tl-meta-sm font-medium cursor-pointer transition-colors hover:opacity-90 active:scale-[0.97]"
              >
                Close
              </button>
            </div>
            <div className="space-y-2.5">
              {[
                {
                  label: "Total",
                  value: formatPaymentUsd(combinedVisibleBalanceUsd),
                  sub: null,
                },
                {
                  label: "Main wallet",
                  value: formatPaymentUsd(walletBalanceUsd),
                  sub: walletAddress
                    ? shortenAddress(walletAddress)
                    : "Not connected",
                },
                {
                  label: "TIN balance",
                  value: tinBalanceLocked
                    ? "Locked"
                    : formatPaymentUsd(tinBalanceUsd),
                  sub:
                    tinBalanceStatus ??
                    (tinTokenLoading
                      ? "Loading your ZK-PRU balances..."
                      : `${tinFundedPruCount} funded ZK-PRU handle${tinFundedPruCount === 1 ? "" : "s"}`),
                },
                {
                  label: "Pending settlement",
                  value: formatPaymentUsd(totalPendingUsd),
                  sub: `${pendingBalanceSummary.claimableCount} ${pendingBalanceSummary.claimableCount === 1 ? "payment" : "payments"}`,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="tl-panel-header tl-field rounded-[18px] px-4 py-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">
                      {row.label}
                    </span>
                    <div className="text-right">
                      <span className="block tl-body-sm font-semibold text-[var(--text)]">
                        {balanceVisible ? row.value : "****"}
                      </span>
                      {row.sub ? (
                        <span className="block tl-meta-sm text-[var(--text-soft)]">
                          {row.sub}
                        </span>
                      ) : null}
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
