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
import { Search } from "lucide-react";

const SEND_RECEIPT_REFRESH_INTERVAL_MS = 20_000;

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(balance);
}

function formatReceiptTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

async function shareInviteMessage(message: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ text: message });
    return "shared";
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return "copied";
  }

  throw new Error("Sharing is not available on this device.");
}

type SendCostEstimate = {
  tokenSymbol: string;
  senderFeeAmountUi: number;
  senderFeeAmountUsd: number | null;
  totalTokenRequiredUi: number;
  networkFeeSol: number;
  networkFeeUsd: number | null;
};

type ResolvedRecipientLookup = {
  verification: WhatsAppNumberVerificationResult;
  recipient: RecipientLookupResult | null;
  normalizedPhone: string;
  country: CountryOption | null;
};

function resetRecipientResolution(params: {
  setPhoneVerificationState: (value: "idle" | "checking" | "valid" | "warning" | "invalid") => void;
  setPhoneVerificationLabel: (value: string | null) => void;
  setPhoneVerificationDetails: (value: {
    displayName: string | null;
    profilePic: string | null;
    exists: boolean;
    isBusiness: boolean;
    url: string;
    resolvedPhoneNumber?: string | null;
    detectedCountry?: CountryOption | null;
  } | null) => void;
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
  const [phoneVerificationDetails, setPhoneVerificationDetails] = useState<{
    displayName: string | null;
    profilePic: string | null;
    exists: boolean;
    isBusiness: boolean;
    url: string;
    resolvedPhoneNumber?: string | null;
    detectedCountry?: CountryOption | null;
  } | null>(null);
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
    blockchainSignature: string;
    blockchainMode: "mock" | "devnet";
    depositAddress: string | null;
    notificationRetrying: boolean;
    notificationAttemptCount: number;
    manualInviteRequired: boolean;
    inviteShare: {
      onboardingLink: string;
      inviteMessage: string;
    } | null;
    receiverPhone: string;
    recipientName: string;
    amount: string;
    token: string;
  } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const resolutionCache = useRef(new Map<string, ResolvedRecipientLookup>());
  const latestLookupRequestId = useRef(0);
  const [form, setForm] = useState({
    receiverPhone: "",
    amount: "",
    token: ""
  });

  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const preferredCountry = useMemo(() => {
    const preferredIso2 = loadPreferredCountryIso2();
    return getCountryByIso2(preferredIso2) ?? localeCountry;
  }, [localeCountry]);
  const sendableTokens = useMemo(() => supportedTokens.filter((token) => token.supported), [supportedTokens]);
  const selectedToken = sendableTokens.find((token) => token.mintAddress === form.token) ?? null;
  const walletAddress = walletSession?.address ?? null;
  const sendSuccessPaymentId = sendSuccess?.paymentId ?? null;
  const shouldPollSendSuccessReceipt = sendSuccess
    ? !sendSuccess.manualInviteRequired && !isPaymentNotificationFinal(sendSuccess.notificationStatus)
    : false;
  const hasAmount = Number.isFinite(Number(form.amount)) && Number(form.amount) > 0;
  const canContinueWithRecipient =
    Boolean(walletAddress) &&
    Boolean(selectedToken) &&
    hasAmount &&
    Boolean(recipientPreview?.verified);

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    setAvailableWallets(listAvailableSolanaWallets());
  }, []);

  useEffect(() => {
    const prefilledPhone = searchParams.get("phone")?.trim();

    if (!prefilledPhone) {
      return;
    }

    setReceiverPhoneInput(prefilledPhone);
  }, [searchParams]);

  async function lookupResolvedRecipient(
    normalizedPhone: string,
    country: CountryOption | null,
    options?: { allowUnverified?: boolean },
  ) {
    const cacheKey = `${normalizedPhone}:${options?.allowUnverified ? "manual" : "auto"}`;
    const cached = resolutionCache.current.get(cacheKey);

    if (cached) {
      return cached;
    }

    const [verification, recipient] = await Promise.all([
      apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", {
        phoneNumber: normalizedPhone,
      }),
      apiPost<RecipientLookupResult>("/api/recipient/lookup", {
        phoneNumber: normalizedPhone,
        skipWhatsAppCheck: options?.allowUnverified,
      }),
    ]);

    const resolved = {
      verification,
      recipient,
      normalizedPhone,
      country,
    } satisfies ResolvedRecipientLookup;

    resolutionCache.current.set(cacheKey, resolved);
    return resolved;
  }

  function applyRecipientVerificationState(resolved: ResolvedRecipientLookup) {
    const trustLinkVerified = resolved.recipient?.status === "registered";
    const whatsappVerified = resolved.verification.exists || receiverCheckSkipped;

    setReceiverWhatsAppVerified(whatsappVerified);
    setPhoneVerificationState(trustLinkVerified || whatsappVerified ? (whatsappVerified ? "valid" : "warning") : "warning");
    setPhoneVerificationLabel(
      trustLinkVerified && !whatsappVerified ? "Verify on WhatsApp or skip to continue." : null,
    );
  }

  function applyResolvedRecipient(resolved: ResolvedRecipientLookup) {
    setForm((current) => ({ ...current, receiverPhone: resolved.normalizedPhone }));
    setReceiverCountry(resolved.country);
    setShowCountryFallback(false);
    setSuggestedCountries([]);
    setLookupError(null);
    applyRecipientVerificationState(resolved);
    setPhoneVerificationDetails({
      displayName: resolved.verification.displayName,
      profilePic: resolved.verification.profilePic,
      exists: resolved.verification.exists,
      isBusiness: resolved.verification.isBusiness,
      url: resolved.verification.url,
      resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone),
      detectedCountry: resolved.country,
    });
    setRecipientPreview(resolved.recipient);
  }

  function applyRecipientResolutionPreview(
    resolved: ResolvedRecipientLookup,
    options?: { revealCountryFallback?: boolean },
  ) {
    setForm((current) => ({ ...current, receiverPhone: resolved.normalizedPhone }));
    setReceiverCountry(resolved.country);
    setShowCountryFallback(Boolean(options?.revealCountryFallback));
    setSuggestedCountries(resolved.country ? [resolved.country, ...suggestedCountries].filter((country, index, array) => array.findIndex((item) => item.iso2 === country.iso2) === index) : suggestedCountries);
    setLookupError(null);
    applyRecipientVerificationState(resolved);
    setPhoneVerificationDetails({
      displayName: resolved.verification.displayName,
      profilePic: resolved.verification.profilePic,
      exists: resolved.verification.exists,
      isBusiness: resolved.verification.isBusiness,
      url: resolved.verification.url,
      resolvedPhoneNumber: formatPhoneInput(resolved.normalizedPhone),
      detectedCountry: resolved.country,
    });
    setRecipientPreview(resolved.recipient);
  }

  useEffect(() => {
    if (!walletAddress) {
      setSupportedTokens([]);
      setForm((current) => ({ ...current, token: "" }));
      return;
    }

    const controller = new AbortController();

    async function loadTokens() {
      setTokenBusy(true);

      try {
        const result = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", {
          walletAddress
        });

        if (controller.signal.aborted) {
          return;
        }

        setSupportedTokens(result.tokens);
        setForm((current) => ({
          ...current,
          token:
            result.tokens.find((token) => token.supported && token.mintAddress === current.token)?.mintAddress ??
            result.tokens.find((token) => token.supported)?.mintAddress ??
            ""
        }));
      } catch (tokenError) {
        if (!controller.signal.aborted) {
          setSupportedTokens([]);
          setError(tokenError instanceof Error ? tokenError.message : "Could not load supported tokens");
        }
      } finally {
        if (!controller.signal.aborted) {
          setTokenBusy(false);
        }
      }
    }

    void loadTokens();

    return () => controller.abort();
  }, [walletAddress]);

  useEffect(() => {
    const trimmed = receiverPhoneInput.trim();

    if (!trimmed) {
      resetRecipientResolution({
        setPhoneVerificationState,
        setPhoneVerificationLabel,
        setPhoneVerificationDetails,
        setReceiverWhatsAppVerified,
        setReceiverCheckSkipped,
        setRecipientPreview,
        setLookupError,
        setPreviewBusy,
        setShowCountryFallback,
        setSuggestedCountries,
        setReceiverCountry,
        setForm,
      });
      return;
    }

    const requestId = latestLookupRequestId.current + 1;
    latestLookupRequestId.current = requestId;

    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      setLookupError(null);
      setPhoneVerificationDetails(null);
      setRecipientPreview(null);
      setReceiverWhatsAppVerified(false);
      setShowCountryFallback(false);
      setPhoneVerificationState("checking");
      setPhoneVerificationLabel("Detecting recipient...");

      try {
        let resolved: ResolvedRecipientLookup | null = null;
        const plan = buildPhoneResolutionPlan({
          input: trimmed,
          localeCountry,
          preferredCountry,
          selectedCountry: manualCountry,
          selectedCountryLocked: manualCountryLocked,
        });

        if (plan.kind === "idle") {
          setPhoneVerificationState("idle");
          setPhoneVerificationLabel(null);
          setPreviewBusy(false);
          return;
        }

        if (plan.kind === "fallback") {
          setForm((current) => ({ ...current, receiverPhone: "" }));
          setReceiverCountry(null);
          setSuggestedCountries(plan.suggestedCountries);
          setShowCountryFallback(!manualCountryLocked);
          setPhoneVerificationState("warning");
          setPhoneVerificationLabel(null);
          setPreviewBusy(false);
          return;
        }

        setSuggestedCountries(plan.suggestedCountries);

        const candidates = plan.kind === "single" ? [plan.candidate] : plan.candidates;

        for (const candidate of candidates) {
          resolved = await lookupResolvedRecipient(candidate.normalizedPhone, candidate.country, {
            allowUnverified: receiverCheckSkipped,
          });

          if (latestLookupRequestId.current !== requestId) {
            return;
          }

          if (resolved.recipient?.verified) {
            applyResolvedRecipient(resolved);
            return;
          }

          if (plan.kind === "single") {
            applyRecipientResolutionPreview(resolved, {
              revealCountryFallback: candidate.revealFallback,
            });
            return;
          }
        }

        setForm((current) => ({ ...current, receiverPhone: "" }));
        setReceiverCountry(null);
        setShowCountryFallback(!manualCountryLocked);
        setPhoneVerificationState("warning");
        setPhoneVerificationLabel(null);
      } catch (lookupRequestError) {
        const message = lookupRequestError instanceof Error ? lookupRequestError.message : "Could not verify recipient";
        setLookupError(message);
        setRecipientPreview(null);
        setReceiverWhatsAppVerified(false);
        setPhoneVerificationState("warning");
        setPhoneVerificationLabel(null);
        setShowCountryFallback(!manualCountryLocked);
      } finally {
        if (latestLookupRequestId.current === requestId) {
          setPreviewBusy(false);
        }
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [localeCountry, manualCountry, manualCountryLocked, preferredCountry, receiverCheckSkipped, receiverPhoneInput]);

  useEffect(() => {
    if (!sendSuccessPaymentId || !accessToken) {
      return;
    }

    let cancelled = false;

    async function refreshReceipt() {
      try {
        const result = await apiGet<{ payment: PaymentRecord }>(`/api/payment/${sendSuccessPaymentId}`, accessToken ?? undefined);

        if (cancelled) {
          return;
        }

        setSendSuccess((current) => {
          if (!current || current.paymentId !== result.payment.id) {
            return current;
          }

          return {
            ...current,
            status: result.payment.status,
            notificationStatus: result.payment.notification_status,
            notificationSentAt: result.payment.notification_sent_at,
            notificationDeliveredAt: result.payment.notification_delivered_at,
            notificationReadAt: result.payment.notification_read_at,
            notificationFailedAt: result.payment.notification_failed_at,
            notificationRetrying:
              result.payment.notification_status === "queued" || result.payment.notification_status === "failed",
            notificationAttemptCount: result.payment.notification_attempt_count ?? current.notificationAttemptCount
          };
        });
      } catch {
        // Keep the last known receipt state if polling fails.
      }
    }

    void refreshReceipt();

    if (!shouldPollSendSuccessReceipt) {
      return () => {
        cancelled = true;
      };
    }

    const refreshInterval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void refreshReceipt();
    }, SEND_RECEIPT_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [accessToken, sendSuccessPaymentId, shouldPollSendSuccessReceipt]);

  async function handleConnectWallet() {
    setError(null);
    const wallets = listAvailableSolanaWallets();
    setAvailableWallets(wallets);

    if (wallets.length === 0) {
      setError("Install or open a Solana wallet on this device to connect a sender wallet.");
      showToast("No Solana wallet detected on this browser.");
      return;
    }

    setWalletPickerOpen(true);
  }

  async function handleWalletSelect(walletId: string) {
    setConnectingWalletId(walletId);
    setError(null);

    try {
      const session = await connectSolanaWallet(walletId);
      setWalletSession(session);
      setWalletPickerOpen(false);
      setNotice(`${session.walletName} connected.`);
      showToast(`${session.walletName} connected successfully.`);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect wallet");
    } finally {
      setConnectingWalletId(null);
    }
  }

  async function handleDisconnectWallet() {
    await disconnectSolanaWallet();
    setWalletSession(null);
    setNotice("Wallet disconnected.");
    showToast("Wallet disconnected.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !walletAddress) {
      setError("Connect a sender wallet before creating a payment.");
      return;
    }

    if (!recipientPreview || !recipientPreview.verified) {
      setError("Verify the recipient before sending.");
      showToast("Verify the recipient before sending.");
      return;
    }

    if (!selectedToken) {
      setError("Choose a supported token before sending.");
      showToast("Choose a supported token before sending.");
      return;
    }

    setEstimateBusy(true);
    setError(null);

    try {
      const result = await apiPost<{
        estimate: SendCostEstimate;
      }>("/api/payment/estimate", {
        phoneNumber: form.receiverPhone,
        senderPhoneNumber: user.phoneNumber,
        amount: Number(form.amount),
        tokenMintAddress: selectedToken.mintAddress,
        senderWallet: walletAddress,
      });

      setSendCostEstimate(result.estimate);
      setConfirmOpen(true);
    } catch (estimateError) {
      setError(estimateError instanceof Error ? estimateError.message : "Could not estimate Solana transfer cost");
      showToast("Could not estimate the Solana transfer cost.");
    } finally {
      setEstimateBusy(false);
    }
  }

  async function handleConfirmSend() {
    if (!user || !walletAddress || !selectedToken) {
      setError("Connect a sender wallet and choose a supported token before sending.");
      return;
    }

    if (!recipientPreview?.verified) {
      setError("Verify the recipient before sending.");
      return;
    }

    const recipientName = recipientPreview.recipient.displayName;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const prepared = await apiPost<{
        paymentId: string;
        escrowAccount: string | null;
        escrowVaultAddress: string | null;
        blockchainMode: "mock" | "devnet";
        serializedTransaction: string | null;
        tokenSymbol: string | null;
        senderFeeAmount: string | number | null;
        totalTokenRequiredAmount: string | number | null;
      }>("/api/payment/create", {
        phoneNumber: form.receiverPhone,
        senderPhoneNumber: user.phoneNumber,
        amount: Number(form.amount),
        tokenMintAddress: selectedToken.mintAddress,
        senderWallet: walletAddress,
        skipWhatsAppCheck: receiverCheckSkipped,
      });

      if (!prepared.serializedTransaction || !prepared.escrowVaultAddress) {
        throw new Error("TrustLink could not prepare the escrow transaction");
      }

      setNotice(`Approve the ${prepared.tokenSymbol ?? selectedToken.symbol} escrow transaction in ${walletSession?.walletName ?? "your wallet"}...`);

      const depositSignature = await signAndSendSerializedSolanaTransaction({
        walletId: walletSession!.walletId,
        rpcUrl: (await apiGet<{ rpcUrl: string }>("/api/wallet/deposit-target")).rpcUrl,
        serializedTransaction: prepared.serializedTransaction
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
        blockchainSignature: string;
        blockchainMode: "mock" | "devnet";
        depositAddress: string | null;
        tokenSymbol: string | null;
        notificationRetrying: boolean;
        notificationAttemptCount: number;
        manualInviteRequired: boolean;
        inviteShare: {
          onboardingLink: string;
          inviteMessage: string;
        } | null;
      }>("/api/payment/create", {
        paymentId: prepared.paymentId,
        phoneNumber: form.receiverPhone,
        senderPhoneNumber: user.phoneNumber,
        amount: Number(form.amount),
        tokenMintAddress: selectedToken.mintAddress,
        senderWallet: walletAddress,
        escrowVaultAddress: prepared.escrowVaultAddress,
        depositSignature,
        skipWhatsAppCheck: receiverCheckSkipped,
      });

      if (receiverCountry) {
        rememberCountryUsage(receiverCountry.iso2);
      }

      setNotice(null);
      setSendSuccess({
        ...result,
        receiverPhone: form.receiverPhone,
        recipientName,
        amount: form.amount,
        token: result.tokenSymbol ?? selectedToken.symbol
      });
      setReceiverPhoneInput("");
      setManualCountry(null);
      setManualCountryLocked(false);
      setShowCountryFallback(false);
      setSuggestedCountries([]);
      setForm((current) => ({ ...current, receiverPhone: "", amount: "2.5" }));
      setRecipientPreview(null);
      setConfirmOpen(false);
      showToast(
        result.manualInviteRequired
          ? `Payment secured. Share the invite manually. Reference ${result.referenceCode}.`
          : result.notificationRetrying
            ? `Payment secured. WhatsApp delivery is retrying. Reference ${result.referenceCode}.`
            : `Payment sent. Reference ${result.referenceCode}.`
      );
    } catch (submitError) {
      if (submitError instanceof Error && /already signed|recovered|Do not confirm/i.test(submitError.message)) {
        setError(submitError.message);
      } else {
        setError(submitError instanceof Error ? submitError.message : "Could not create payment");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  const receiptTimestamp =
    sendSuccess?.notificationReadAt ??
    sendSuccess?.notificationDeliveredAt ??
    sendSuccess?.notificationSentAt ??
    sendSuccess?.notificationFailedAt ??
    null;

  return (
    <AppMobileShell
      currentTab="send"
      title="Send"
      subtitle="Confirm the person, choose a supported token, then move funds into escrow."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {notice && !sendSuccess ? (
          <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div>
        ) : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        {/* SEND SUCCESS */}
        {sendSuccess ? (
          <section className="tl-panel tl-scanline p-3 sm:p-3.5">
            <SuccessIcon className="h-14 w-14" />
            <div className="mt-5 text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Transfer sent</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-text">
              {sendSuccess.amount} {sendSuccess.token}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text/56">
              {sendSuccess.manualInviteRequired
                ? `TrustLink already secured the funds in escrow for ${sendSuccess.recipientName}. Because this number is not registered or not opted in for TrustLink messaging, you need to share the invite yourself.`
                : sendSuccess.notificationRetrying
                  ? `TrustLink already secured the funds in escrow for ${sendSuccess.recipientName}. WhatsApp delivery is still retrying in the background, so there is no need to sign again.`
                  : `TrustLink sent the transfer details to ${sendSuccess.recipientName} on WhatsApp and moved the payment into escrow for claim.`}
            </p>

            <div className="mt-5 space-y-3 rounded-[22px] border border-white/8 bg-pop-bg px-4 py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Recipient</span>
                <span className="text-right font-medium text-text">{sendSuccess.recipientName}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">WhatsApp</span>
                <span className="font-medium text-text">{sendSuccess.receiverPhone}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Reference</span>
                <span className="font-medium text-text">{sendSuccess.referenceCode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Payment status</span>
                <span className="font-medium capitalize text-text">{sendSuccess.status}</span>
              </div>
              {!sendSuccess.manualInviteRequired ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">WhatsApp receipt</span>
                  <PaymentNotificationReceipt status={sendSuccess.notificationStatus} />
                </div>
              ) : null}
              {sendSuccess.manualInviteRequired ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Sender invite</span>
                  <span className="font-medium text-text">Share manually</span>
                </div>
              ) : null}
              {sendSuccess.notificationRetrying ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Delivery retries</span>
                  <span className="font-medium text-text">{sendSuccess.notificationAttemptCount}</span>
                </div>
              ) : null}
              {!sendSuccess.manualInviteRequired && receiptTimestamp ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Receipt updated</span>
                  <span className="font-medium text-text">{formatReceiptTime(receiptTimestamp)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">{sendSuccess.blockchainMode === "mock" ? "Mock reference" : "Deposit tx"}</span>
                <span className="font-medium text-text">{shortenAddress(sendSuccess.blockchainSignature)}</span>
              </div>
            </div>

            <div className="mt-3 text-[0.78rem] text-text/44">
              {sendSuccess.blockchainMode === "mock"
                ? "This payment was created in Solana mock mode, so the reference shown is not a real on-chain signature."
                : "Delivery receipts refresh from TrustLink records only while the receipt is still unresolved."}
            </div>

            {sendSuccess.manualInviteRequired && sendSuccess.inviteShare ? (
              <div className="mt-5 rounded-[22px] border border-white/8 bg-pop-bg px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Shareable invite</div>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text/72">
                  {sendSuccess.inviteShare.inviteMessage}
                </pre>
                <button
                  type="button"
                  onClick={async () => {
                    setShareBusy(true);
                    try {
                      const outcome = await shareInviteMessage(sendSuccess.inviteShare!.inviteMessage);
                      showToast(outcome === "shared" ? "Share dialog opened." : "Invite copied to clipboard.");
                    } catch (shareError) {
                      setError(shareError instanceof Error ? shareError.message : "Could not share invite");
                    } finally {
                      setShareBusy(false);
                    }
                  }}
                  disabled={shareBusy}
                  className="mt-4 w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shareBusy ? "Preparing share..." : "Share Invite"}
                </button>
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href="/app" className="rounded-[20px] border border-white/10 bg-pop-bg px-4 py-3 text-center text-sm font-medium text-text/78">
                Back home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSendSuccess(null);
                  setNotice(null);
                }}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
              >
                Send another
              </button>
            </div>
          </section>
        ) : (
          // SEND FORM
          <div className="tl-panel tl-scanline p-3 sm:p-3.5 relative">
            {/* WALLET CONNECT DISPLAY */}
            {/* <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted">Sender wallet</div>
                <div className="mt-1 text-base font-semibold text-text">
                  {walletAddress ? `${walletSession?.walletName ?? "Wallet"} - ${shortenAddress(walletAddress)}` : "Not connected"}
                </div>
              </div>
              {walletAddress ? (
                <button type="button" onClick={() => void handleDisconnectWallet()} className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-text/78">
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={() => void handleConnectWallet()} className="rounded-full bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-3 py-2 text-xs font-semibold text-[#04110a]">
                  Connect
                </button>
              )}
            </div> */}

            <form className="space-y-4" onSubmit={handleSubmit}>
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
                onChange={(value) => {
                  setReceiverPhoneInput(value);
                  setManualCountry(null);
                  setManualCountryLocked(false);
                  setConfirmOpen(false);
                  setSendCostEstimate(null);
                  setLookupError(null);
                  setRecipientPreview(null);
                  setPhoneVerificationDetails(null);
                  setReceiverCheckSkipped(false);
                  setForm((current) => ({ ...current, receiverPhone: "" }));
                }}
                onCountrySelect={(country) => {
                  setManualCountry(country);
                  setManualCountryLocked(true);
                  setReceiverCountry(country);
                  setReceiverCheckSkipped(false);
                  setLookupError(null);
                  setShowCountryFallback(false);
                  setPhoneVerificationState("checking");
                  setPhoneVerificationLabel(`Retrying with ${country.name}...`);
                }}
                onSkipVerification={() => {
                  setReceiverCheckSkipped(true);
                  setReceiverWhatsAppVerified(true);
                  setLookupError(null);
                  setPhoneVerificationState("valid");
                  setPhoneVerificationLabel(manualCountry ? `Continuing with ${manualCountry.name}...` : null);
                }}
                skipVerificationLabel={receiverCheckSkipped ? null : "Skip"}
              />

              <div className="flex items-stretch rounded-[24px] tl-field transition-all focus-within:border-accent-deep/40 overflow-hidden">
                <div className="flex flex-1 flex-col px-4 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text/40">Amount</span>
                  <input
                    type="number"
                    step="any"
                    value={form.amount}
                    onChange={(e) => {
                      setForm((current) => ({ ...current, amount: e.target.value }));
                      setSendCostEstimate(null);
                    }}
                    placeholder="0.00"
                    className="w-full bg-transparent tl-balance-readout text-[0.96rem] sm:text-[1.04rem] font-bold outline-none placeholder:text-[var(--text-faint)] leading-3.5"
                  />
                </div>
                <div className="my-3 w-[1px] bg-white/10" />

                {/* SEND TOKEN SELECTOR BUTTON */}
                <button
                  type="button"
                  onClick={() => setTokenPickerOpen(true)}
                  className="flex w-[130px] items-center justify-between px-4 py-3 border-l border-accent-soft bg-field-strong button"
                >
                  {selectedToken ? (
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className="text-sm font-bold text-text">{selectedToken.symbol}</span>
                      <span className="truncate text-[10px] text-accent">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-text/40">Token</span>
                  )}
                  <span className="text-[10px] text-text/30"><Search className="h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" /></span>
                </button>
              </div>

              <div className="tl-field px-4 py-4 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Flow</div>
                <p className="mt-2 text-sm leading-6 text-text/60">
                  TrustLink verifies the recipient first, then sends the transfer into escrow while the receiver claims with OTP on WhatsApp.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy || estimateBusy || !canContinueWithRecipient}
                className="w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]  shadow-softbox  disabled:cursor-not-allowed disabled:opacity-50"
              >
                {estimateBusy ? "Calculating network fee..." : "Review payment"}
              </button>
            </form>
          </div>
        )}
      </section>

      {tokenPickerOpen ? (
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setTokenPickerOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 tl-panel px-5 pb-6 pt-5 shadow-softbox  md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Choose token</h2>
              <p className="text-sm text-text/48">Supported TrustLink tokens from your connected wallet.</p>
            </div>

            <div className="space-y-3">
              {tokenBusy ? (
                <div className="rounded-[22px] border border-white/8 bg-pop-bg px-4 py-4">
                  <SectionLoader size="md" label="Loading supported tokens..." />
                </div>
              ) : (
                sendableTokens.map((token) => {
                  const active = token.symbol === form.token;

                  return (
                    <button
                      key={token.mintAddress}
                      type="button"
                      onClick={() => {
                        setForm((current) => ({ ...current, token: token.mintAddress }));
                        setSendCostEstimate(null);
                        setTokenPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${active ? "border-[#58f2b1]/30 bg-[#58f2b1]/8" : "border-white/8 bg-pop-bg"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-pop-bg text-lg text-text">
                          {token.logo}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-text">{token.symbol}</span>
                          <span className="block text-[0.72rem] text-text/46">{token.name}</span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-text">
                          {formatTokenBalance(token.balance, token.symbol)}
                        </span>
                        <span className="block text-[0.72rem] text-text/40">Available</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen && recipientPreview?.verified && selectedToken ? (
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setConfirmOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-pop-bg px-5 pb-6 pt-5 shadow-softbox  md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Confirm transfer</h2>
              <p className="text-sm text-text/48">Please verify the recipient before funds move into escrow.</p>
            </div>

            <div className="space-y-3 rounded-[22px] border border-white/8 bg-pop-bg px-4 py-4">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">You are sending to</div>
                <div className="mt-1 text-base font-semibold text-text">
                  {recipientPreview.recipient.displayName}
                  {"handle" in recipientPreview.recipient && recipientPreview.recipient.handle
                    ? ` (@${recipientPreview.recipient.handle})`
                    : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required"
                      ? " (Not registered on TrustLink)"
                      : ""}
                </div>
                {recipientPreview.recipient.whatsappProfileName &&
                  recipientPreview.recipient.whatsappProfileName !== recipientPreview.recipient.displayName ? (
                  <div className="mt-1 text-sm text-text/48">
                    WhatsApp profile: {recipientPreview.recipient.whatsappProfileName}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                <span className="text-sm text-text/56">
                  {form.amount} {selectedToken.symbol}
                </span>
                <span className="text-sm text-text/44">{form.receiverPhone}</span>
              </div>
              {sendCostEstimate ? (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                    <span className="text-sm text-text/56">Sender fee</span>
                    <span className="text-sm text-text">
                      {sendCostEstimate.senderFeeAmountUi.toFixed(6)} {selectedToken.symbol}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[0.72rem] text-text/44">
                    <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2">
                      Network fee: {sendCostEstimate.networkFeeSol.toFixed(6)} SOL
                    </div>
                    <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2">
                      Total required: {sendCostEstimate.totalTokenRequiredUi.toFixed(6)} {selectedToken.symbol}
                    </div>
                  </div>
                  {sendCostEstimate.senderFeeAmountUsd != null ? (
                    <div className="text-sm text-text/48">
                      Approx. ${sendCostEstimate.senderFeeAmountUsd.toFixed(4)} sender fee at the current market price.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-[20px] border border-white/10 bg-pop-bg px-4 py-3 text-sm font-medium text-text/72"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSend()}
                disabled={busy}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]  shadow-softbox  disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Sending..." : "Confirm send"}
              </button>
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
