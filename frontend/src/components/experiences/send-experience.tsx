"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { PhoneNumberInput } from "@/src/components/phone-number-input";
import { SectionLoader } from "@/src/components/section-loader";
import { SuccessIcon } from "@/src/components/success-icon";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { isPaymentNotificationFinal } from "@/src/lib/formatters";
import { buildPhoneResolutionPlan } from "@/src/lib/phone-input-resolution";
import {
  detectCountryFromLocale,
  formatPhoneInput,
  getCountryByIso2,
  type CountryOption,
} from "@/src/lib/phone-countries";
import { loadPreferredCountryIso2, rememberCountryUsage } from "@/src/lib/phone-preferences";
import { shareInviteMessage } from "@/src/lib/share";
import type {
  PaymentNotificationStatus,
  PaymentRecord,
  RecipientLookupResult,
  WalletTokenOption,
  WhatsAppNumberVerificationResult,
} from "@/src/lib/types";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getConnectedWalletSession,
  listAvailableSolanaWallets,
  signAndSendSerializedSolanaTransaction,
  type ConnectedWalletSession,
  type DetectedWallet
} from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { ChevronRight, Search } from "lucide-react";

const SEND_RECEIPT_REFRESH_INTERVAL_MS = 20_000;

function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(balance);
}

function formatReceiptTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

type SendCostEstimate = { tokenSymbol: string; senderFeeAmountUi: number; senderFeeAmountUsd: number | null; totalTokenRequiredUi: number; networkFeeSol: number; networkFeeUsd: number | null };

type ResolvedRecipientLookup = { verification: WhatsAppNumberVerificationResult; recipient: RecipientLookupResult | null; normalizedPhone: string; country: CountryOption | null };

function resetRecipientResolution(params: {
  setPhoneVerificationState: (value: "idle" | "checking" | "valid" | "warning" | "invalid") => void;
  setPhoneVerificationLabel: (value: string | null) => void;
  setPhoneVerificationDetails: (value: { displayName: string | null; profilePic: string | null; exists: boolean; isBusiness: boolean; url: string; resolvedPhoneNumber?: string | null; detectedCountry?: CountryOption | null } | null) => void;
  setReceiverWhatsAppVerified: (value: boolean) => void;
  setReceiverCheckSkipped: (value: boolean) => void;
  setRecipientPreview: (value: RecipientLookupResult | null) => void;
  setLookupError: (value: string | null) => void;
  setPreviewBusy: (value: boolean) => void;
  setShowCountryFallback: (value: boolean) => void;
  setSuggestedCountries: (value: CountryOption[]) => void;
  setReceiverCountry: (value: CountryOption | null) => void;
  setForm: Dispatch<SetStateAction<{ receiverPhone: string; amount: string; token: string }>>;
}) {
  params.setPhoneVerificationState("idle");
  params.setPhoneVerificationLabel(null);
  params.setPhoneVerificationDetails(null);
  params.setReceiverWhatsAppVerified(false);
  params.setReceiverCheckSkipped(false);
  params.setRecipientPreview(null);
  params.setLookupError(null);
  params.setPreviewBusy(false);
  params.setShowCountryFallback(false);
  params.setSuggestedCountries([]);
  params.setReceiverCountry(null);
  params.setForm((current) => ({ ...current, receiverPhone: "" }));
}

