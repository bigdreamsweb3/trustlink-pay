"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ShieldCheck, Wallet2 } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { GuidedFlowModal } from "@/src/components/modals/guided-flow-modal";
import { PinEntryModal } from "@/src/components/modals/pin-entry-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { SuccessIcon } from "@/src/components/success-icon";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import type { IdentitySecurityState, PaymentRecord } from "@/src/lib/types";
import { signAndSendSerializedSolanaTransaction } from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useWallet } from "@/src/lib/wallet-provider";

type PaymentDetailsResponse = {
  payment: PaymentRecord;
  sender: {
    displayName: string;
    handle: string;
    referenceCode: string;
  };
};

type ClaimSuccess = {
  referenceCode: string;
  walletAddress: string;
  blockchainSignature: string | null;
  claimFeeAmount: number | null;
  netAmount: number | null;
  tokenSymbol: string | null;
};

type ClaimFeeEstimate = {
  feeAmountUi: number;
  feeAmountUsd: number | null;
  estimatedNetworkFeeSol: number;
  estimatedNetworkFeeUsd: number | null;
  markupAmountUi: number;
  receiverAmountUi: number;
  totalAmountUi: number;
};

type BackupFlowStep = "intro" | "connect" | "success";

function toNumericAmount(value: string | number | null | undefined) {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function looksLikeWalletAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function SuccessSummaryCard({
  payment,
  claimSuccess,
  feeAmount,
  netAmount,
}: {
  payment: PaymentDetailsResponse;
  claimSuccess: ClaimSuccess;
  feeAmount: number;
  netAmount: number;
}) {
  return (
    <div className="mt-5 space-y-3 rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text/46">Reference</span>
        <span className="font-medium text-text">{claimSuccess.referenceCode}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text/46">From</span>
        <span className="font-medium text-text">{payment.sender.displayName}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text/46">Amount received</span>
        <span className="font-medium text-[#7dffd9]">
          {formatTokenAmount(netAmount)} {payment.payment.token_symbol}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text/46">Service fee</span>
        <span className="font-medium text-text">
          {formatTokenAmount(feeAmount)} {payment.payment.token_symbol}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text/46">Wallet</span>
        <span className="font-medium text-text">{shortenAddress(claimSuccess.walletAddress)}</span>
      </div>
      {claimSuccess.blockchainSignature ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text/46">Transaction</span>
          <span className="font-medium text-text">{shortenAddress(claimSuccess.blockchainSignature)}</span>
        </div>
      ) : null}
    </div>
  );
}

