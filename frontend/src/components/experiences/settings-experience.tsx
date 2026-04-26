"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldCheck, Wallet2 } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { GuidedFlowModal } from "@/src/components/modals/guided-flow-modal";
import { OtpModal } from "@/src/components/modals/otp-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import { useTheme } from "@/src/lib/theme";
import type { IdentitySecurityState, UserProfile } from "@/src/lib/types";
import { signAndSendSerializedSolanaTransaction } from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useWallet } from "@/src/lib/wallet-provider";

type BackupFlowStep = "intro" | "connect" | "success";
type RecoveryFlowStep = "start" | "cooldown" | "set-wallet" | "success";

function PinDigitBoxes({ pin }: { pin: string }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, index) => {
        const isFilled = Boolean(pin[index]);
        const isActive = index === Math.min(pin.length, 5);

        return (
          <div
            key={index}
            className={`grid h-12 place-items-center rounded-[18px] border text-lg font-semibold transition ${
              isFilled
                ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)] dark:text-text"
                : isActive
                  ? "border-[var(--accent-border)] bg-[var(--surface-soft)] text-[var(--text-soft)]"
                  : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)]"
            }`}
          >
            {isFilled ? "*" : ""}
          </div>
        );
      })}
    </div>
  );
}

function looksLikeWalletAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function BackupWalletModal({
  open,
  step,
  busy,
  mainWallet,
  connectedWallet,
  walletInput,
  onClose,
  onSkip,
  onContinue,
  onConnectWallet,
  onUseConnectedWallet,
  onWalletInputChange,
  onSave,
}: {
  open: boolean;
  step: BackupFlowStep;
  busy: boolean;
  mainWallet: string | null;
  connectedWallet: string | null;
  walletInput: string;
  onClose: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onConnectWallet: () => void;
  onUseConnectedWallet: () => void;
  onWalletInputChange: (value: string) => void;
  onSave: () => void;
}) {
  const connectedWalletCanBeBackup = Boolean(mainWallet && connectedWallet && mainWallet !== connectedWallet);
  const needsMainWalletApproval = Boolean(mainWallet && connectedWallet && mainWallet !== connectedWallet);

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
            : "Backup wallet added ✅"
      }
      description={
        step === "intro"
          ? "If you lose access to your main wallet, your backup wallet lets you recover your money. You can skip this for now."
          : step === "connect"
            ? "This wallet will only be used if you need to recover your account."
            : "Your account now has recovery protection."
      }
    >
      <AnimatePresence mode="wait">
        {step === "intro" ? (
          <motion.div
            key="backup-intro"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#58f2b1]/14 text-[#7dffd9]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text">Upgrade your protection</div>
                  <p className="mt-1 text-sm leading-6 text-text/62">
                    Your backup wallet is only used if something goes wrong. It does not affect daily payments.
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
            key="backup-connect"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Main wallet</div>
              <div className="mt-2 text-sm font-semibold text-text">{mainWallet ? shortenAddress(mainWallet) : "Not available yet"}</div>
              <p className="mt-2 text-sm leading-6 text-text/58">This wallet stays in charge of your account and approves any backup changes.</p>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Detected wallet</div>
                  <div className="mt-2 text-sm font-semibold text-text">
                    {connectedWallet ? shortenAddress(connectedWallet) : "No wallet connected"}
                  </div>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-[16px] bg-[#58f2b1]/12 text-[#7dffd9]">
                  <Wallet2 className="h-4.5 w-4.5" />
                </div>
              </div>

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
                    value={walletInput}
                    onChange={(event) => onWalletInputChange(event.target.value)}
                    placeholder="Paste backup wallet address"
                    className="mt-3 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-text outline-none transition placeholder:text-text/26 focus:border-[#58f2b1]/28"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-white/6 bg-black/20 px-4 py-4 text-sm leading-6 text-text/58">
                {needsMainWalletApproval
                  ? "Reconnect your main wallet before saving this change. That approval keeps your account safe."
                  : "You can paste your backup wallet address or connect it first, then save with your main wallet."}
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
                className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : null}

        {step === "success" ? (
          <motion.div
            key="backup-success"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-5"
          >
            <div className="rounded-[24px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/14 text-[#7dffd9]">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm leading-6 text-text/62">
                Your backup wallet is ready if you ever need to protect or recover this account.
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

function FreezeAccountModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <GuidedFlowModal
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      title="Freeze your account"
      description="This will immediately stop all activity and protect your funds."
    >
      <div className="rounded-[24px] border border-[#ffb86b]/18 bg-[#ffb86b]/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#ffb86b]/14 text-[#ffcf8c]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <p className="text-sm leading-6 text-text/64">
            While your account is frozen, payments stay protected and normal activity is paused until you unlock or recover.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-[20px] bg-[linear-gradient(135deg,#ffb86b,#ffe1b0)] px-4 py-3 text-sm font-semibold text-[#1e1303] disabled:opacity-60"
        >
          {busy ? "Locking..." : "Freeze Now"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72"
        >
          Cancel
        </button>
      </div>
    </GuidedFlowModal>
  );
}

function RecoveryFlowModal({
  open,
  step,
  countdownSeconds,
  busy,
  connectedWallet,
  mainWallet,
  stagedWallet,
  onClose,
  onStart,
  onContinue,
  onConnectWallet,
  onUseConnectedWallet,
}: {
  open: boolean;
  step: RecoveryFlowStep;
  countdownSeconds: number;
  busy: boolean;
  connectedWallet: string | null;
  mainWallet: string | null;
  stagedWallet: string | null;
  onClose: () => void;
  onStart: () => void;
  onContinue: () => void;
  onConnectWallet: () => void;
  onUseConnectedWallet: () => void;
}) {
  return (
    <GuidedFlowModal
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      title={
        step === "start"
          ? "Recover your account"
          : step === "cooldown"
            ? "Recovery in progress"
            : step === "set-wallet"
              ? "Set a new main wallet"
              : "Account recovered"
      }
      description={
        step === "start"
          ? "Use your backup wallet to restore access and set a new wallet."
          : step === "cooldown"
            ? "Your account is temporarily locked for security."
            : step === "set-wallet"
              ? "This will become your new wallet for receiving payments."
              : "Your new wallet is now active."
      }
    >
      <AnimatePresence mode="wait">
        {step === "start" ? (
          <motion.div
            key="recovery-start"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-[#ffb86b]/18 bg-[#ffb86b]/10 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#ffb86b]/14 text-[#ffcf8c]">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text">Your funds stay protected</div>
                  <p className="mt-1 text-sm leading-6 text-text/64">
                    As soon as recovery starts, your account is locked so no one can move funds during the safety window.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-60"
            >
              {busy ? "Starting..." : "Continue with Backup Wallet"}
            </button>
          </motion.div>
        ) : null}

        {step === "cooldown" ? (
          <motion.div
            key="recovery-cooldown"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-5 text-center">
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#58f2b1]/10 text-[#7dffd9]"
              >
                <ShieldCheck className="h-7 w-7" />
              </motion.div>
              <div className="mt-4 text-[2rem] font-semibold tracking-[-0.06em] text-text">
                {formatCountdown(countdownSeconds)}
              </div>
              <p className="mt-2 text-sm leading-6 text-text/60">
                Your funds are locked and protected. No one can move them during this countdown.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinue}
              disabled={countdownSeconds > 0}
              className="w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-40"
            >
              {countdownSeconds > 0 ? "Waiting for cooldown to finish" : "Set new wallet"}
            </button>
          </motion.div>
        ) : null}

        {step === "set-wallet" ? (
          <motion.div
            key="recovery-set-wallet"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Current main wallet</div>
              <div className="mt-2 text-sm font-semibold text-text">{mainWallet ? shortenAddress(mainWallet) : "Not available"}</div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">New wallet</div>
              <div className="mt-2 text-sm font-semibold text-text">
                {stagedWallet ? shortenAddress(stagedWallet) : connectedWallet ? shortenAddress(connectedWallet) : "Connect a wallet"}
              </div>
              <p className="mt-2 text-sm leading-6 text-text/58">
                Connect the wallet you want to use next. This step prepares the final protected handoff.
              </p>

              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/78"
                >
                  Connect wallet
                </button>
                {connectedWallet && connectedWallet !== mainWallet ? (
                  <button
                    type="button"
                    onClick={onUseConnectedWallet}
                    className="w-full rounded-[18px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-3 text-sm font-medium text-[#7dffd9]"
                  >
                    Use connected wallet
                  </button>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onContinue}
              disabled={!stagedWallet}
              className="w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-40"
            >
              Continue
            </button>
          </motion.div>
        ) : null}

        {step === "success" ? (
          <motion.div
            key="recovery-success"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="space-y-5"
          >
            <div className="rounded-[24px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/14 text-[#7dffd9]">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm leading-6 text-text/62">
                Your next wallet is ready for the final secure handoff when recovery completion becomes available in the app.
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

export function SettingsExperience() {
  const { hydrated, user, setUser, accessToken, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/settings");
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentitySecurityState | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupFlowStep, setBackupFlowStep] = useState<BackupFlowStep>("intro");
  const [backupWalletInput, setBackupWalletInput] = useState("");
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryFlowStep, setRecoveryFlowStep] = useState<RecoveryFlowStep>("start");
  const [recoveryPreparedWallet, setRecoveryPreparedWallet] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!changePinOpen) {
      setOtp("");
      setNewPin("");
      setOtpCooldown(0);
      return;
    }

    const timer = window.setTimeout(() => pinInputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [changePinOpen]);

  useEffect(() => {
    if (otpCooldown === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setOtpCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadIdentitySecurity(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!recoveryModalOpen && !identity?.recoveryCooldown) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [identity?.recoveryCooldown, recoveryModalOpen]);

  const cooldownSeconds = useMemo(() => {
    if (!identity?.recoveryCooldown) {
      return 0;
    }

    const recoveryCooldownMs = Number(identity.recoveryCooldown) * 1000;
    return Math.max(0, Math.ceil((recoveryCooldownMs - nowMs) / 1000));
  }, [identity?.recoveryCooldown, nowMs]);

  const cooldownDate =
    identity != null && Number(identity.recoveryCooldown) > 0
      ? new Date(Number(identity.recoveryCooldown) * 1000)
      : null;

  if (!hydrated || !user) {
    return null;
  }

  async function openChangePinFlow() {
    if (!accessToken) {
      return;
    }

    setOtpBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPost<{ otpSent: true; expiresAt: string | null }>("/api/auth/pin/change/start", {}, accessToken);
      setChangePinOpen(true);
      if (result.expiresAt) {
        const seconds = Math.max(0, Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 1000));
        setOtpCooldown(Math.min(seconds, 60));
      } else {
        setOtpCooldown(60);
      }
      setNotice("WhatsApp OTP sent. Verify to change your PIN.");
      showToast("WhatsApp OTP sent for PIN change.");
    } catch (changeError) {
      const nextError = changeError instanceof Error ? changeError.message : "Could not start PIN change";
      setError(nextError);
      showToast(nextError);
    } finally {
      setOtpBusy(false);
    }
  }

  async function resendChangePinOtp() {
    await openChangePinFlow();
  }

  async function handlePinChangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }
    if (otp.length !== 6) {
      setError("Enter the 6-digit WhatsApp OTP.");
      return;
    }
    if (newPin.length !== 6) {
      setError("Enter the new 6-digit PIN.");
      return;
    }

    setPinBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPost<{ pinChanged: true; user: UserProfile }>("/api/auth/pin/change/verify", { otp, newPin }, accessToken);
      setUser(result.user);
      setStoredUser(result.user);
      setChangePinOpen(false);
      setOtp("");
      setNewPin("");
      setNotice("PIN updated.");
      showToast("PIN changed successfully.");
    } catch (changeError) {
      const nextError = changeError instanceof Error ? changeError.message : "Could not change PIN";
      setError(nextError);
      showToast(nextError);
    } finally {
      setPinBusy(false);
    }
  }

  async function loadIdentitySecurity(token: string) {
    try {
      const result = await apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", token);
      setIdentity(result.identity);
      if (result.identity?.recoveryWallet) {
        setBackupWalletInput(result.identity.recoveryWallet);
      }
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : "Could not load security details";
      setError(nextError);
    }
  }

  async function handleAddBackupWallet() {
    if (!accessToken || !identity) {
      setError("Receive a payment first so your main wallet can be secured.");
      return;
    }

    const trimmedWallet = backupWalletInput.trim();
    if (!looksLikeWalletAddress(trimmedWallet)) {
      setError("Enter a valid backup wallet address.");
      return;
    }
    if (trimmedWallet === identity.mainWallet) {
      setError("Your backup wallet must be different from your main wallet.");
      return;
    }

    if (!walletAddress || walletAddress !== identity.mainWallet || !session) {
      requestWalletConnection();
      setError("Reconnect your main wallet to approve this backup wallet.");
      return;
    }

    setIdentityBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{ serializedTransaction: string; rpcUrl: string }>(
        "/api/identity/add-recovery-wallet",
        {
          walletAddress: trimmedWallet,
          allowUpdate: Boolean(identity.recoveryWallet),
        },
        accessToken,
      );

      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });

      await loadIdentitySecurity(accessToken);
      setBackupFlowStep("success");
      setNotice(identity.recoveryWallet ? "Backup wallet updated." : "Backup wallet added.");
      showToast(identity.recoveryWallet ? "Backup wallet updated." : "Backup wallet added.");
    } catch (actionError) {
      const nextError = actionError instanceof Error ? actionError.message : "Could not add backup wallet";
      setError(nextError);
      showToast(nextError);
    } finally {
      setIdentityBusy(false);
    }
  }

  async function handleFreeze(frozen: boolean) {
    if (!accessToken || !identity) {
      return;
    }
    if (!identity.recoveryWallet) {
      setError("Add a backup wallet to enable account locking.");
      return;
    }
    if (!walletAddress || !session) {
      requestWalletConnection();
      return;
    }

    setIdentityBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{ serializedTransaction: string; rpcUrl: string }>(
        "/api/identity/freeze",
        { authorityWallet: walletAddress, frozen },
        accessToken,
      );

      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });

      await loadIdentitySecurity(accessToken);
      setNotice(frozen ? "Account locked." : "Account unlocked.");
      showToast(frozen ? "Account locked." : "Account unlocked.");
      setFreezeModalOpen(false);
    } catch (actionError) {
      const nextError = actionError instanceof Error ? actionError.message : "Could not update account lock";
      setError(nextError);
      showToast(nextError);
    } finally {
      setIdentityBusy(false);
    }
  }

  async function handleStartRecovery() {
    if (!accessToken || !identity) {
      return;
    }
    if (!identity.recoveryWallet) {
      setError("Add a backup wallet to enable recovery.");
      return;
    }
    if (!walletAddress || !session) {
      requestWalletConnection();
      return;
    }

    setIdentityBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{ serializedTransaction: string; rpcUrl: string }>(
        "/api/identity/request-recovery",
        { authorityWallet: walletAddress },
        accessToken,
      );

      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });

      await loadIdentitySecurity(accessToken);
      setRecoveryFlowStep("cooldown");
      setNotice("Recovery started. Your account is now protected during the cooldown.");
      showToast("Recovery started.");
    } catch (actionError) {
      const nextError = actionError instanceof Error ? actionError.message : "Could not start recovery";
      setError(nextError);
      showToast(nextError);
    } finally {
      setIdentityBusy(false);
    }
  }

  function openBackupWalletFlow() {
    setBackupFlowStep("intro");
    setBackupModalOpen(true);
  }

  function openRecoveryFlow() {
    if (!identity?.recoveryWallet) {
      setError("Add a backup wallet to enable recovery.");
      return;
    }
    if (cooldownSeconds > 0) {
      setRecoveryFlowStep("cooldown");
    } else if (identity?.isFrozen && Number(identity.recoveryCooldown) > 0) {
      setRecoveryFlowStep("set-wallet");
    } else {
      setRecoveryFlowStep("start");
    }
    setRecoveryModalOpen(true);
  }

  return (
    <AppMobileShell
      currentTab="settings"
      title="Settings"
      subtitle="Keep everyday payments simple while adding stronger protection only when you want it."
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
        {notice ? <div className="tl-badge rounded-[22px] px-4 py-3 text-sm">{notice}</div> : null}
        {error ? <div className="tl-button-danger rounded-[22px] px-4 py-3 text-sm">{error}</div> : null}

        <section className="tl-panel rounded-[30px] p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Security</h2>
            <p className="tl-text-muted text-sm">Your money keeps working normally. Extra protection is there when you need it.</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-[26px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[var(--text-faint)]">Main wallet</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text)]">
                    {identity?.mainWallet ?? user.walletAddress ?? "Not connected yet"}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                    This wallet receives your payments and approves any security changes.
                  </p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#58f2b1]/12 text-[#7dffd9]">
                  <Wallet2 className="h-4.5 w-4.5" />
                </div>
              </div>
            </div>

            {!identity?.recoveryWallet ? (
              <motion.div
                animate={{ scale: [1, 1.01, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="rounded-[26px] border border-[#ffb86b]/24 bg-[#ffb86b]/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-[#ffb86b]/14 text-[#ffcf8c]">
                    <AlertTriangle className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text)]">No backup wallet</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                      If you lose access to your main wallet, you won't be able to recover your funds.
                    </p>
                    <button
                      type="button"
                      onClick={openBackupWalletFlow}
                      className="mt-4 rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
                    >
                      Add Backup Wallet
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-[26px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Backup wallet</div>
                    <div className="mt-2 text-sm font-semibold text-[var(--text)]">{identity.recoveryWallet}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                      Verified and ready to help protect your account if you lose access.
                    </p>
                  </div>
                  <div className="rounded-full bg-[#58f2b1]/14 px-3 py-1.5 text-[0.72rem] font-semibold text-[#7dffd9]">
                    Verified
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openBackupWalletFlow}
                  className="mt-4 rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-[var(--text)]"
                >
                  Add / Update Backup Wallet
                </button>
              </div>
            )}

            {identity?.recoveryWallet ? (
              <div className="rounded-[26px] border border-white/8 bg-black/20 p-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[var(--text-faint)]">Actions</div>
                <div className="mt-3 grid gap-3">
                  <button
                    type="button"
                    onClick={() => (identity.isFrozen ? void handleFreeze(false) : setFreezeModalOpen(true))}
                    disabled={identityBusy}
                    className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                  >
                    {identity.isFrozen ? "Unlock account" : "Lock your account"}
                  </button>
                  <button
                    type="button"
                    onClick={openRecoveryFlow}
                    disabled={identityBusy}
                    className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-50"
                  >
                    Start recovery
                  </button>
                </div>

                {identity.isFrozen ? (
                  <div className="mt-4 rounded-[20px] border border-[#ffb86b]/24 bg-[#ffb86b]/10 px-4 py-4 text-sm leading-6 text-[var(--text-soft)]">
                    Your account is locked right now. Payments remain protected while you decide what to do next.
                  </div>
                ) : null}

                {cooldownDate ? (
                  <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-[var(--text-soft)]">
                    Cooldown ends at {cooldownDate.toLocaleString()}.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-[var(--text-soft)]">
                Add a backup wallet to enable recovery features.
              </div>
            )}
          </div>
        </section>

        <section className="tl-panel rounded-[28px] p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Preferences</h2>
            <p className="tl-text-muted text-sm">Choose how the app feels on this device.</p>
          </div>

          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Theme</div>
            <div className="mt-2 flex items-center gap-2 rounded-[20px] bg-[var(--surface-soft)] p-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex-1 rounded-[16px] px-4 py-3 text-sm font-semibold transition ${theme === "light" ? "tl-button-primary" : "tl-button-secondary"}`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex-1 rounded-[16px] px-4 py-3 text-sm font-semibold transition ${theme === "dark" ? "tl-button-primary" : "tl-button-secondary"}`}
              >
                Dark
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openChangePinFlow()}
            disabled={otpBusy}
            className="tl-button-primary mt-4 w-full rounded-[22px] px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {otpBusy ? "Sending OTP..." : "Change PIN"}
          </button>
        </section>

        <section className="tl-panel rounded-[28px] p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Account</h2>
            <p className="tl-text-muted text-sm">Sign out from this device when you are done.</p>
          </div>

          <button type="button" onClick={logout} className="tl-button-danger w-full rounded-[22px] px-4 py-3 text-sm font-semibold">
            Log out
          </button>
        </section>
      </section>

      <BackupWalletModal
        open={backupModalOpen}
        step={backupFlowStep}
        busy={identityBusy}
        mainWallet={identity?.mainWallet ?? null}
        connectedWallet={walletAddress}
        walletInput={backupWalletInput}
        onClose={() => !identityBusy && setBackupModalOpen(false)}
        onSkip={() => setBackupModalOpen(false)}
        onContinue={() => setBackupFlowStep("connect")}
        onConnectWallet={requestWalletConnection}
        onUseConnectedWallet={() => setBackupWalletInput(walletAddress ?? "")}
        onWalletInputChange={setBackupWalletInput}
        onSave={() => void handleAddBackupWallet()}
      />

      <FreezeAccountModal
        open={freezeModalOpen}
        busy={identityBusy}
        onClose={() => setFreezeModalOpen(false)}
        onConfirm={() => void handleFreeze(true)}
      />

      <RecoveryFlowModal
        open={recoveryModalOpen}
        step={recoveryFlowStep}
        countdownSeconds={cooldownSeconds}
        busy={identityBusy}
        connectedWallet={walletAddress}
        mainWallet={identity?.mainWallet ?? null}
        stagedWallet={recoveryPreparedWallet}
        onClose={() => setRecoveryModalOpen(false)}
        onStart={() => void handleStartRecovery()}
        onContinue={() => {
          if (recoveryFlowStep === "cooldown") {
            setRecoveryFlowStep("set-wallet");
            return;
          }
          if (recoveryFlowStep === "set-wallet") {
            setRecoveryFlowStep("success");
          }
        }}
        onConnectWallet={requestWalletConnection}
        onUseConnectedWallet={() => setRecoveryPreparedWallet(walletAddress ?? null)}
      />

      <OtpModal
        open={changePinOpen}
        title="Verify before changing PIN"
        description="TrustLink sent a WhatsApp OTP to confirm this PIN change."
        value={otp}
        onChange={(value) => setOtp(value.replace(/[^\d]/g, "").slice(0, 6))}
        onClose={() => {
          if (!pinBusy) {
            setChangePinOpen(false);
          }
        }}
        onResend={() => void resendChangePinOtp()}
        resendLabel="Resend OTP"
        resendDisabled={otpBusy || pinBusy}
        countdown={otpCooldown}
        busy={otpBusy}
      >
        <form className="space-y-4" onSubmit={handlePinChangeSubmit}>
          <label className="block">
            <span className="tl-text-muted mb-2 block text-[0.78rem] font-medium uppercase tracking-[0.16em]">New 6-digit PIN</span>
            <div className="relative" onClick={() => pinInputRef.current?.focus()}>
              <input
                ref={pinInputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={newPin}
                onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="absolute inset-0 h-full w-full cursor-text opacity-0"
                aria-label="Enter new 6 digit PIN"
              />
              <PinDigitBoxes pin={newPin} />
            </div>
          </label>

          <button
            type="submit"
            disabled={pinBusy || otp.length !== 6 || newPin.length !== 6}
            className="tl-button-primary w-full rounded-[20px] px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {pinBusy ? "Updating PIN..." : "Save new PIN"}
          </button>
        </form>
      </OtpModal>
    </AppMobileShell>
  );
}
