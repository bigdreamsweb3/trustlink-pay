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
import { ChevronRight, Landmark } from "lucide-react";

const DASHBOARD_REFRESH_INTERVAL_MS = 20_000;

function formatGuardTimestamp(value: string) {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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

    const stats = useMemo(() => [{ label: "Pending", value: pendingPayments.length.toString().padStart(2, "0") }], [pendingPayments.length]);
    const supportedBalanceUsd = useMemo(() => walletTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0), [walletTokens]);
    const combinedVisibleBalanceUsd = useMemo(() => Number((supportedBalanceUsd + totalPendingUsd).toFixed(2)), [supportedBalanceUsd, totalPendingUsd]);
    const hasPendingSenderReceipt = useMemo(() => paymentHistory.some((p) => p.sender_user_id === user?.id && shouldPollPaymentNotification(p.notification_status)), [paymentHistory, user?.id]);

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
            <section className="space-y-5">

                {/* BALANCE HERO CARD */}
                <div className="tl-scanline relative overflow-hidden rounded-[30px] text-text border border-accent-border/14 bg-accent-gradient p-5 shadow-softbox">
                    <div className="absolute right-[-18%] top-[-26%] h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
                    <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />

                    {/* Row 1: Balance label + eye | TL Number */}
                    <div className="relative z-10 flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-text/38">Balance</div>
                                <button
                                    type="button"
                                    onClick={() => setBalanceVisible((c) => !c)}
                                    className="text-text/40 transition-colors hover:text-text/60 cursor-pointer active:scale-[0.9]"
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
                                <button
                                    type="button"
                                    onClick={() => setBalanceInfoOpen(true)}
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/6 text-text/40 transition-colors hover:text-text/60 cursor-pointer active:scale-[0.9]"
                                    aria-label="Balance details"
                                >
                                    <InfoIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            {balanceVisible && totalPendingUsd > 0 ? (
                                <div className="mt-0.5 text-[0.68rem] text-text/40">+ {formatPaymentUsd(totalPendingUsd)} in escrow</div>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={() => void handleCopyPhoneNumber()}
                            className="flex flex-col items-end gap-1.5 group cursor-pointer active:scale-[0.97] transition-transform"
                            aria-label={`Copy ${userPhoneNumber}`}
                        >

                            <div className="flex items-center gap-1.5">
                                <span className="rounded-[6px] border border-white/10 bg-white/6 px-1.5 py-0.5 text-[0.66rem] font-semibold text-text/58">{countryCode}</span>
                                <span className="text-[0.84rem] font-bold tracking-wide text-text/82">{localNumber}</span>
                                <CopyIcon className="h-3 w-3 text-text/30 transition-colors group-hover:text-text/50" />
                            </div>

                            {/* <div className="flex items-center gap-1.5">
                                <span className="rounded-[6px] border border-white/10 bg-white/6 px-1.5 py-0.5 text-[0.66rem] font-semibold text-text/58">{countryCode}</span>
                                <div className="text-[0.58rem] font-medium uppercase tracking-[0.2em] text-text/34">TL Number</div>
                            </div> */}
                        </button>
                    </div>

                    {/* Row 2: Send/Claim buttons + Pending badge */}
                    <div className="relative z-10 mt-6 flex items-end justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Link href="/app/send" className="group flex flex-col items-center gap-1.5 cursor-pointer">
                                <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/6 transition-all duration-200 group-hover:bg-white/10 group-active:scale-[0.93]">
                                    <SendIcon size={18} className="text-text" />
                                </div>
                                <span className="text-[0.62rem] font-medium text-text/60">Send</span>
                            </Link>
                            <Link href="/app/claim" className="group flex flex-col items-center gap-1.5 cursor-pointer">
                                <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/6 transition-all duration-200 group-hover:bg-white/10 group-active:scale-[0.93]">
                                    <ClaimIcon size={18} className="text-text" />
                                </div>
                                <span className="text-[0.62rem] font-medium text-text/60">Claim</span>
                            </Link>
                        </div>

                        <div className="flex flex-col items-end gap-2 justify-end">
                            {/* <div className="flex items-center gap-1.5">
                                <span className="rounded-[6px] border border-white/10 bg-white/6 px-1.5 py-0.5 text-[0.66rem] font-semibold text-text/58">{countryCode}</span>
                                <span className="text-[0.84rem] font-bold tracking-wide text-text/82">{localNumber}</span>
                                <CopyIcon className="h-3 w-3 text-text/30 transition-colors group-hover:text-text/50" />
                            </div> */}

                            {stats.map((stat) => (
                                <div key={stat.label} className="w-fit flex items-center gap-1.5 rounded-[14px] border border-white/8 bg-white/4 px-3 py-2">

                                    <Landmark className="h-3.5 w-3.5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
                                    <span className="text-[0.76rem] font-semibold text-text">{stat.label}</span>
                                    <span className="text-[0.62rem] text-text/40">{loading ? "\u2014" : stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

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
                    <Link href="/app/claim" className="tl-field group flex items-center justify-between rounded-[22px] px-4 py-4 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]">
                        <div className="min-w-0 flex-1">
                            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-[#7dffd9]/72">Pending claims</div>
                            <div className="mt-1 text-[0.84rem] font-medium text-[var(--text)]">
                                {pendingPayments.length} unclaimed {pendingPayments.length === 1 ? "payment" : "payments"}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[0.84rem] font-semibold text-[var(--text)]">{formatPaymentUsd(totalPendingUsd)}</span>
                            <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </Link>
                ) : null}

                {/* ACTIVITY */}
                <div>
                    <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Activity</div>
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
                            <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">No transfer activity yet.</div>
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
            </section>

            {/* BALANCE DETAILS MODAL */}
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