function BackupWalletFlow({
  open,
  step,
  connectedWallet,
  mainWallet,
  backupWalletInput,
  busy,
  onClose,
  onSkip,
  onContinue,
  onWalletInputChange,
  onSave,
  onUseConnectedWallet,
  onConnectWallet,
}: {
  open: boolean;
  step: BackupFlowStep;
  connectedWallet: string | null;
  mainWallet: string | null;
  backupWalletInput: string;
  busy: boolean;
  onClose: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onWalletInputChange: (value: string) => void;
  onSave: () => void;
  onUseConnectedWallet: () => void;
  onConnectWallet: () => void;
}) {
  const connectedWalletIsMain = Boolean(mainWallet && connectedWallet && connectedWallet === mainWallet);
  const connectedWalletCanBeBackup = Boolean(connectedWallet && mainWallet && connectedWallet !== mainWallet);
  const needsMainWalletApproval = Boolean(mainWallet && connectedWallet && connectedWallet !== mainWallet);

  return (
    <GuidedFlowModal
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      title={
        step === "intro"
          ? "Protect your funds"
          : step === "connect"
            ? "Connect a backup wallet"
            : "Backup wallet added"
      }
      description={
        step === "intro"
          ? "If you lose access to your main wallet, your backup wallet lets you recover your money. You can skip this for now."
          : step === "connect"
            ? "This wallet is only used if you need to recover your account later."
            : "Your account now has recovery protection."
      }
    >
      <AnimatePresence mode="wait">
        {step === "intro" ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#58f2b1]/14 text-[#7dffd9]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text">Stay in control</div>
                  <p className="mt-1 text-sm leading-6 text-text/60">
                    Your main wallet keeps receiving payments. A backup wallet is there only for emergencies.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72"
              >
                Skip
              </button>
            </div>
          </motion.div>
        ) : null}

        {step === "connect" ? (
          <motion.div
            key="connect"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Main wallet</div>
              <div className="mt-2 text-sm font-semibold text-text">{mainWallet ? shortenAddress(mainWallet) : "Not connected yet"}</div>
              <p className="mt-2 text-sm leading-6 text-text/56">This wallet stays in charge of your account and approves the backup wallet.</p>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Backup wallet</div>
                  <div className="mt-2 text-sm font-semibold text-text">
                    {connectedWallet ? shortenAddress(connectedWallet) : "No wallet connected yet"}
                  </div>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-[16px] bg-[#58f2b1]/12 text-[#7dffd9]">
                  <Wallet2 className="h-4.5 w-4.5" />
                </div>
              </div>

              <p className="mt-2 text-sm leading-6 text-text/56">
                Connect the wallet you want to keep as your backup, or paste its address below.
              </p>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/78"
                >
                  Connect wallet
                </button>

                {connectedWalletCanBeBackup ? (
                  <button
                    type="button"
                    onClick={onUseConnectedWallet}
                    className="w-full rounded-[18px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-3 text-sm font-medium text-[#7dffd9]"
                  >
                    Use connected wallet
                  </button>
                ) : null}

                <div className="rounded-[20px] border border-white/6 bg-black/20 px-4 py-4">
                  <label className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Wallet address</label>
                  <input
                    value={backupWalletInput}
                    onChange={(event) => onWalletInputChange(event.target.value)}
                    placeholder="Paste backup wallet address"
                    className="mt-3 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-text outline-none transition placeholder:text-text/26 focus:border-[#58f2b1]/28"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-white/6 bg-black/20 px-4 py-4 text-sm leading-6 text-text/58">
                {connectedWalletIsMain
                  ? "Your main wallet is connected right now. You can paste your backup wallet address, or switch wallets and come back."
                  : needsMainWalletApproval
                    ? "Reconnect your main wallet before saving this change. That approval keeps your account secure."
                    : "When you continue, your main wallet will approve this backup wallet for emergencies only."}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={busy}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-60"
              >
                {busy ? "Saving..." : needsMainWalletApproval ? "Reconnect main wallet" : "Add backup wallet"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : null}

        {step === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-5"
          >
            <div className="rounded-[24px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/14 text-[#7dffd9]">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm leading-6 text-text/62">
                If you ever lose access to your main wallet, your backup wallet can help you recover safely.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
            >
              Done
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GuidedFlowModal>
  );
}

export function ClaimExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } =
    useAuthenticatedSession(`/claim/${paymentId}`);
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const { showToast } = useToast();
  const [payment, setPayment] = useState<PaymentDetailsResponse | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
  const [identitySecurity, setIdentitySecurity] = useState<IdentitySecurityState | null>(null);
  const [dismissRecoveryPrompt, setDismissRecoveryPrompt] = useState(false);
  const [claimFeeEstimate, setClaimFeeEstimate] = useState<ClaimFeeEstimate | null>(null);
  const [claimFeeBusy, setClaimFeeBusy] = useState(false);
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const [backupFlowOpen, setBackupFlowOpen] = useState(false);
  const [backupFlowStep, setBackupFlowStep] = useState<BackupFlowStep>("intro");
  const [backupWalletInput, setBackupWalletInput] = useState("");
  const [backupFlowBusy, setBackupFlowBusy] = useState(false);
  const lastSubmittedPinRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadClaimData(accessToken);
  }, [accessToken, user, paymentId]);
  const activeWalletAddress = walletAddress ?? null;
  const grossAmount = toNumericAmount(payment?.payment.amount);
  const feeAmount =
    claimSuccess?.claimFeeAmount ??
    claimFeeEstimate?.feeAmountUi ??
    toNumericAmount(payment?.payment.claim_fee_amount);
  const netAmount = claimSuccess?.netAmount ?? claimFeeEstimate?.receiverAmountUi ?? Math.max(grossAmount - feeAmount, 0);
  const boundMainWallet = identitySecurity?.mainWallet ?? null;
  const requiresBoundWalletConnection = Boolean(boundMainWallet);
  const isConnectedToRequiredWallet = requiresBoundWalletConnection
    ? activeWalletAddress === boundMainWallet
    : Boolean(activeWalletAddress);

  useEffect(() => {
    if (!pinModalOpen || !activeWalletAddress || pin.length !== 6 || claimBusy || !accessToken) {
      return;
    }

    if (lastSubmittedPinRef.current === pin) {
      return;
    }

    lastSubmittedPinRef.current = pin;
    void handleClaim();
  }, [accessToken, activeWalletAddress, claimBusy, pin, pinModalOpen]);

  useEffect(() => {
    if (!accessToken || !payment || !activeWalletAddress || claimSuccess || payment.payment.status !== "pending") {
      return;
    }

    let cancelled = false;

    async function loadClaimEstimate() {
      setClaimFeeBusy(true);

      try {
        const result = await apiPost<{ estimate: ClaimFeeEstimate }>(
          "/api/payment/claim/estimate",
          {
            paymentId,
            ...(activeWalletAddress ? { walletAddress: activeWalletAddress } : {}),
          },
          accessToken ?? undefined,
        );

        if (!cancelled) {
          setClaimFeeEstimate(result.estimate);
        }
      } catch {
        if (!cancelled) {
          setClaimFeeEstimate(null);
        }
      } finally {
        if (!cancelled) {
          setClaimFeeBusy(false);
        }
      }
    }

    void loadClaimEstimate();

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeWalletAddress, claimSuccess, payment, paymentId]);

  async function loadClaimData(token: string) {
    setLoading(true);

    try {
      const [paymentResult, identityResult] = await Promise.all([
        apiGet<PaymentDetailsResponse>(`/api/payment/${paymentId}`, token),
        apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", token),
      ]);

      setPayment(paymentResult);
      setIdentitySecurity(identityResult.identity);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payment details");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenPinConfirmation() {
    if (!activeWalletAddress) {
      setError("Connect your wallet before continuing.");
      requestWalletConnection();
      return;
    }

    if (boundMainWallet && activeWalletAddress !== boundMainWallet) {
      setError(`Connect your main wallet ${shortenAddress(boundMainWallet)} to continue.`);
      requestWalletConnection();
      return;
    }

    setError(null);
    setStatus(null);
    setPin("");
    lastSubmittedPinRef.current = null;
    setPinModalOpen(true);
  }

  async function handleClaim() {
    if (!accessToken || !activeWalletAddress) {
      setError("Connect a wallet before continuing.");
      return;
    }

    setClaimBusy(true);
    setError(null);

    try {
      const result = await apiPost<{
        referenceCode: string;
        walletAddress: string;
        claimFeeAmount: string | null;
        netAmount: number | null;
        tokenSymbol: string | null;
        blockchainSignature: string | null;
      }>(
        "/api/payment/accept",
        {
          paymentId,
          pin,
          ...(activeWalletAddress ? { walletAddress: activeWalletAddress } : {}),
        },
        accessToken,
      );

      setStatus(`Reference ${result.referenceCode} received successfully in ${result.walletAddress}.`);
      setClaimSuccess({
        ...result,
        claimFeeAmount: result.claimFeeAmount != null ? Number(result.claimFeeAmount) : null,
      });
      setPinModalOpen(false);
      showToast("Payment received successfully.");
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not receive payment");
    } finally {
      setClaimBusy(false);
    }
  }

  function openBackupFlow() {
    setBackupFlowStep("intro");
    setBackupFlowOpen(true);
  }

  function closeBackupFlow() {
    if (backupFlowBusy) {
      return;
    }
    setBackupFlowOpen(false);
    setBackupFlowStep("intro");
  }

  async function handleAddBackupWallet() {
    if (!accessToken || !identitySecurity) {
      setError("Receive a payment first to secure this wallet.");
      return;
    }

    const trimmedWallet = backupWalletInput.trim();
    if (!looksLikeWalletAddress(trimmedWallet)) {
      setError("Enter a valid backup wallet address.");
      return;
    }
    if (trimmedWallet === identitySecurity.mainWallet) {
      setError("Your backup wallet must be different from your main wallet.");
      return;
    }

    if (!walletAddress || walletAddress !== identitySecurity.mainWallet || !session) {
      requestWalletConnection();
      setError("Reconnect your main wallet to approve this backup wallet.");
      return;
    }

    setBackupFlowBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{
        serializedTransaction: string;
        rpcUrl: string;
      }>(
        "/api/identity/add-recovery-wallet",
        {
          walletAddress: trimmedWallet,
          allowUpdate: Boolean(identitySecurity.recoveryWallet),
        },
        accessToken,
      );

      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });

      const refreshed = await apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", accessToken);
      setIdentitySecurity(refreshed.identity);
      setBackupFlowStep("success");
      setDismissRecoveryPrompt(true);
      showToast("Backup wallet added.");
    } catch (actionError) {
      const nextError = actionError instanceof Error ? actionError.message : "Could not add backup wallet";
      setError(nextError);
      showToast(nextError);
    } finally {
      setBackupFlowBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Receive payment"
      subtitle="Connect the right wallet, confirm with your PIN, and receive the payment instantly."
      user={user}
      showBackButton
      backHref="/app/claim"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {status && !claimSuccess ? (
          <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[22px] border border-[#ff7f7f]/15 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ffb4b4]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
            <SectionLoader size="md" label="Loading payment details..." />
          </section>
        ) : claimSuccess && payment ? (
          <section className="rounded-[30px] border border-white/8 bg-pop-bg p-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="flex justify-center"
            >
              <SuccessIcon className="h-16 w-16" />
            </motion.div>

            <div className="mt-5 text-center">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Payment received</div>
              <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.06em] text-text">Payment received 🎉</h2>
              <p className="mt-3 text-sm leading-6 text-text/60">
                Your money is now secured to your wallet. Add a backup wallet to protect your funds in case you lose access.
              </p>
            </div>

            <SuccessSummaryCard
              payment={payment}
              claimSuccess={claimSuccess}
              feeAmount={feeAmount}
              netAmount={netAmount}
            />

            {!identitySecurity?.recoveryWallet && !dismissRecoveryPrompt ? (
              <motion.div
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: 0.08, ease: "easeOut" }}
                className="mt-5 grid gap-3"
              >
                <button
                  type="button"
                  onClick={openBackupFlow}
                  className="w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
                >
                  Add Backup Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setDismissRecoveryPrompt(true)}
                  className="w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72"
                >
                  Not now
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="mt-5 grid grid-cols-2 gap-3"
              >
                <Link
                  href="/app"
                  className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-medium text-text/78"
                >
                  Back home
                </Link>
                <Link
                  href="/app/settings"
                  className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-center text-sm font-semibold text-[#04110a]"
                >
                  Security
                </Link>
              </motion.div>
            )}
          </section>
        ) : payment ? (
          <>
            <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Incoming payment</div>
              <div className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-text">
                {formatTokenAmount(netAmount)} {payment.payment.token_symbol}
              </div>
              <div className="mt-2 text-sm text-text/58">
                This is the amount that will arrive in your wallet after the service fee is deducted.
              </div>
              <div className="mt-4 space-y-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Sent amount</span>
                  <span className="font-medium text-text">
                    {formatTokenAmount(grossAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 text-text/46">
                    Service fee
                    <button
                      type="button"
                      onClick={() => setFeeInfoOpen((current) => !current)}
                      className="grid h-5 w-5 place-items-center rounded-full border border-white/10 text-[0.68rem] font-semibold text-text/58 transition hover:border-white/20 hover:text-text"
                      aria-label="Why is a service fee charged?"
                    >
                      i
                    </button>
                  </span>
                  <span className="font-medium text-text">
                    {formatTokenAmount(feeAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
                {!claimSuccess && claimFeeEstimate?.estimatedNetworkFeeSol != null ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Estimated Solana cost</span>
                    <span className="font-medium text-text">
                      {claimFeeEstimate.estimatedNetworkFeeSol.toFixed(6)} SOL
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-sm">
                  <span className="text-text/72">Amount to wallet</span>
                  <span className="font-semibold text-[#7dffd9]">
                    {formatTokenAmount(netAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
              </div>
              <AnimatePresence>
                {feeInfoOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="mt-3 rounded-[20px] border border-[#58f2b1]/14 bg-[#58f2b1]/8 px-4 py-3 text-sm leading-6 text-text/68"
                  >
                    TrustLink covers the receive path even when the receiver has no SOL for gas. This fee combines the current network cost and the configured TrustLink margin.
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="mt-4 text-sm text-text/58">
                From {payment.sender.displayName} (@{payment.sender.handle})
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-black/20 px-3 py-3 text-sm text-text/54">
                <span>Reference {payment.sender.referenceCode}</span>
                <span className="uppercase text-text/36">{payment.payment.status}</span>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
              <div className="mb-3">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Wallet</h2>
                <p className="text-sm text-text/48">
                  {boundMainWallet
                    ? "This payment is protected by your bound main wallet."
                    : "Connect the wallet you want to use for this first receive."}
                </p>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">
                  {boundMainWallet ? "Required wallet" : "Wallet to connect"}
                </div>
                <div className="mt-2 text-sm font-semibold text-text">
                  {boundMainWallet
                    ? shortenAddress(boundMainWallet)
                    : activeWalletAddress
                      ? shortenAddress(activeWalletAddress)
                      : "No wallet connected"}
                </div>
                <p className="mt-2 text-sm leading-6 text-text/56">
                  {boundMainWallet
                    ? activeWalletAddress === boundMainWallet
                      ? "You are connected to the correct main wallet for this identity."
                      : activeWalletAddress
                        ? `You are connected to ${shortenAddress(activeWalletAddress)}. Switch to your main wallet to continue.`
                        : "Connect your main wallet to continue with this payment."
                    : activeWalletAddress
                      ? "This connected wallet will be bound to your identity after the payment is received."
                      : "Connect your wallet to continue. Saved wallets no longer control where a claim goes."}
                </p>
                <button
                  type="button"
                  onClick={requestWalletConnection}
                  className="mt-4 rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/78"
                >
                  {activeWalletAddress ? "Switch wallet" : "Connect wallet"}
                </button>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Final step</div>
                <p className="mt-2 text-sm leading-6 text-text/58">
                  {isConnectedToRequiredWallet
                    ? "Tap continue, enter your 6-digit PIN, and your payment will move straight into your wallet."
                    : "Tap continue to connect the correct wallet first. After that, you will confirm with your 6-digit PIN."}
                </p>
                {claimFeeBusy ? <div className="mt-3 text-xs text-text/42">Refreshing estimate...</div> : null}
              </div>

              <button
                type="button"
                onClick={isConnectedToRequiredWallet ? handleOpenPinConfirmation : requestWalletConnection}
                disabled={claimBusy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-softbox disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {claimBusy
                    ? "Checking PIN..."
                    : isConnectedToRequiredWallet
                      ? "Continue"
                      : boundMainWallet
                        ? "Connect main wallet"
                        : "Connect wallet"}
                </span>
                {!claimBusy ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </section>
          </>
        ) : (
          <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4 text-sm text-text/48">
            Payment details are unavailable right now.
          </section>
        )}
      </section>

      <BackupWalletFlow
        open={backupFlowOpen}
        step={backupFlowStep}
        connectedWallet={walletAddress}
        mainWallet={identitySecurity?.mainWallet ?? null}
        backupWalletInput={backupWalletInput}
        busy={backupFlowBusy}
        onClose={closeBackupFlow}
        onSkip={() => {
          setDismissRecoveryPrompt(true);
          closeBackupFlow();
        }}
        onContinue={() => setBackupFlowStep("connect")}
        onWalletInputChange={setBackupWalletInput}
        onSave={() => void handleAddBackupWallet()}
        onUseConnectedWallet={() => setBackupWalletInput(walletAddress ?? "")}
        onConnectWallet={requestWalletConnection}
      />

      <PinEntryModal
        open={pinModalOpen}
        title="Confirm receipt with PIN"
        description={
          payment
            ? `Enter your TrustLink PIN to receive ${formatTokenAmount(netAmount)} ${payment.payment.token_symbol} in your wallet.`
            : "Enter your TrustLink PIN to receive this payment."
        }
        value={pin}
        onChange={(nextValue) => {
          lastSubmittedPinRef.current = null;
          setPin(nextValue.replace(/[^\d]/g, "").slice(0, 6));
        }}
        onClose={() => !claimBusy && setPinModalOpen(false)}
        busy={claimBusy}
      />
    </AppMobileShell>
  );
}
