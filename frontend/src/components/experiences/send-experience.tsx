"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { PhoneNumberInput } from "@/src/components/phone-number-input";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import { apiGet, apiPost } from "@/src/lib/api";
import { isPaymentNotificationFinal } from "@/src/lib/formatters";
import { buildPhoneResolutionPlan } from "@/src/lib/phone-input-resolution";
import {
  detectCountryFromLocale,
  formatPhoneInput,
  getCountryByIso2,
  COUNTRY_OPTIONS,
  type CountryOption,
} from "@/src/lib/phone-countries";
import { loadPreferredCountryIso2, rememberCountryUsage } from "@/src/lib/phone-preferences";
import type {
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
  signSolanaMessage,
  signSolanaTransaction,
  type ConnectedWalletSession,
  type DetectedWallet
} from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { enqueueTsnPaymentFromFrontend, estimateTsnSendCostFromChain } from "@/src/lib/tsn";
import {
  createPaymentAuthorization,
} from "@trustlink/tsn-sdk/payment-authorization";
import { buildTsnSponsoredSettlementTransaction } from "@trustlink/tsn-sdk/sponsored-settlement";
import {
  formatUsd,
  hasCompleteCostEstimate,
  normalizeSendCostEstimate,
  type SendCostEstimate,
} from "@/src/components/experiences/send/shared/send-cost";
import { getSendGuidance } from "@/src/components/experiences/send/shared/send-guidance";
import { AlertCircle, ChevronDown, ChevronRight, Globe, Loader2, RefreshCw } from "lucide-react";
import { CountrySearchModal } from "@/src/components/experiences/send/components/CountrySearchModal";
import { SendSuccessPanel } from "@/src/components/experiences/send/components/SendSuccessPanel";
import { formatTokenBalance } from "@/src/components/experiences/send/utils/formatting";
import { looksLikeTinCandidate, normalizeTinInput } from "@/src/components/experiences/send/utils/tin-input";
import { resetRecipientResolution } from "@/src/components/experiences/send/utils/reset-recipient-resolution";
import type { PhoneVerificationDetails, RecipientVerificationState, ResolvedRecipientLookup, SendSuccessState } from "@/src/components/experiences/send/types";

