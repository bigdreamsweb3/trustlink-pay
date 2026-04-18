"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { splitPhoneNumber, type CountryOption } from "@/src/lib/phone-countries";
import { rememberCountryUsage } from "@/src/lib/phone-preferences";
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

export function SendExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/send");
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [receiverCountry, setReceiverCountry] = useState<CountryOption | null>(null);
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
  const [form, setForm] = useState({
    receiverPhone: "",
    amount: "",
    token: ""
  });

  const receiverLocalDigits = useMemo(() => splitPhoneNumber(form.receiverPhone).localNumber, [form.receiverPhone]);
  const canLookupRecipient = useMemo(() => Boolean(receiverCountry) && receiverLocalDigits.length === 10, [receiverCountry, receiverLocalDigits.length]);
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
    Boolean(recipientPreview?.verified) &&
    (receiverWhatsAppVerified || receiverCheckSkipped || recipientPreview?.status === "registered");

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    setAvailableWallets(listAvailableSolanaWallets());
  }, []);

  useEffect(() => {
    const prefilledPhone = searchParams.get("phone")?.trim();

    if (!prefilledPhone) {
      return;
    }

    setForm((current) => (current.receiverPhone === prefilledPhone ? current : { ...current, receiverPhone: prefilledPhone }));
  }, [searchParams]);

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
    if (!canLookupRecipient) {
      setPhoneVerificationState("idle");
      setPhoneVerificationLabel(null);
      setPhoneVerificationDetails(null);
      setReceiverWhatsAppVerified(false);
      setReceiverCheckSkipped(false);
      setRecipientPreview(null);
      setLookupError(null);
      setPreviewBusy(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      setLookupError(null);
      setPhoneVerificationState("checking");
      setPhoneVerificationLabel("Checking WhatsApp availability...");

      try {
        const verification = await apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", {
          phoneNumber: form.receiverPhone
        });

        setReceiverWhatsAppVerified(verification.isBusiness);
        setPhoneVerificationDetails({
          displayName: verification.displayName,
          profilePic: verification.profilePic,
          exists: verification.exists,
          isBusiness: verification.isBusiness,
          url: verification.url,
        });
        setPhoneVerificationState(verification.isBusiness ? "valid" : "warning");
        setPhoneVerificationLabel(null);

        if (!verification.exists && !receiverCheckSkipped) {
          setRecipientPreview(null);
          return;
        }

        const result = await apiPost<RecipientLookupResult>("/api/recipient/lookup", {
          phoneNumber: form.receiverPhone,
          skipWhatsAppCheck: receiverCheckSkipped || !verification.isBusiness,
        });
        setRecipientPreview(result);
        if (result.status === "registered") {
          setReceiverWhatsAppVerified(true);
        }
      } catch (lookupRequestError) {
        const message = lookupRequestError instanceof Error ? lookupRequestError.message : "Could not verify recipient";
        setLookupError(message);
        setRecipientPreview(null);
        setPhoneVerificationDetails({
          displayName: null,
          profilePic: null,
          exists: false,
          isBusiness: false,
          url: `https://api.whatsapp.com/send?phone=${form.receiverPhone.replace(/\D/g, "")}`,
        });
        setReceiverWhatsAppVerified(false);
        setPhoneVerificationState("warning");
        setPhoneVerificationLabel(null);
      } finally {
        setPreviewBusy(false);
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [canLookupRecipient, form.receiverPhone, receiverCheckSkipped]);

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

        {sendSuccess ? (
          <section className="rounded-[28px] tl-panel p-4">
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
          <div className="rounded-[28px] tl-panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
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
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <PhoneNumberInput
                label="Receiver WhatsApp number"
                value={form.receiverPhone}
                maxLocalDigits={10}
                verificationState={phoneVerificationState}
                verificationLabel={phoneVerificationLabel}
                verificationDetails={phoneVerificationDetails}
                showVerificationActions={recipientPreview?.status !== "registered"}
                onChange={(value, country) => {
                  setForm((current) => ({ ...current, receiverPhone: value }));
                  setReceiverCountry(country);
                  setConfirmOpen(false);
                  setSendCostEstimate(null);
                  setLookupError(null);
                  setRecipientPreview(null);
                  setPhoneVerificationDetails(null);
                  setReceiverCheckSkipped(false);
                }}
                onSkipVerification={() => {
                  setReceiverCheckSkipped(true);
                  setLookupError(null);
                  setPhoneVerificationState("warning");
                }}
                skipVerificationLabel={receiverCheckSkipped ? null : "Skip"}
              />

              {previewBusy ? (
                <div className="rounded-[20px] border border-white/8 bg-pop-bg px-4 py-3">
                  <SectionLoader label="Verifying recipient..." />
                </div>
              ) : lookupError ? (
                <div className="rounded-[20px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ffadad]">
                  {lookupError}
                </div>
              ) : recipientPreview ? (
                <div
                  className={`rounded-[20px] border px-4 py-3 ${recipientPreview.status === "registered"
                    ? "border-[#58f2b1]/18 bg-[#58f2b1]/7"
                    : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required"
                      ? "border-[#f3c96b]/30 bg-[#f3c96b]/10"
                      : "border-white/10 bg-pop-bg"
                    }`}
                >
                  {recipientPreview.status === "registered" ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text">{recipientPreview.recipient.displayName}</div>
                          <div className="mt-1 text-[0.74rem] text-text/50">@{recipientPreview.recipient.handle}</div>
                        </div>
                        <span className="rounded-full bg-[#58f2b1]/12 px-2.5 py-1 text-[0.68rem] font-semibold text-[#7dffd9]">
                          On TrustLink
                        </span>
                      </div>
                    </>
                  ) : recipientPreview.status === "whatsapp_only" ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text">{recipientPreview.recipient.displayName}</div>
                          <div className="mt-1 text-[0.74rem] text-[#f3c96b]">{recipientPreview.warning}</div>
                        </div>
                        <span className="whitespace-nowrap rounded-full bg-[#f3c96b]/14 px-2.5 py-1 text-[0.68rem] font-semibold text-[#f3c96b]">
                          Not a TrustLink user
                        </span>
                      </div>
                    </>
                  ) : recipientPreview.status === "manual_invite_required" ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text">{recipientPreview.recipient.phoneNumber}</div>
                          <div className="mt-1 text-[0.74rem] text-[#f3c96b]">{recipientPreview.warning}</div>
                        </div>
                        <span className="whitespace-nowrap rounded-full bg-[#f3c96b]/14 px-2.5 py-1 text-[0.68rem] font-semibold text-[#f3c96b]">
                          Not a TrustLink user
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-text">Recipient could not be verified.</div>
                    </>
                  )}
                </div>
              ) : null}

              <div className="flex items-stretch rounded-[24px] border border-white/8 bg-pop-bg transition-all focus-within:border-[#58f2b1]/40">
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
                    className="w-full bg-transparent text-lg font-semibold text-text outline-none"
                  />
                </div>
                <div className="my-3 w-[1px] bg-white/10" />
                <button
                  type="button"
                  onClick={() => setTokenPickerOpen(true)}
                  className="flex w-[130px] items-center justify-between px-4 py-3 hover:bg-white/[0.02]"
                >
                  {selectedToken ? (
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className="text-sm font-bold text-text">{selectedToken.symbol}</span>
                      <span className="truncate text-[10px] text-text/40">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-text/40">Token</span>
                  )}
                  <span className="text-[10px] text-text/30">v</span>
                </button>
              </div>

              <div className="rounded-[22px] border border-white/6 bg-pop-bg px-4 py-4">
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
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setTokenPickerOpen(false)}>
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
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setConfirmOpen(false)}>
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
