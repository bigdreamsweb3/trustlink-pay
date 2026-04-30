"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount, shouldPollPaymentNotification } from "@/src/lib/formatters";
import { shareInviteMessage } from "@/src/lib/share";
import type { PaymentDetailResponse } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

const DETAIL_REFRESH_INTERVAL_MS = 20_000;

function formatDateTime(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function shortenValue(value: string | null | undefined, start = 6, end = 6) {
  if (!value) return "Not available";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatFeeAmount(value: string | null | undefined, tokenSymbol: string) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${formatTokenAmount(n)} ${tokenSymbol}`;
}

function statusTone(status: PaymentDetailResponse["payment"]["status"] | "accepted" | "pending") {
  switch (status) {
    case "accepted": return "bg-[#58f2b1]/12 text-[#7dffd9]";
    case "pending": return "bg-[#f3c96b]/12 text-[#f3c96b]";
    default: return "bg-[#ff7f7f]/12 text-[#ffadad]";
  }
}

export function TransactionDetailExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession(`/app/activity/${paymentId}`);
  const [detail, setDetail] = useState<PaymentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shouldPollReceipt = detail?.viewerRole === "sender" && shouldPollPaymentNotification(detail?.payment.notification_status);

  useEffect(() => { if (!accessToken || !user) return; let cancelled = false; async function load() { setLoading(true); try { const r = await apiGet<PaymentDetailResponse>(`/api/payment/${paymentId}`, accessToken ?? undefined); if (!cancelled) { setDetail(r); setError(null); } } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load details"); } finally { if (!cancelled) setLoading(false); } } void load(); return () => { cancelled = true; }; }, [accessToken, paymentId, user]);

  useEffect(() => { if (!accessToken || !user || !shouldPollReceipt) return; let cancelled = false; async function refresh() { try { const r = await apiGet<PaymentDetailResponse>(`/api/payment/${paymentId}`, accessToken ?? undefined); if (!cancelled) setDetail(r); } catch { } } const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void refresh(); }, DETAIL_REFRESH_INTERVAL_MS); return () => { cancelled = true; window.clearInterval(interval); }; }, [accessToken, paymentId, shouldPollReceipt, user]);

  const receiptUpdatedAt = useMemo(() => { if (!detail) return null; return detail.whatsapp.readAt ?? detail.whatsapp.deliveredAt ?? detail.whatsapp.sentAt ?? detail.whatsapp.failedAt ?? null; }, [detail]);

  const viewerFeeLabel = detail ? (detail.viewerRole === "sender" ? "Send fee" : "Claim fee") : null;
  const viewerFeeAmount = detail ? (detail.viewerRole === "sender" ? formatFeeAmount(detail.payment.sender_fee_amount, detail.payment.token_symbol) : formatFeeAmount(detail.payment.claim_fee_amount, detail.payment.token_symbol)) : null;

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell currentTab="home" title="Transaction" subtitle="Trace the payment clearly without exposing the wrong personal details." user={user} showBackButton backHref="/app/activity"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {error ? <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">{error}</div> : null}

        {loading ? (
          <div className="tl-field rounded-[22px] px-5 py-8">
            <SectionLoader size="md" label="Loading transaction..." />
          </div>
        ) : detail ? (
          <>
            {/* HERO — Amount + Status */}
            <div className="text-center py-1">
              <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">
                {detail.viewerRole === "sender" ? "Sent payment" : "Incoming payment"}
              </div>
              <h2 className="mt-2 text-[1.6rem] font-bold tracking-tight text-[var(--text)]">
                {formatTokenAmount(detail.payment.amount)} {detail.payment.token_symbol}
              </h2>
              <div className="mt-2 flex justify-center">
                <span className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold capitalize ${statusTone(detail.payment.status)}`}>
                  {detail.payment.status}
                </span>
              </div>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-[var(--text-soft)] max-w-[300px] mx-auto">
                {detail.viewerRole === "sender"
                  ? detail.receiver.manualInviteRequired
                    ? `In escrow for ${detail.receiver.phone}. Recipient not yet on TrustLink.`
                    : `Being delivered to ${detail.receiver.phone} via escrow.`
                  : `From ${detail.sender.displayName}${detail.sender.handle ? ` (@${detail.sender.handle})` : ""} via escrow.`}
              </p>
            </div>

            {/* PARTIES */}
            <div className="space-y-2.5">
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">{detail.viewerRole === "sender" ? "Receiver" : "Sender"}</span>
                  <span className="text-[0.84rem] font-semibold text-[var(--text)]">
                    {detail.viewerRole === "sender" ? detail.receiver.phone : detail.sender.displayName}
                  </span>
                </div>
              </div>

              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">
                    {detail.receiver.manualInviteRequired ? "Invite" : "WhatsApp"}
                  </span>
                  <div className="flex items-center gap-2">
                    {detail.receiver.manualInviteRequired ? (
                      <span className="rounded-full bg-[#f3c96b]/12 px-2.5 py-1 text-[0.64rem] font-semibold text-[#f3c96b]">Invite needed</span>
                    ) : (
                      <PaymentNotificationReceipt status={detail.payment.notification_status} />
                    )}
                    <span className="text-[0.74rem] text-[var(--text-soft)]">{detail.receiver.manualInviteRequired ? "Manual follow-up" : formatDateTime(receiptUpdatedAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MANUAL INVITE */}
            {detail.viewerRole === "sender" && detail.receiver.manualInviteRequired && detail.receiver.inviteShare ? (
              <div className="tl-field rounded-[22px] px-5 py-4">
                <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Share invite</div>
                <pre className="mt-3 whitespace-pre-wrap text-[0.78rem] leading-relaxed text-[var(--text-soft)]">{detail.receiver.inviteShare.inviteMessage}</pre>
                <button
                  type="button"
                  onClick={async () => { setShareBusy(true); setError(null); try { const outcome = await shareInviteMessage(detail.receiver.inviteShare!.inviteMessage); if (outcome === "copied") setError("Invite copied to clipboard."); } catch (e) { setError(e instanceof Error ? e.message : "Could not share"); } finally { setShareBusy(false); } }}
                  disabled={shareBusy}
                  className="mt-4 w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
                >
                  {shareBusy ? "Preparing..." : "Share Invite"}
                </button>
              </div>
            ) : null}

            {/* TRACE DETAILS */}
            <div>
              <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Trace</div>
              <div className="space-y-2">
                {[
                  { label: "Reference", value: detail.sender.referenceCode },
                  { label: "Payment ID", value: shortenValue(detail.trace.paymentId, 8, 8) },
                  { label: "Created", value: formatDateTime(detail.payment.created_at) },
                  { label: "Escrow", value: shortenValue(detail.trace.escrowAccount) },
                  ...(viewerFeeLabel && viewerFeeAmount ? [{ label: viewerFeeLabel, value: viewerFeeAmount }] : []),
                ].map((row) => (
                  <div key={row.label} className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">{row.label}</span>
                    <span className="text-[0.82rem] font-medium text-[var(--text)]">{row.value}</span>
                  </div>
                ))}

                {[
                  { label: "Deposit tx", sig: detail.trace.depositSignature, url: detail.trace.depositExplorerUrl },
                  { label: "Claim tx", sig: detail.trace.releaseSignature, url: detail.trace.releaseExplorerUrl },
                  { label: "Expiry tx", sig: detail.trace.expirySignature, url: detail.trace.expiryExplorerUrl },
                ].filter((r) => r.sig).map((row) => (
                  <div key={row.label} className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">{row.label}</span>
                    {row.url ? (
                      <a href={row.url} target="_blank" rel="noreferrer" className="text-[0.82rem] font-medium text-[var(--accent-deep)] dark:text-[var(--accent)] underline underline-offset-4 cursor-pointer">{shortenValue(row.sig, 8, 8)}</a>
                    ) : (
                      <span className="text-[0.82rem] font-medium text-[var(--text)]">{shortenValue(row.sig, 8, 8)}</span>
                    )}
                  </div>
                ))}

                {detail.receiver.releasedWallet ? (
                  <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">Released to</span>
                    <span className="text-[0.82rem] font-medium text-[var(--text)]">{shortenValue(detail.receiver.releasedWallet, 8, 8)}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* TIMELINE */}
            <div>
              <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Timeline</div>
              <div className="space-y-2">
                {detail.timeline.map((entry) => (
                  <div key={entry.id} className="tl-field flex items-start gap-3 rounded-[18px] px-4 py-3.5">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${entry.complete ? "bg-[#4ae8c0]" : "bg-[var(--surface-soft)]"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.84rem] font-semibold text-[var(--text)]">{entry.label}</span>
                        <span className="shrink-0 text-[0.68rem] text-[var(--text-soft)]">{formatDateTime(entry.occurredAt)}</span>
                      </div>
                      <div className="mt-0.5 text-[0.74rem] leading-relaxed text-[var(--text-soft)]">{entry.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRIVACY */}
            <div>
              <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Privacy</div>
              <div className="tl-field rounded-[18px] px-4 py-3.5 text-[0.78rem] leading-relaxed text-[var(--text-soft)]">
                <p>{detail.privacy.senderPhonePolicy}</p>
                <p className="mt-2">Deeper disclosure requires TrustLink's compliance process.</p>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/app/activity" className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Back to activity</Link>
              {detail.receiver.claimReady ? (
                <Link href={`/claim/${detail.payment.id}`} className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Claim payment</Link>
              ) : (
                <Link href="/app" className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Done</Link>
              )}
            </div>
          </>
        ) : (
          <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">Transaction details unavailable.</div>
        )}
      </section>
    </AppMobileShell>
  );
}