const SEND_RECEIPT_REFRESH_INTERVAL_MS = 20_000;

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
  const [phoneVerificationState, setPhoneVerificationState] = useState<RecipientVerificationState>("idle");
  const [phoneVerificationLabel, setPhoneVerificationLabel] = useState<string | null>(null);
  const [phoneVerificationDetails, setPhoneVerificationDetails] = useState<PhoneVerificationDetails | null>(null);
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
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<SendSuccessState | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [countrySearchOpen, setCountrySearchOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const hasVerifiedOnce = phoneVerificationState !== "idle" && phoneVerificationState !== "checking";
  const resolutionCache = useRef(new Map<string, ResolvedRecipientLookup>());
  const latestLookupRequestId = useRef(0);
  const [form, setForm] = useState({ receiverPhone: "", amount: "", token: "" });

  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const preferredCountry = useMemo(() => { const iso2 = loadPreferredCountryIso2(); return getCountryByIso2(iso2) ?? localeCountry; }, [localeCountry]);
  const sendableTokens = useMemo(() => supportedTokens.filter((t) => t.supported), [supportedTokens]);
  const selectedToken = sendableTokens.find((t) => t.mintAddress === form.token) ?? null;
  const walletAddress = walletSession?.address ?? null;
  const displayCountry = manualCountry ?? receiverCountry ?? phoneVerificationDetails?.detectedCountry ?? preferredCountry ?? localeCountry;
  const allCountries = useMemo(() => COUNTRY_OPTIONS, []);
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return allCountries;
    const q = countrySearchQuery.toLowerCase();
    return allCountries.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.iso2.toLowerCase().includes(q));
  }, [allCountries, countrySearchQuery]);
  const sendSuccessPaymentId = sendSuccess?.paymentId ?? null;
  const shouldPollSendSuccessReceipt = sendSuccess ? !sendSuccess.manualInviteRequired && !isPaymentNotificationFinal(sendSuccess.notificationStatus) : false;
  const hasAmount = Number.isFinite(Number(form.amount)) && Number(form.amount) > 0;
  const receiverInputLooksLikeTin = looksLikeTinCandidate(receiverPhoneInput);
  const canContinueWithRecipient = Boolean(walletAddress) && Boolean(selectedToken) && hasAmount && Boolean(recipientPreview?.verified);
  const costEstimateReady = hasCompleteCostEstimate(sendCostEstimate);
  const confirmSendDisabled = busy || estimateBusy || !costEstimateReady;
  const sendGuidance = useMemo(() => getSendGuidance(error), [error]);

  useEffect(() => { setWalletSession(getConnectedWalletSession()); setAvailableWallets(listAvailableSolanaWallets()); }, []);
  useEffect(() => { const p = searchParams.get("phone")?.trim(); if (p) setReceiverPhoneInput(p); }, [searchParams]);

  async function lookupResolvedRecipient(normalizedPhone: string, country: CountryOption | null, options?: { allowUnverified?: boolean }) {
    const key = `${normalizedPhone}:${options?.allowUnverified ? "manual" : "auto"}`;
    const cached = resolutionCache.current.get(key);
    if (cached) return cached;
    const [verification, recipient] = await Promise.all([apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", { phoneNumber: normalizedPhone }, undefined, { cache: "default", ttlMs: 5 * 60_000 }), apiPost<RecipientLookupResult>("/api/recipient/lookup", { phoneNumber: normalizedPhone, skipWhatsAppCheck: options?.allowUnverified }, undefined, { cache: "default", ttlMs: 60_000 })]);
    const resolved = { verification, recipient, normalizedPhone, country } satisfies ResolvedRecipientLookup;
    resolutionCache.current.set(key, resolved);
    return resolved;
  }

  async function lookupResolvedTin(tin: string) {
    const key = `tin:${tin}`;
    const cached = resolutionCache.current.get(key);
    if (cached) return cached;
    const recipient = await apiPost<RecipientLookupResult>("/api/recipient/lookup", { tin }, undefined, { cache: "default", ttlMs: 60_000 });
    const normalizedPhone = recipient?.recipient.phoneNumber ?? "";
    const verification: WhatsAppNumberVerificationResult = {
      phoneNumber: normalizedPhone,
      exists: Boolean(recipient?.verified),
      accountType: "personal_or_none",
      isBusiness: false,
      isInvalid: !recipient?.verified,
      displayName: recipient?.recipient.displayName ?? `TIN ${tin}`,
      profilePic: null,
      hasProfilePic: false,
      url: normalizedPhone ? `https://wa.me/${normalizedPhone.replace(/\D/g, "")}` : "",
      source: "mock",
    };
    const resolved = { verification, recipient, normalizedPhone, country: null } satisfies ResolvedRecipientLookup;
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

  /* Always reveal country fallback when WhatsApp didn't verify */
  function applyRecipientResolutionPreview(resolved: ResolvedRecipientLookup, options?: { revealCountryFallback?: boolean }) {
    setForm((c) => ({ ...c, receiverPhone: resolved.normalizedPhone }));
    setReceiverCountry(resolved.country);
    const shouldReveal = Boolean(options?.revealCountryFallback) || !resolved.verification.exists;
    setShowCountryFallback(shouldReveal);
    setSuggestedCountries(resolved.country ? [resolved.country, ...suggestedCountries].filter((c, i, a) => a.findIndex((x) => x.iso2 === c.iso2) === i) : suggestedCountries);
    setLookupError(null); applyRecipientVerificationState(resolved);
    setPhoneVerificationDetails({ displayName: resolved.verification.displayName, profilePic: resolved.verification.profilePic, exists: resolved.verification.exists, isBusiness: resolved.verification.isBusiness, url: resolved.verification.url, resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone), detectedCountry: resolved.country });
    setRecipientPreview(resolved.recipient);
  }

  useEffect(() => { if (!walletAddress) { setSupportedTokens([]); setForm((c) => ({ ...c, token: "" })); return; } const ctrl = new AbortController(); async function load() { setTokenBusy(true); try { const r = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", { walletAddress }, undefined, { cache: "default", ttlMs: 20_000 }); if (ctrl.signal.aborted) return; setSupportedTokens(r.tokens); setForm((c) => ({ ...c, token: r.tokens.find((t) => t.supported && t.mintAddress === c.token)?.mintAddress ?? r.tokens.find((t) => t.supported)?.mintAddress ?? "" })); } catch (e) { if (!ctrl.signal.aborted) { setSupportedTokens([]); setError(e instanceof Error ? e.message : "Could not load tokens"); } } finally { if (!ctrl.signal.aborted) setTokenBusy(false); } } void load(); return () => ctrl.abort(); }, [walletAddress]);

  /* catch block always reveals country fallback and unlocks */
  useEffect(() => { const trimmed = receiverPhoneInput.trim(); if (!trimmed) { resetRecipientResolution({ setPhoneVerificationState, setPhoneVerificationLabel, setPhoneVerificationDetails, setReceiverWhatsAppVerified, setReceiverCheckSkipped, setRecipientPreview, setLookupError, setPreviewBusy, setShowCountryFallback, setSuggestedCountries, setReceiverCountry, setForm }); return; } const reqId = latestLookupRequestId.current + 1; latestLookupRequestId.current = reqId; const timer = window.setTimeout(async () => { setPreviewBusy(true); setLookupError(null); setPhoneVerificationDetails(null); setRecipientPreview(null); setReceiverWhatsAppVerified(false); setShowCountryFallback(false); setPhoneVerificationState("checking"); setPhoneVerificationLabel("Detecting recipient..."); try { let resolved: ResolvedRecipientLookup | null = null; const tin = normalizeTinInput(trimmed); if (tin) { resolved = await lookupResolvedTin(tin); if (latestLookupRequestId.current !== reqId) return; if (resolved.recipient?.verified && resolved.normalizedPhone) { applyResolvedRecipient(resolved); return; } setForm((c) => ({ ...c, receiverPhone: "" })); setReceiverCountry(null); setShowCountryFallback(false); setPhoneVerificationState("invalid"); setPhoneVerificationLabel(null); setLookupError("No TrustLink account is linked to this TIN yet."); return; } const plan = buildPhoneResolutionPlan({ input: trimmed, localeCountry, preferredCountry, selectedCountry: manualCountry, selectedCountryLocked: manualCountryLocked }); if (plan.kind === "idle") { setPhoneVerificationState("idle"); setPhoneVerificationLabel(null); setPreviewBusy(false); return; } if (plan.kind === "fallback") { setForm((c) => ({ ...c, receiverPhone: "" })); setReceiverCountry(null); setSuggestedCountries(plan.suggestedCountries); setShowCountryFallback(true); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); setPreviewBusy(false); return; } setSuggestedCountries(plan.suggestedCountries); const candidates = plan.kind === "single" ? [plan.candidate] : plan.candidates; for (const candidate of candidates) { resolved = await lookupResolvedRecipient(candidate.normalizedPhone, candidate.country, { allowUnverified: receiverCheckSkipped }); if (latestLookupRequestId.current !== reqId) return; if (resolved.recipient?.verified) { applyResolvedRecipient(resolved); return; } if (plan.kind === "single") { applyRecipientResolutionPreview(resolved, { revealCountryFallback: candidate.revealFallback }); return; } } setForm((c) => ({ ...c, receiverPhone: "" })); setReceiverCountry(null); setShowCountryFallback(true); setManualCountryLocked(false); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); } catch (e) { setLookupError(e instanceof Error ? e.message : "Could not verify recipient"); setRecipientPreview(null); setReceiverWhatsAppVerified(false); setPhoneVerificationState("warning"); setPhoneVerificationLabel(null); setShowCountryFallback(true); setManualCountryLocked(false); } finally { if (latestLookupRequestId.current === reqId) setPreviewBusy(false); } }, 420); return () => window.clearTimeout(timer); }, [localeCountry, manualCountry, manualCountryLocked, preferredCountry, receiverCheckSkipped, receiverPhoneInput]);

  useEffect(() => { if (!sendSuccessPaymentId || !accessToken) return; let cancelled = false; async function refresh() { try { const r = await apiGet<{ payment: PaymentRecord | null }>(`/api/payment/${sendSuccessPaymentId}`, accessToken ?? undefined); if (cancelled || !r.payment) return; setSendSuccess((c) => { if (!c || c.paymentId !== r.payment!.id) return c; return { ...c, status: r.payment!.status, notificationStatus: r.payment!.notification_status, notificationSentAt: r.payment!.notification_sent_at, notificationDeliveredAt: r.payment!.notification_delivered_at, notificationReadAt: r.payment!.notification_read_at, notificationFailedAt: r.payment!.notification_failed_at, notificationRetrying: r.payment!.notification_status === "queued" || r.payment!.notification_status === "failed", notificationAttemptCount: r.payment!.notification_attempt_count ?? c.notificationAttemptCount }; }); } catch { } } void refresh(); if (!shouldPollSendSuccessReceipt) return () => { cancelled = true; }; const interval = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState !== "visible") return; void refresh(); }, SEND_RECEIPT_REFRESH_INTERVAL_MS); return () => { cancelled = true; window.clearInterval(interval); }; }, [accessToken, sendSuccessPaymentId, shouldPollSendSuccessReceipt]);

  async function handleConnectWallet() { setError(null); const w = listAvailableSolanaWallets(); setAvailableWallets(w); if (w.length === 0) { setError("Install a Solana wallet to connect."); showToast("No Solana wallet detected."); return; } setWalletPickerOpen(true); }
  async function handleWalletSelect(walletId: string) { setConnectingWalletId(walletId); setError(null); try { const s = await connectSolanaWallet(walletId); setWalletSession(s); setWalletPickerOpen(false); setNotice(`${s.walletName} connected.`); showToast(`${s.walletName} connected.`); } catch (e) { setError(e instanceof Error ? e.message : "Could not connect wallet"); } finally { setConnectingWalletId(null); } }
  async function handleDisconnectWallet() { await disconnectSolanaWallet(); setWalletSession(null); setNotice("Wallet disconnected."); showToast("Wallet disconnected."); }

  async function loadSendCostEstimate() {
    if (!user || !walletAddress || !selectedToken) return;
    setEstimateBusy(true);
    setEstimateError(null);
    setError(null);
    setSendCostEstimate(null);
    try {
      const amount = Number(form.amount);
      const localEstimate = await estimateTsnSendCostFromChain({
        senderWallet: walletAddress,
        tokenMintAddress: selectedToken.mintAddress,
        amountUi: amount,
        tokenSymbol: selectedToken.symbol,
        tokenUsd: selectedToken.unitPriceUsd ?? null,
      });
      const estimate = normalizeSendCostEstimate(localEstimate, amount);
      if (!hasCompleteCostEstimate(estimate)) {
        throw new Error("Payment quote is incomplete. Retry before confirming.");
      }
      setSendCostEstimate(estimate);
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : "Could not estimate transfer cost";
      const guidance = getSendGuidance(rawMessage);
      const msg = guidance?.message ?? rawMessage;
      setSendCostEstimate(null);
      setEstimateError(msg);
      setError(rawMessage);
      showToast(guidance?.title ?? msg);
    } finally {
      setEstimateBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !walletAddress) { setError("Connect a sender wallet first."); return; }
    if (!recipientPreview?.verified) { setError("Verify the recipient before sending."); showToast("Verify the recipient first."); return; }
    if (!selectedToken) { setError("Choose a token before sending."); showToast("Choose a token first."); return; }
    setConfirmOpen(true);
    await loadSendCostEstimate();
  }

  async function handleConfirmSend() {
    if (busy) return;
    if (!user || !walletAddress || !walletSession || !selectedToken) {
      setError("Connect wallet and choose token first.");
      return;
    }
    if (!recipientPreview?.verified) {
      setError("Verify the recipient first.");
      return;
    }
    if (!costEstimateReady) {
      setError("Wait for the payment quote, sender fee, and Solana network fee before confirming.");
      setEstimateError("Quote is not ready. Retry fee calculation before confirming.");
      return;
    }

    const recipientName = recipientPreview.recipient.displayName;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const senderFeeAmount = sendCostEstimate?.senderFeeAmountUi ?? 0;
      const totalTokenRequiredUi = sendCostEstimate?.totalTokenRequiredUi ?? Number(form.amount) + senderFeeAmount;
      const senderAuthorization = createPaymentAuthorization({
        senderWallet: walletAddress,
        senderIdentity: `phone:${user.phoneNumber}`,
        receiverIdentity: recipientPreview.recipient.tin
          ? `tin:${recipientPreview.recipient.tin}|phone:${form.receiverPhone}|name:${recipientName}`
          : `phone:${form.receiverPhone}|name:${recipientName}`,
        tokenMintAddress: selectedToken.mintAddress,
        amount: Number(form.amount),
        senderFeeAmount,
        totalTokenRequiredUi,
      });
      const senderAuthorizationSignature = await signSolanaMessage({
        walletId: walletSession.walletId,
        address: walletAddress,
        message: senderAuthorization.message,
      });

      const result = await apiPost<{
        paymentId: string;
        status: PaymentRecord["status"];
        notificationStatus: PaymentNotificationStatus;
        notificationSentAt: string | null;
        notificationDeliveredAt: string | null;
        notificationReadAt: string | null;
        notificationFailedAt: string | null;
        referenceCode: string;
        senderDisplayName: string;
        senderHandle: string;
        escrowAccount: string | null;
        blockchainSignature: string | null;
        blockchainMode: "tsn" | "mock" | "devnet";
        depositAddress: string | null;
        tokenSymbol: string | null;
        notificationRetrying: boolean;
        notificationAttemptCount: number;
        manualInviteRequired: boolean;
        inviteShare: { onboardingLink: string; inviteMessage: string } | null;
        tsn?: {
          recipientHash: string;
          destinationWallet: string | null;
        };
      }>("/api/payment/create", {
        phoneNumber: form.receiverPhone,
        recipientTin: recipientPreview.recipient.tin ?? null,
        senderPhoneNumber: user.phoneNumber,
        amount: Number(form.amount),
        tokenMintAddress: selectedToken.mintAddress,
        senderWallet: walletAddress,
        senderFeeAmount,
        totalTokenRequiredUi,
        senderAuthorizationMessage: senderAuthorization.message,
        senderAuthorizationNonce: senderAuthorization.nonce,
        senderAuthorizationExpiresAt: senderAuthorization.expiresAt,
        senderAuthorizationIssuedAt: senderAuthorization.issuedAt,
        senderAuthorizationSignature,
        skipWhatsAppCheck: receiverCheckSkipped,
      });

      const destinationWallet = result.tsn?.destinationWallet;
      const recipientHash = result.tsn?.recipientHash;
      if (!destinationWallet || !recipientHash) {
        throw new Error("Recipient settlement wallet is not ready for TSN enqueue");
      }

      const crankerFeePayer =
        process.env.NEXT_PUBLIC_TSN_CRANKER_FEE_PAYER ??
        process.env.NEXT_PUBLIC_TSN_SPONSOR_FEE_PAYER;
      if (!crankerFeePayer) {
        throw new Error(
          "NEXT_PUBLIC_TSN_CRANKER_FEE_PAYER is required so the SDK can build the sender co-signed sponsored settlement.",
        );
      }

      const sponsoredSettlement = await buildTsnSponsoredSettlementTransaction({
        paymentId: result.paymentId,
        crankerFeePayer,
        senderWallet: walletAddress,
        tokenMintAddress: selectedToken.mintAddress,
        amountUi: Number(form.amount),
        senderFeeAmountUi: senderFeeAmount,
        tokenDecimals: selectedToken.decimals ?? 6,
        recipientHash,
        rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      });
      const senderSignedSettlementTransaction = await signSolanaTransaction({
        walletId: walletSession.walletId,
        address: walletAddress,
        transactionBase64: sponsoredSettlement.transactionBase64,
      });

      const enqueueResult = await enqueueTsnPaymentFromFrontend({
        paymentId: result.paymentId,
        recipientHash,
        destinationWallet,
        tokenMintAddress: selectedToken.mintAddress,
        senderWallet: walletAddress,
        senderAuthorizationMessage: senderAuthorization.message,
        senderAuthorizationSignature,
        senderAuthorizationNonce: senderAuthorization.nonce,
        senderAuthorizationIssuedAt: senderAuthorization.issuedAt,
        senderAuthorizationExpiresAt: senderAuthorization.expiresAt,
        senderFeeAmount,
        senderSignedSettlementTransaction,
        senderSignedSettlementFeePayer: sponsoredSettlement.crankerFeePayer,
        senderSettlementMode: "sponsored_sender_cosigned",
        senderTokenAccount: sponsoredSettlement.senderTokenAccount,
        settlementVault: sponsoredSettlement.paymentVault,
        settlementTokenAccount: sponsoredSettlement.paymentVaultTokenAccount,
        settlementPaymentIntentId: sponsoredSettlement.paymentIntentId,
        autoclaim: true,
        amount: Number(form.amount),
        recipientAmount: Number(form.amount),
      });

      if (receiverCountry) rememberCountryUsage(receiverCountry.iso2);
      setNotice(null);
      setSendSuccess({
        ...result,
        blockchainSignature: result.blockchainSignature ?? "tsn-intent-posted",
        receiverPhone: form.receiverPhone,
        recipientName,
        amount: form.amount,
        token: result.tokenSymbol ?? selectedToken.symbol,
      });
      setReceiverPhoneInput("");
      setManualCountry(null);
      setManualCountryLocked(false);
      setShowCountryFallback(false);
      setSuggestedCountries([]);
      setForm((c) => ({ ...c, receiverPhone: "", amount: "2.5" }));
      setRecipientPreview(null);
      setConfirmOpen(false);
      showToast(
        result.manualInviteRequired
          ? `Payment secured. Share invite manually. Ref ${result.referenceCode}.`
          : result.notificationRetrying
            ? `Payment secured. WhatsApp retrying. Ref ${result.referenceCode}.`
            : `Sponsored settlement queued. Awaiting Cranker Verification. Ref ${result.referenceCode}.${enqueueResult.claimRequestId ? ` Claim ${enqueueResult.claimRequestId}.` : ""}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create payment intent";
      setError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) return null;

  const receiptTimestamp = sendSuccess?.notificationReadAt ?? sendSuccess?.notificationDeliveredAt ?? sendSuccess?.notificationSentAt ?? sendSuccess?.notificationFailedAt ?? null;

  return (
    <AppMobileShell currentTab="send" title="Send" subtitle="Confirm the person, choose a supported token, then co-sign a cranker-sponsored TSN settlement." user={user} showBackButton backHref="/app"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {/* Notices */}
        {notice && !sendSuccess ? (
          <div className="tl-badge rounded-[18px] px-4 py-3 ">{notice}</div>
        ) : null}
        {error ? (
          <div className="rounded-[18px] border border-[var(--danger)]/14 bg-danger-soft px-4 py-3  text-[var(--danger)]">
            {sendGuidance?.message ?? error}
          </div>
        ) : null}
        {sendGuidance ? (
          <div className="rounded-[20px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-4">
            <div className="text-[0.8rem] font-semibold text-text">{sendGuidance.title}</div>
            <div className="mt-1.5 text-[0.78rem] leading-relaxed text-text-soft">{sendGuidance.message}</div>
            {sendGuidance.ctaHref && sendGuidance.ctaLabel ? (
              <Link
                href={sendGuidance.ctaHref}
                className="mt-3 inline-flex items-center rounded-[14px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-3.5 py-2 text-[0.76rem] font-semibold text-[#04110a]"
              >
                {sendGuidance.ctaLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* ═══════════ SEND SUCCESS ═══════════ */}
        {sendSuccess ? (
          <SendSuccessPanel
            sendSuccess={sendSuccess}
            receiptTimestamp={receiptTimestamp}
            shareBusy={shareBusy}
            onShareBusyChange={setShareBusy}
            onError={setError}
            onToast={showToast}
            onSendAnother={() => { setSendSuccess(null); setNotice(null); }}
          />
        ) : (

          /* ═══════════ SEND FORM ═══════════ */
          <form onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-start">

              {/* ── LEFT: Form fields ── */}
              <div className="space-y-4">

                {/* Recipient input */}

                <div className="relative">
                  {/* Country chip — inline, after first verification */}
                  {hasVerifiedOnce && displayCountry && !receiverInputLooksLikeTin ? (
                    <button
                      type="button"
                      onClick={() => { setCountrySearchOpen(true); setCountrySearchQuery(""); }}
                      className="absolute right-16 top-[34px] z-10 flex items-center gap-1 rounded-[8px] px-2 py-1 tl-meta-sm font-medium transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.97]"
                    >
                      <span className="text-[0.78rem] leading-none">{displayCountry.flag}</span>
                      <span className="text-[var(--text-soft)]">{displayCountry.dialCode}</span>
                      <ChevronDown className="h-2.5 w-2.5 text-[var(--text-faint)]" />
                    </button>
                  ) : null}
                  <PhoneNumberInput
                    label="Recipient Identity (WA Phone / 10-Digit TIN)"
                    value={receiverPhoneInput}
                    placeholder="Enter WA Phone or 10-Digit TIN"
                    verificationState={phoneVerificationState}
                    verificationLabel={phoneVerificationLabel}
                    verificationDetails={phoneVerificationDetails}
                    recipientPreview={recipientPreview}
                    lookupBusy={previewBusy}
                    lookupError={lookupError}
                    showVerificationActions={!receiverCheckSkipped && !receiverWhatsAppVerified}
                    showCountryFallback={!receiverInputLooksLikeTin && !manualCountryLocked && (showCountryFallback || (receiverPhoneInput.trim() !== "" && (phoneVerificationState === "warning" || phoneVerificationState === "invalid")))}
                    selectedCountry={manualCountry}
                    suggestedCountries={suggestedCountries}
                    onChange={(value) => { setReceiverPhoneInput(value); setCountrySearchOpen(false); setManualCountry(null); setManualCountryLocked(false); setConfirmOpen(false); setSendCostEstimate(null); setEstimateError(null); setLookupError(null); setRecipientPreview(null); setPhoneVerificationDetails(null); setReceiverCheckSkipped(false); setForm((c) => ({ ...c, receiverPhone: "" })); }}
                    onCountrySelect={(country) => { setManualCountry(country); setManualCountryLocked(true); setReceiverCountry(country); setReceiverCheckSkipped(false); setLookupError(null); setShowCountryFallback(false); setPhoneVerificationState("checking"); setPhoneVerificationLabel(`Retrying with ${country.name}...`); }}
                    onSkipVerification={() => { setReceiverCheckSkipped(true); setReceiverWhatsAppVerified(true); setLookupError(null); setPhoneVerificationState("valid"); setPhoneVerificationLabel(manualCountry ? `Continuing with ${manualCountry.name}...` : null); }}
                    skipVerificationLabel={receiverCheckSkipped ? null : "Skip"}
                  />
                </div>



                {/* Amount + Token row */}
                <div className="flex items-stretch rounded-[22px] tl-panel tl-field overflow-hidden transition-all focus-within:border-[var(--accent-deep)]/30">
                  <div className="flex flex-1 flex-col px-4 py-3.5">
                    <span className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Amount</span>
                    <input
                      type="number"
                      step="any"
                      value={form.amount}
                      onChange={(e) => { setForm((c) => ({ ...c, amount: e.target.value })); setSendCostEstimate(null); setEstimateError(null); }}
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
                        <span className=" font-bold text-text">{selectedToken.symbol}</span>
                        <span className="truncate text-[0.62rem] text-[var(--accent-deep)] dark:text-[var(--accent)]">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</span>
                      </div>
                    ) : (
                      <span className=" text-text-soft">Token</span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={busy || estimateBusy || !canContinueWithRecipient}
                  className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3.5  font-semibold text-[#04110a] shadow-softbox disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
                >
                  {estimateBusy ? "Calculating fee..." : "Review payment"}
                </button>
              </div>

              {/* ── RIGHT: Context cards (desktop) ── */}
              <div className="space-y-4">

                {/* Recipient preview card */}
                {phoneVerificationDetails ? (
                  <div className="tl-panel tl-field rounded-[22px] px-4 py-4">
                    <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-text-faint mb-3">Recipient</div>
                    <div className="flex items-center gap-3">
                      {phoneVerificationDetails.profilePic ? (
                        <img src={phoneVerificationDetails.profilePic} alt="" className="h-11 w-11 rounded-full border border-[var(--field-border)] object-cover" />
                      ) : (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] text-[0.7rem] font-bold text-accent">
                          {phoneVerificationDetails.displayName ? phoneVerificationDetails.displayName.slice(0, 2).toUpperCase() : "?"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.88rem] font-semibold text-text truncate">
                          {phoneVerificationDetails.displayName || "Unknown"}
                        </div>
                        {phoneVerificationDetails.resolvedPhoneNumber ? (
                          <div className="text-[0.72rem] text-text-faint truncate">{phoneVerificationDetails.resolvedPhoneNumber}</div>
                        ) : null}
                      </div>
                      <div className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-medium ${phoneVerificationDetails.exists
                        ? "bg-[var(--accent-soft)] text-accent border border-accent-border"
                        : "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/14"
                        }`}>
                        {phoneVerificationDetails.exists ? "Verified" : "Not found"}
                      </div>
                    </div>
                    {phoneVerificationDetails.detectedCountry ? (
                      <div className="mt-2.5 flex items-center gap-1.5 tl-meta-sm text-text-faint">
                        <Globe className="h-3 w-3" />
                        {phoneVerificationDetails.detectedCountry.name} ({phoneVerificationDetails.detectedCountry.dialCode})
                      </div>
                    ) : null}
                    {recipientPreview ? (
                      <div className="mt-3 rounded-[14px] bg-[var(--surface-soft)] px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.72rem] text-text-faint">TrustLink status</span>
                          <span className={`text-[0.72rem] font-medium capitalize ${recipientPreview.status === "registered" ? "text-accent" : "text-[var(--warning)]"
                            }`}>{recipientPreview.status.replace(/_/g, " ")}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-text">
                          <span className="grid h-4 w-4 place-items-center rounded-full bg-[#25D366]/16">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 text-[#25D366]">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                          </span>
                          <span>WhatsApp: {phoneVerificationDetails.resolvedPhoneNumber ?? recipientPreview.recipient.phoneNumber}</span>
                        </div>
                        <div className="tl-meta-sm text-text-faint">X: coming soon (not linked yet)</div>
                        <div className="tl-meta-sm text-text-faint">
                          TIN: {recipientPreview.recipient.tin ?? "not linked yet"}
                        </div>
                        {normalizeTinInput(receiverPhoneInput.trim()) ? (
                          <div className="mt-2 text-[0.66rem] text-[#bde8ff]">
                            TIN resolved. Payment will route to the linked TrustLink recipient.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : previewBusy ? (
                  <div className="tl-panel tl-field rounded-[22px] px-4 py-6">
                    <SectionLoader label="Verifying recipient..." />
                  </div>
                ) : null}

                {/* How it works */}
                <div className="tl-panel tl-field rounded-[22px] px-4 py-4">
                  <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-text-faint mb-3">How it works</div>
                  <div className="space-y-2.5">
                    {[
                      { step: "1", text: "Verify recipient identity" },
                      { step: "2", text: "Sign TSN authorization" },
                      { step: "3", text: "Cranker verifies and settles" },
                    ].map((item) => (
                      <div key={item.step} className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.58rem] font-bold bg-[var(--accent-soft)] text-accent border border-accent-border">
                          {item.step}
                        </div>
                        <span className="text-[0.76rem] text-text-soft">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected token info */}
                {selectedToken ? (
                  <div className="tl-panel tl-field rounded-[22px] px-4 py-4">
                    <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-text-faint mb-2">Sending with</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.8rem]">{selectedToken.logo}</span>
                        <div>
                          <div className=" font-semibold text-text">{selectedToken.symbol}</div>
                          <div className="text-[0.66rem] text-text-faint">{selectedToken.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className=" font-semibold text-text">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</div>
                        <div className="text-[0.62rem] text-text-faint">Available</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        )}
      </section>

      {/* ═══════════ TOKEN PICKER MODAL ═══════════ */}
      {tokenPickerOpen ? (
        <div className="fixed inset-0 z-999 grid place-items-end tl-overlay md:place-items-center" onClick={() => setTokenPickerOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5">
              <h2 className="tl-h3 font-semibold tracking-[-0.04em] text-text">Choose token</h2>
              <p className="mt-1  text-text-soft">Supported tokens from your wallet.</p>
            </div>
            <div className="space-y-2.5">
              {tokenBusy ? (
                <div className="tl-panel tl-field rounded-[18px] px-4 py-5"><SectionLoader size="md" label="Loading tokens..." /></div>
              ) : sendableTokens.map((token) => {
                const active = token.mintAddress === form.token;
                return (
                  <button key={token.mintAddress} type="button"
                    onClick={() => { setForm((c) => ({ ...c, token: token.mintAddress })); setSendCostEstimate(null); setEstimateError(null); setTokenPickerOpen(false); }}
                    className={`tl-panel tl-field flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors cursor-pointer active:scale-[0.99] ${active ? "border-[var(--accent-deep)]/30 bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-soft)]"}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.9rem]">{token.logo}</span>
                      <span>
                        <span className="block  font-semibold leading-tight text-text">{token.symbol}</span>
                        <span className="tl-text-soft block mt-0.5 tl-meta-sm leading-tight">{token.name}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block  font-semibold leading-tight text-text">{formatTokenBalance(token.balance, token.symbol)}</span>
                      <span className="tl-text-soft block mt-0.5 tl-meta-sm leading-tight">Available</span>
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
        <div className="fixed inset-0 z-999 grid place-items-end tl-overlay md:place-items-center" onClick={() => setConfirmOpen(false)}>
          <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5">
              <h2 className="tl-h3 font-semibold tracking-[-0.04em] text-text">Authorize transfer</h2>
              <p className="mt-1  text-text-soft">You will sign a TSN authorization message. Your wallet will not broadcast a Solana transaction.</p>
            </div>

            <div className="space-y-2.5">
              <div className="tl-panel tl-field rounded-[18px] px-4 py-3.5">
                <div className="tl-meta-sm uppercase tracking-[0.18em] text-text-soft">Sending to</div>
                <div className="mt-1.5 text-[0.92rem] font-semibold text-text">
                  {recipientPreview.recipient.displayName}
                  {"handle" in recipientPreview.recipient && recipientPreview.recipient.handle ? ` (@${recipientPreview.recipient.handle})` : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required" ? " (Not on TrustLink)" : ""}
                </div>
                {recipientPreview.recipient.whatsappProfileName && recipientPreview.recipient.whatsappProfileName !== recipientPreview.recipient.displayName ? (
                  <div className="mt-1 text-[0.76rem] text-text-soft">WhatsApp: {recipientPreview.recipient.whatsappProfileName}</div>
                ) : null}
              </div>

              <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
                <span className=" font-medium text-text">{form.amount} {selectedToken.symbol}</span>
                <span className="text-[0.78rem] text-text-soft">{form.receiverPhone}</span>
              </div>

              {estimateBusy ? (
                <div className="tl-panel tl-field rounded-[18px] px-4 py-5">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                    <div>
                      <div className=" font-semibold text-text">Calculating payment quote</div>
                      <div className="mt-1 text-[0.72rem] leading-relaxed text-text-soft">Fetching TSN sender fee and current Solana network fee.</div>
                    </div>
                  </div>
                </div>
              ) : estimateError ? (
                <div className="rounded-[18px] border border-[var(--danger)]/20 bg-danger-soft px-4 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                    <div>
                      <div className=" font-semibold text-[var(--danger)]">Quote unavailable</div>
                      <div className="mt-1 text-[0.72rem] leading-relaxed text-[var(--danger)]/80">{estimateError}</div>
                      <button
                        type="button"
                        onClick={() => void loadSendCostEstimate()}
                        className="mt-3 inline-flex items-center gap-2 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--field)] px-3 py-2 text-[0.72rem] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--surface-soft)]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry quote
                      </button>
                    </div>
                  </div>
                </div>
              ) : sendCostEstimate ? (
                <>
                  <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-text-soft">Sender fee</span>
                    <span className="text-right">
                      <span className="block  font-medium text-text">{sendCostEstimate.senderFeeAmountUi.toFixed(6)} {selectedToken.symbol}</span>
                      {formatUsd(sendCostEstimate.senderFeeAmountUsd) ? <span className="block text-[0.68rem] text-text-faint">{formatUsd(sendCostEstimate.senderFeeAmountUsd)}</span> : null}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="tl-panel tl-field rounded-[14px] px-3 py-2.5">
                      <div className="text-[0.68rem] text-text-soft">Solana network fee</div>
                      <div className="mt-1  font-semibold text-text">{sendCostEstimate.networkFeeSol.toFixed(6)} SOL</div>
                      {formatUsd(sendCostEstimate.networkFeeUsd) ? <div className="mt-0.5 text-[0.66rem] text-text-faint">{formatUsd(sendCostEstimate.networkFeeUsd)}</div> : null}
                    </div>
                    <div className="tl-panel tl-field rounded-[14px] px-3 py-2.5">
                      <div className="text-[0.68rem] text-text-soft">Total required</div>
                      <div className="mt-1  font-semibold text-text">{sendCostEstimate.totalTokenRequiredUi.toFixed(6)} {selectedToken.symbol}</div>
                    </div>
                  </div>
                  {sendCostEstimate.settlementAssessment ? (
                    <div
                      className={`rounded-[14px] border px-3 py-2 text-[0.72rem] ${sendCostEstimate.settlementAssessment.likelihood === "likely_claimable"
                        ? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-accent"
                        : sendCostEstimate.settlementAssessment.likelihood === "risky_claim_amount"
                          ? "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]"
                          : "border-[var(--danger)]/35 bg-[var(--danger-soft)] text-[var(--danger)]"
                        }`}
                    >
                      {sendCostEstimate.settlementAssessment.likelihood === "likely_claimable"
                        ? "✅ Likely claimable"
                        : sendCostEstimate.settlementAssessment.likelihood === "risky_claim_amount"
                          ? "⚠️ Risky claim amount"
                          : "❌ Economically non-claimable"}
                      <div className="mt-1 tl-meta-sm opacity-90">
                        {sendCostEstimate.settlementAssessment.reason} Minimum suggested send: {sendCostEstimate.settlementAssessment.minimumTransferUi.toFixed(4)} {selectedToken.symbol}.
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="tl-button-secondary rounded-[18px] px-4 py-3.5  font-medium cursor-pointer active:scale-[0.97] transition-transform tl-body-sm">Cancel</button>
              <button type="button" onClick={() => void handleConfirmSend()} disabled={confirmSendDisabled} className="rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3.5  font-semibold text-[#04110a] shadow-softbox disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform tl-body-sm text-nowrap">{busy ? "Queuing..." : estimateBusy ? "Calculating..." : "Co-sign sponsored send"}</button>
            </div>
          </div>
        </div>
      ) : null}


      <CountrySearchModal
        open={countrySearchOpen}
        query={countrySearchQuery}
        countries={filteredCountries}
        activeCountry={displayCountry}
        onQueryChange={setCountrySearchQuery}
        onClose={() => setCountrySearchOpen(false)}
        onSelectCountry={(country) => {
          setManualCountry(country);
          setManualCountryLocked(true);
          setReceiverCountry(country);
          setReceiverCheckSkipped(false);
          setLookupError(null);
          setShowCountryFallback(false);
          setPhoneVerificationState("checking");
          setPhoneVerificationLabel(`Retrying with ${country.name}...`);
          setCountrySearchOpen(false);
        }}
      />

      <WalletPickerModal open={walletPickerOpen} wallets={availableWallets} connectingWalletId={connectingWalletId} onClose={() => { if (!connectingWalletId) setWalletPickerOpen(false); }} onSelect={(id) => void handleWalletSelect(id)} />
    </AppMobileShell>
  );
}