export function SendExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/send");
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [receiverPhoneInput, setReceiverPhoneInput] = useState("");
  const [receiverCountry, setReceiverCountry] = useState<CountryOption | null>(null);
  const [manualCountry, setManualCountry] = useState<CountryOption | null>(null);
  const [manualCountryLocked, setManualCountryLocked] = useState(false);
  const [showCountryFallback, setShowCountryFallback] = useState(false);
  const [suggestedCountries, setSuggestedCountries] = useState<CountryOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [recipientPreview, setRecipientPreview] = useState<RecipientLookupResult | null>(null);
  const [phoneVerificationState, setPhoneVerificationState] = useState<"idle" | "checking" | "valid" | "warning" | "invalid">("idle");
  const [phoneVerificationLabel, setPhoneVerificationLabel] = useState<string | null>(null);
  const [phoneVerificationDetails, setPhoneVerificationDetails] = useState<{ displayName: string | null; profilePic: string | null; exists: boolean; isBusiness: boolean; url: string; resolvedPhoneNumber?: string | null; detectedCountry?: CountryOption | null } | null>(null);
  const [receiverWhatsAppVerified, setReceiverWhatsAppVerified] = useState(false);
  const [receiverCheckSkipped, setReceiverCheckSkipped] = useState(false);
  const [supportedTokens, setSupportedTokens] = useState<WalletTokenOption[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [sendCostEstimate, setSendCostEstimate] = useState<SendCostEstimate | null>(null);
  const [sendSuccess, setSendSuccess] = useState<{
    paymentId: string; status: PaymentRecord["status"]; notificationStatus: PaymentNotificationStatus;
    notificationSentAt: string | null; notificationDeliveredAt: string | null; notificationReadAt: string | null;
    notificationFailedAt: string | null; referenceCode: string; senderDisplayName: string; senderHandle: string;
    escrowAccount: string | null; blockchainSignature: string; blockchainMode: "mock" | "devnet";
    depositAddress: string | null; notificationRetrying: boolean; notificationAttemptCount: number;
    manualInviteRequired: boolean;
    inviteShare: { onboardingLink: string; inviteMessage: string } | null;
    receiverPhone: string; recipientName: string; amount: string; token: string;
  } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const resolutionCache = useRef(new Map<string, ResolvedRecipientLookup>());
  const latestLookupRequestId = useRef(0);
  const [form, setForm] = useState({ receiverPhone: "", amount: "", token: "" });

  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const preferredCountry = useMemo(() => { const iso2 = loadPreferredCountryIso2(); return getCountryByIso2(iso2) ?? localeCountry; }, [localeCountry]);
  const sendableTokens = useMemo(() => supportedTokens.filter((t) => t.supported), [supportedTokens]);
  const selectedToken = sendableTokens.find((t) => t.mintAddress === form.token) ?? null;
  const walletAddress = walletSession?.address ?? null;
  const sendSuccessPaymentId = sendSuccess?.paymentId ?? null;
  const shouldPollSendSuccessReceipt = sendSuccess ? !sendSuccess.manualInviteRequired && !isPaymentNotificationFinal(sendSuccess.notificationStatus) : false;
  const hasAmount = Number.isFinite(Number(form.amount)) && Number(form.amount) > 0;
  const canContinueWithRecipient = Boolean(walletAddress) && Boolean(selectedToken) && hasAmount && Boolean(recipientPreview?.verified);

  /* ── All useEffects identical to original ── */
  useEffect(() => { setWalletSession(getConnectedWalletSession()); setAvailableWallets(listAvailableSolanaWallets()); }, []);
  useEffect(() => { const p = searchParams.get("phone")?.trim(); if (p) setReceiverPhoneInput(p); }, [searchParams]);

  async function lookupResolvedRecipient(normalizedPhone: string, country: CountryOption | null, options?: { allowUnverified?: boolean }) {
    const key = `${normalizedPhone}:${options?.allowUnverified ? "manual" : "auto"}`;
    const cached = resolutionCache.current.get(key);
    if (cached) return cached;
    const [verification, recipient] = await Promise.all([apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", { phoneNumber: normalizedPhone }), apiPost<RecipientLookupResult>("/api/recipient/lookup", { phoneNumber: normalizedPhone, skipWhatsAppCheck: options?.allowUnverified })]);
    const resolved = { verification, recipient, normalizedPhone, country } satisfies ResolvedRecipientLookup;
    resolutionCache.current.set(key, resolved);
    return resolved;
  }

  function applyRecipientVerificationState(resolved: ResolvedRecipientLookup) {
    const trustLinkVerified = resolved.recipient?.status === "registered";
    const whatsappVerified = resolved.verification.exists || receiverCheckSkipped;
    setReceiverWhatsAppVerified(whatsappVerified);
    setPhoneVerificationState(trustLinkVerified || whatsappVerified ? (whatsappVerified ? "valid" : "warning") : "warning");
    setPhoneVerificationLabel(trustLinkVerified && !whatsappVerified ? "Verify on WhatsApp or skip to continue." : null);
  }

  function applyResolvedRecipient(resolved: ResolvedRecipientLookup) {
    setForm((c) => ({ ...c, receiverPhone: resolved.normalizedPhone }));
    setReceiverCountry(resolved.country); setShowCountryFallback(false); setSuggestedCountries([]); setLookupError(null);
    applyRecipientVerificationState(resolved);
    setPhoneVerificationDetails({ displayName: resolved.verification.displayName, profilePic: resolved.verification.profilePic, exists: resolved.verification.exists, isBusiness: resolved.verification.isBusiness, url: resolved.verification.url, resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone), detectedCountry: resolved.country });
    setRecipientPreview(resolved.recipient);
  }

  function applyRecipientResolutionPreview(resolved: ResolvedRecipientLookup, options?: { revealCountryFallback?: boolean }) {
    setForm((c) => ({ ...c, receiverPhone: resolved.normalizedPhone }));
    setReceiverCountry(resolved.country); setShowCountryFallback(Boolean(options?.revealCountryFallback));
    setSuggestedCountries(resolved.country ? [resolved.country, ...suggestedCountries].filter((c, i, a) => a.findIndex((x) => x.iso2 === c.iso2) === i) : suggestedCountries);
    setLookupError(null); applyRecipientVerificationState(resolved);
    setPhoneVerificationDetails({ displayName: resolved.verification.displayName, profilePic: resolved.verification.profilePic, exists: resolved.verification.exists, isBusiness: resolved.verification.isBusiness, url: resolved.verification.url, resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone), detectedCountry: resolved.country });
    setRecipientPreview(resolved.recipient);
  }

  useEffect(() => { if (!walletAddress) { setSupportedTokens([]); setForm((c) => ({ ...c, token: "" })); return; } const ctrl = new AbortController(); async function load() { setTokenBusy(true); try { const r = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", { walletAddress }); if (ctrl.signal.aborted) return; setSupportedTokens(r.tokens); setForm((c) => ({ ...c, token: r.tokens.find((t) => t.supported && t.mintAddress === c.token)?.mintAddress ?? r.tokens.find((t) => t.supported)?.mintAddress ?? "" })); } catch (e) { if (!ctrl.signal.aborted) { setSupportedTokens([]); setError(e instanceof Error ? e.message : "Could not load tokens"); } } finally { if (!ctrl.signal.aborted) setTokenBusy(false); } } void load(); return () => ctrl.abort(); }, [walletAddress]);

  useEffect(() => { const trimmed = receiverPhoneInput.trim(); if (!trimmed) { resetRecipientResolution({ setPhoneVerificationState, setPhoneVerificationLabel, setPhoneVerificationDetails, setReceiverWhatsAppVerified, setReceiverCheckSkipped, setRecipientPreview, setLookupError, setPreviewBusy, setShowCountryFallback, setSuggestedCountries, setReceiverCountry, setForm }); return; } const reqId = latestLookupRequestId.current + 1; latestLookupRequestId.current = reqId; const timer = window.setTimeout(async () => { setPreviewBusy(true); setLookupError(null); setPhoneVerificationDetails(null); setRecipientPreview(null); setReceiverWhatsAppVerified(false); setShowCountryFallback(false); setPhoneVerificationState("checking"); setPhoneVerificationLabel("Detecting recipient..."); try { let resolved: ResolvedRecipientLookup | null = null; const plan = buildPhoneResolutionPlan({ input: trimmed, localeCountry, preferredCountry, selectedCountry: manualCountry, selectedCountryLocked: manualCountryLocked }); if (plan.kind === "idle") { setPhoneVerificationState("idle"); setPhoneVerificationLabel(null); setPreviewBusy(false); return; } if (plan.kind === "fallback") { setForm((c) => ({ ...c, receiverPhone: "" })); setReceiverCountry(null); setSuggestedCountries(plan.suggestedCountries); setShowCountryFallback(!manualCountryLocked); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); setPreviewBusy(false); return; } setSuggestedCountries(plan.suggestedCountries); const candidates = plan.kind === "single" ? [plan.candidate] : plan.candidates; for (const candidate of candidates) { resolved = await lookupResolvedRecipient(candidate.normalizedPhone, candidate.country, { allowUnverified: receiverCheckSkipped }); if (latestLookupRequestId.current !== reqId) return; if (resolved.recipient?.verified) { applyResolvedRecipient(resolved); return; } if (plan.kind === "single") { applyRecipientResolutionPreview(resolved, { revealCountryFallback: candidate.revealFallback }); return; } } setForm((c) => ({ ...c, receiverPhone: "" })); setReceiverCountry(null); setShowCountryFallback(!manualCountryLocked); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); } catch (e) { setLookupError(e instanceof Error ? e.message : "Could not verify recipient"); setRecipientPreview(null); setReceiverWhatsAppVerified(false); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); setShowCountryFallback(!manualCountryLocked); } finally { if (latestLookupRequestId.current === reqId) setPreviewBusy(false); } }, 420); return () => window.clearTimeout(timer); }, [localeCountry, manualCountry, manualCountryLocked, preferredCountry, receiverCheckSkipped, receiverPhoneInput]);

  useEffect(() => { if (!sendSuccessPaymentId || !accessToken) return; let cancelled = false; async function refresh() { try { const r = await apiGet<{ payment: PaymentRecord }>(`/api/payment/${sendSuccessPaymentId}`, accessToken ?? undefined); if (cancelled) return; setSendSuccess((c) => { if (!c || c.paymentId !== r.payment.id) return c; return { ...c, status: r.payment.status, notificationStatus: r.payment.notification_status, notificationSentAt: r.payment.notification_sent_at, notificationDeliveredAt: r.payment.notification_delivered_at, notificationReadAt: r.payment.notification_read_at, notificationFailedAt: r.payment.notification_failed_at, notificationRetrying: r.payment.notification_status === "queued" || r.payment.notification_status === "failed", notificationAttemptCount: r.payment.notification_attempt_count ?? c.notificationAttemptCount }; }); } catch { } } void refresh(); if (!shouldPollSendSuccessReceipt) return () => { cancelled = true; }; const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void refresh(); }, SEND_RECEIPT_REFRESH_INTERVAL_MS); return () => { cancelled = true; window.clearInterval(interval); }; }, [accessToken, sendSuccessPaymentId, shouldPollSendSuccessReceipt]);

  /* ── All handlers identical to original ── */
  async function handleConnectWallet() { setError(null); const w = listAvailableSolanaWallets(); setAvailableWallets(w); if (w.length === 0) { setError("Install a Solana wallet to connect."); showToast("No Solana wallet detected."); return; } setWalletPickerOpen(true); }
  async function handleWalletSelect(walletId: string) { setConnectingWalletId(walletId); setError(null); try { const s = await connectSolanaWallet(walletId); setWalletSession(s); setWalletPickerOpen(false); setNotice(`${s.walletName} connected.`); showToast(`${s.walletName} connected.`); } catch (e) { setError(e instanceof Error ? e.message : "Could not connect wallet"); } finally { setConnectingWalletId(null); } }
  async function handleDisconnectWallet() { await disconnectSolanaWallet(); setWalletSession(null); setNotice("Wallet disconnected."); showToast("Wallet disconnected."); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!user || !walletAddress) { setError("Connect a sender wallet first."); return; } if (!recipientPreview?.verified) { setError("Verify the recipient before sending."); showToast("Verify the recipient first."); return; } if (!selectedToken) { setError("Choose a token before sending."); showToast("Choose a token first."); return; } setEstimateBusy(true); setError(null); try { const r = await apiPost<{ estimate: SendCostEstimate }>("/api/payment/estimate", { phoneNumber: form.receiverPhone, senderPhoneNumber: user.phoneNumber, amount: Number(form.amount), tokenMintAddress: selectedToken.mintAddress, senderWallet: walletAddress }); setSendCostEstimate(r.estimate); setConfirmOpen(true); } catch (e) { const msg = e instanceof Error ? e.message : "Could not estimate transfer cost"; setError(msg); showToast(msg); } finally { setEstimateBusy(false); } }

  async function handleConfirmSend() { if (!user || !walletAddress || !selectedToken) { setError("Connect wallet and choose token first."); return; } if (!recipientPreview?.verified) { setError("Verify the recipient first."); return; } const recipientName = recipientPreview.recipient.displayName; setBusy(true); setError(null); setNotice(null); try { const prepared = await apiPost<{ paymentId: string; escrowAccount: string | null; escrowVaultAddress: string | null; blockchainMode: "mock" | "devnet"; serializedTransaction: string | null; tokenSymbol: string | null; senderFeeAmount: string | number | null; totalTokenRequiredAmount: string | number | null }>("/api/payment/create", { phoneNumber: form.receiverPhone, senderPhoneNumber: user.phoneNumber, amount: Number(form.amount), tokenMintAddress: selectedToken.mintAddress, senderWallet: walletAddress, skipWhatsAppCheck: receiverCheckSkipped }); if (!prepared.serializedTransaction || !prepared.escrowVaultAddress) throw new Error("Could not prepare escrow transaction"); setNotice(`Approve the ${prepared.tokenSymbol ?? selectedToken.symbol} escrow in ${walletSession?.walletName ?? "your wallet"}...`); const sig = await signAndSendSerializedSolanaTransaction({ walletId: walletSession!.walletId, rpcUrl: (await apiGet<{ rpcUrl: string }>("/api/wallet/deposit-target")).rpcUrl, serializedTransaction: prepared.serializedTransaction }); const result = await apiPost<{ paymentId: string; status: PaymentRecord["status"]; notificationStatus: PaymentNotificationStatus; notificationSentAt: string | null; notificationDeliveredAt: string | null; notificationReadAt: string | null; notificationFailedAt: string | null; referenceCode: string; senderDisplayName: string; senderHandle: string; escrowAccount: string | null; blockchainSignature: string; blockchainMode: "mock" | "devnet"; depositAddress: string | null; tokenSymbol: string | null; notificationRetrying: boolean; notificationAttemptCount: number; manualInviteRequired: boolean; inviteShare: { onboardingLink: string; inviteMessage: string } | null }>("/api/payment/create", { paymentId: prepared.paymentId, phoneNumber: form.receiverPhone, senderPhoneNumber: user.phoneNumber, amount: Number(form.amount), tokenMintAddress: selectedToken.mintAddress, senderWallet: walletAddress, escrowVaultAddress: prepared.escrowVaultAddress, depositSignature: sig, skipWhatsAppCheck: receiverCheckSkipped }); if (receiverCountry) rememberCountryUsage(receiverCountry.iso2); setNotice(null); setSendSuccess({ ...result, receiverPhone: form.receiverPhone, recipientName, amount: form.amount, token: result.tokenSymbol ?? selectedToken.symbol }); setReceiverPhoneInput(""); setManualCountry(null); setManualCountryLocked(false); setShowCountryFallback(false); setSuggestedCountries([]); setForm((c) => ({ ...c, receiverPhone: "", amount: "2.5" })); setRecipientPreview(null); setConfirmOpen(false); showToast(result.manualInviteRequired ? `Payment secured. Share invite manually. Ref ${result.referenceCode}.` : result.notificationRetrying ? `Payment secured. WhatsApp retrying. Ref ${result.referenceCode}.` : `Payment sent. Ref ${result.referenceCode}.`); } catch (e) { if (e instanceof Error && /already signed|recovered|Do not confirm/i.test(e.message)) { setError(e.message); showToast(e.message); } else { const msg = e instanceof Error ? e.message : "Could not create payment"; setError(msg); showToast(msg); } } finally { setBusy(false); } }

  if (!hydrated || !user) return null;

  const receiptTimestamp = sendSuccess?.notificationReadAt ?? sendSuccess?.notificationDeliveredAt ?? sendSuccess?.notificationSentAt ?? sendSuccess?.notificationFailedAt ?? null;

  /* ═══════════ RENDER ═══════════ */

  return (
    <AppMobileShell currentTab="send" title="Send" subtitle="Confirm the person, choose a supported token, then move funds into escrow." user={user} showBackButton backHref="/app"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {/* ── Notices ── */}
        {notice && !sendSuccess ? (
          <div className="tl-badge rounded-[18px] px-4 py-3 text-[0.82rem]">{notice}</div>
        ) : null}
        {error ? (
          <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">{error}</div>
        ) : null}

        {/* ═══════════ SEND SUCCESS ═══════════ */}
        {sendSuccess ? (
          <div className="space-y-5">

            {/* Hero */}
            <div className="text-center py-2">
              <SuccessIcon className="mx-auto h-14 w-14" />
              <div className="mt-4 tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Transfer sent</div>
              <h2 className="mt-2 text-[1.6rem] font-bold tracking-tight text-[var(--text)]">
                {sendSuccess.amount} {sendSuccess.token}
              </h2>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-[var(--text-soft)] max-w-[300px] mx-auto">
                {sendSuccess.manualInviteRequired
                  ? `Funds secured in escrow for ${sendSuccess.recipientName}. Share the invite manually.`
                  : sendSuccess.notificationRetrying
                    ? `Funds secured for ${sendSuccess.recipientName}. WhatsApp delivery retrying.`
                    : `Sent to ${sendSuccess.recipientName} via WhatsApp. Funds in escrow for claim.`}
              </p>
            </div>

            {/* Receipt rows */}
            <div className="space-y-2">
              {[
                { label: "Recipient", value: sendSuccess.recipientName },
                { label: "WhatsApp", value: sendSuccess.receiverPhone },
                { label: "Reference", value: sendSuccess.referenceCode },
                { label: "Status", value: sendSuccess.status, capitalize: true },
              ].map((row) => (
                <div key={row.label} className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">{row.label}</span>
                  <span className={`text-[0.82rem] font-medium text-[var(--text)] ${row.capitalize ? "capitalize" : ""}`}>{row.value}</span>
                </div>
              ))}

              {!sendSuccess.manualInviteRequired ? (
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">WhatsApp receipt</span>
                  <PaymentNotificationReceipt status={sendSuccess.notificationStatus} />
                </div>
              ) : (
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Sender invite</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">Share manually</span>
                </div>
              )}

              {sendSuccess.notificationRetrying ? (
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Delivery retries</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{sendSuccess.notificationAttemptCount}</span>
                </div>
              ) : null}

              {!sendSuccess.manualInviteRequired && receiptTimestamp ? (
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Receipt updated</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{formatReceiptTime(receiptTimestamp)}</span>
                </div>
              ) : null}

              <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                <span className="text-[0.78rem] text-[var(--text-soft)]">{sendSuccess.blockchainMode === "mock" ? "Mock ref" : "Deposit tx"}</span>
                <span className="text-[0.82rem] font-medium text-[var(--text)]">{shortenAddress(sendSuccess.blockchainSignature)}</span>
              </div>
            </div>

            <div className="text-[0.72rem] text-[var(--text-soft)] leading-relaxed">
              {sendSuccess.blockchainMode === "mock"
                ? "Mock mode — reference is not an on-chain signature."
                : "Receipts refresh while delivery is unresolved."}
            </div>

            {/* Manual invite share */}
            {sendSuccess.manualInviteRequired && sendSuccess.inviteShare ? (
              <div className="tl-field rounded-[22px] px-5 py-4">
                <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Shareable invite</div>
                <pre className="mt-3 whitespace-pre-wrap text-[0.82rem] leading-relaxed text-[var(--text-soft)]">{sendSuccess.inviteShare.inviteMessage}</pre>
                <button
                  type="button"
                  onClick={async () => { setShareBusy(true); try { const outcome = await shareInviteMessage(sendSuccess.inviteShare!.inviteMessage); showToast(outcome === "shared" ? "Share dialog opened." : "Invite copied."); } catch (e) { setError(e instanceof Error ? e.message : "Could not share invite"); } finally { setShareBusy(false); } }}
                  disabled={shareBusy}
                  className="mt-4 w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
                >
                  {shareBusy ? "Preparing..." : "Share Invite"}
                </button>
              </div>
            ) : null}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/app" className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Back home</Link>
              <button type="button" onClick={() => { setSendSuccess(null); setNotice(null); }} className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Send another</button>
            </div>
          </div>
        ) : (

          /* ═══════════ SEND FORM ═══════════ */
          <form className="space-y-4" onSubmit={handleSubmit}>

            {/* Recipient input */}
            <PhoneNumberInput
              label="Receiver WhatsApp number"
              value={receiverPhoneInput}
              placeholder="Enter phone number"
              verificationState={phoneVerificationState}
              verificationLabel={phoneVerificationLabel}
              verificationDetails={phoneVerificationDetails}
              recipientPreview={recipientPreview}
              lookupBusy={previewBusy}
              lookupError={lookupError}
              showVerificationActions={!receiverCheckSkipped && !receiverWhatsAppVerified}
              showCountryFallback={showCountryFallback}
              selectedCountry={manualCountry}
              suggestedCountries={suggestedCountries}
              onChange={(value) => { setReceiverPhoneInput(value); setManualCountry(null); setManualCountryLocked(false); setConfirmOpen(false); setSendCostEstimate(null); setLookupError(null); setRecipientPreview(null); setPhoneVerificationDetails(null); setReceiverCheckSkipped(false); setForm((c) => ({ ...c, receiverPhone: "" })); }}
              onCountrySelect={(country) => { setManualCountry(country); setManualCountryLocked(true); setReceiverCountry(country); setReceiverCheckSkipped(false); setLookupError(null); setShowCountryFallback(false); setPhoneVerificationState("checking"); setPhoneVerificationLabel(`Retrying with ${country.name}...`); }}
              onSkipVerification={() => { setReceiverCheckSkipped(true); setReceiverWhatsAppVerified(true); setLookupError(null); setPhoneVerificationState("valid"); setPhoneVerificationLabel(manualCountry ? `Continuing with ${manualCountry.name}...` : null); }}
              skipVerificationLabel={receiverCheckSkipped ? null : "Skip"}
            />

            {/* Amount + Token row */}
            <div className="flex items-stretch rounded-[22px] tl-field overflow-hidden transition-all focus-within:border-[var(--accent-deep)]/30">
              <div className="flex flex-1 flex-col px-4 py-3.5">
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Amount</span>
                <input
                  type="number"
                  step="any"
                  value={form.amount}
                  onChange={(e) => { setForm((c) => ({ ...c, amount: e.target.value })); setSendCostEstimate(null); }}
                  placeholder="0.00"
                  className="mt-1 w-full bg-transparent text-[1rem] font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                />
              </div>

              <div className="my-3.5 w-px bg-[var(--surface-soft)]" />

              <button
                type="button"
                onClick={() => setTokenPickerOpen(true)}
                className="flex w-[120px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.98]"
              >
                {selectedToken ? (
                  <div className="flex flex-col overflow-hidden text-left">
                    <span className="text-[0.84rem] font-bold text-[var(--text)]">{selectedToken.symbol}</span>
                    <span className="truncate text-[0.62rem] text-[var(--accent-deep)] dark:text-[var(--accent)]">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</span>
                  </div>
                ) : (
                  <span className="text-[0.82rem] text-[var(--text-soft)]">Token</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-faint)]" />
              </button>
            </div>

            {/* Flow explainer */}
            <div className="tl-field rounded-[18px] px-4 py-3.5">
              <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--text-soft)]">How it works</div>
              <p className="mt-1.5 text-[0.76rem] leading-relaxed text-[var(--text-soft)]">
                Verify recipient → escrow funds → receiver claims via WhatsApp OTP.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy || estimateBusy || !canContinueWithRecipient}
              className="w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] shadow-softbox disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
            >
              {estimateBusy ? "Calculating fee..." : "Review payment"}
            </button>
          </form>
        )}
      </section>

      {/* ═══════════ TOKEN PICKER MODAL ═══════════ */}
      {tokenPickerOpen ? (
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setTokenPickerOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Choose token</h2>
              <p className="mt-1 text-[0.82rem] text-[var(--text-soft)]">Supported tokens from your wallet.</p>
            </div>
            <div className="space-y-2.5">
              {tokenBusy ? (
                <div className="tl-field rounded-[18px] px-4 py-5"><SectionLoader size="md" label="Loading tokens..." /></div>
              ) : sendableTokens.map((token) => {
                const active = token.mintAddress === form.token;
                return (
                  <button key={token.mintAddress} type="button"
                    onClick={() => { setForm((c) => ({ ...c, token: token.mintAddress })); setSendCostEstimate(null); setTokenPickerOpen(false); }}
                    className={`tl-field flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors cursor-pointer active:scale-[0.99] ${active ? "border-[var(--accent-deep)]/30 bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-soft)]"}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.9rem]">{token.logo}</span>
                      <span>
                        <span className="block text-[0.84rem] font-semibold leading-tight text-[var(--text)]">{token.symbol}</span>
                        <span className="tl-text-soft block mt-0.5 text-[0.68rem] leading-tight">{token.name}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[0.84rem] font-semibold leading-tight text-[var(--text)]">{formatTokenBalance(token.balance, token.symbol)}</span>
                      <span className="tl-text-soft block mt-0.5 text-[0.68rem] leading-tight">Available</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══════════ CONFIRM MODAL ═══════════ */}
      {confirmOpen && recipientPreview?.verified && selectedToken ? (
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setConfirmOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Confirm transfer</h2>
              <p className="mt-1 text-[0.82rem] text-[var(--text-soft)]">Verify details before funds move into escrow.</p>
            </div>

            <div className="space-y-2.5">
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--text-soft)]">Sending to</div>
                <div className="mt-1.5 text-[0.92rem] font-semibold text-[var(--text)]">
                  {recipientPreview.recipient.displayName}
                  {"handle" in recipientPreview.recipient && recipientPreview.recipient.handle ? ` (@${recipientPreview.recipient.handle})` : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required" ? " (Not on TrustLink)" : ""}
                </div>
                {recipientPreview.recipient.whatsappProfileName && recipientPreview.recipient.whatsappProfileName !== recipientPreview.recipient.displayName ? (
                  <div className="mt-1 text-[0.76rem] text-[var(--text-soft)]">WhatsApp: {recipientPreview.recipient.whatsappProfileName}</div>
                ) : null}
              </div>

              <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
                <span className="text-[0.84rem] font-medium text-[var(--text)]">{form.amount} {selectedToken.symbol}</span>
                <span className="text-[0.78rem] text-[var(--text-soft)]">{form.receiverPhone}</span>
              </div>

              {sendCostEstimate ? (
                <>
                  <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">Sender fee</span>
                    <span className="text-[0.82rem] font-medium text-[var(--text)]">{sendCostEstimate.senderFeeAmountUi.toFixed(6)} {selectedToken.symbol}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="tl-field rounded-[14px] px-3 py-2.5 text-[0.7rem] text-[var(--text-soft)]">Network: {sendCostEstimate.networkFeeSol.toFixed(6)} SOL</div>
                    <div className="tl-field rounded-[14px] px-3 py-2.5 text-[0.7rem] text-[var(--text-soft)]">Total: {sendCostEstimate.totalTokenRequiredUi.toFixed(6)} {selectedToken.symbol}</div>
                  </div>
                  {sendCostEstimate.senderFeeAmountUsd != null ? (
                    <div className="text-[0.72rem] text-[var(--text-soft)]">≈ ${sendCostEstimate.senderFeeAmountUsd.toFixed(4)} fee at current price.</div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Cancel</button>
              <button type="button" onClick={() => void handleConfirmSend()} disabled={busy} className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] shadow-softbox disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform">{busy ? "Sending..." : "Confirm send"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <WalletPickerModal open={walletPickerOpen} wallets={availableWallets} connectingWalletId={connectingWalletId} onClose={() => { if (!connectingWalletId) setWalletPickerOpen(false); }} onSelect={(id) => void handleWalletSelect(id)} />
    </AppMobileShell>
  );
}
