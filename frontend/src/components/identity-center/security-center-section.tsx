"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";

import { GuidedFlowModal } from "@/src/components/modals/guided-flow-modal";
import { OtpModal } from "@/src/components/modals/otp-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import type {
  IdentitySecurityResponse,
  IdentitySecurityState,
  UserProfile,
} from "@/src/lib/types";
import { signAndSendSerializedSolanaTransaction } from "@/src/lib/wallet";
import { useWallet } from "@/src/lib/wallet-provider";

function looksLikeWalletAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;
}

export function SecurityCenterSection({
  accessToken,
  user,
  setUser,
  onLogout,
}: {
  accessToken: string | null;
  user: UserProfile;
  setUser: (user: UserProfile) => void;
  onLogout: () => void;
}) {
  const { showToast } = useToast();
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const [identity, setIdentity] = useState<IdentitySecurityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupWallet, setBackupWallet] = useState("");
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  const [recoveryConfirmOpen, setRecoveryConfirmOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [pinOpen, setPinOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpBusy, setOtpBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void loadIdentity(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!identity?.recoveryCooldown) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [identity?.recoveryCooldown]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(
      () => setOtpCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  const cooldownSeconds = useMemo(() => {
    if (!identity?.recoveryCooldown) return 0;
    return Math.max(
      0,
      Math.ceil(
        (Number(identity.recoveryCooldown) * 1000 - nowMs) / 1000,
      ),
    );
  }, [identity?.recoveryCooldown, nowMs]);
  const visibleMainWallet =
    identity?.mainWallet ?? user.walletAddress ?? null;

  async function loadIdentity(token: string) {
    setLoading(true);
    try {
      const result = await apiGet<IdentitySecurityResponse>(
        "/api/identity",
        token,
      );
      setIdentity(result.identity);
      setBackupWallet(result.identity?.recoveryWallet ?? "");
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load security state",
      );
    } finally {
      setLoading(false);
    }
  }

  async function addBackupWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !identity) {
      setError("A main settlement wallet must be registered first.");
      return;
    }
    const target = backupWallet.trim();
    if (!looksLikeWalletAddress(target)) {
      setError("Enter a valid Solana wallet address.");
      return;
    }
    if (target === identity.mainWallet) {
      setError("Backup wallet must differ from the main wallet.");
      return;
    }
    if (!walletAddress || !session || walletAddress !== identity.mainWallet) {
      requestWalletConnection();
      setError("Connect the current main wallet to approve this change.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{
        serializedTransaction: string;
        rpcUrl: string;
      }>(
        "/api/identity/add-recovery-wallet",
        {
          walletAddress: target,
          allowUpdate: Boolean(identity.recoveryWallet),
        },
        accessToken,
      );
      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });
      await loadIdentity(accessToken);
      setBackupOpen(false);
      showToast(
        identity.recoveryWallet
          ? "Recovery wallet updated."
          : "Recovery wallet added.",
      );
    } catch (backupError) {
      const message =
        backupError instanceof Error
          ? backupError.message
          : "Could not update recovery wallet";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function updateFreeze(frozen: boolean) {
    if (!accessToken || !identity) return;
    if (!walletAddress || !session) {
      requestWalletConnection();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{
        serializedTransaction: string;
        rpcUrl: string;
      }>(
        "/api/identity/freeze",
        { authorityWallet: walletAddress, frozen },
        accessToken,
      );
      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });
      await loadIdentity(accessToken);
      setFreezeConfirmOpen(false);
      showToast(frozen ? "Account frozen." : "Account unlocked.");
    } catch (freezeError) {
      const message =
        freezeError instanceof Error
          ? freezeError.message
          : "Could not update account lock";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function startRecovery() {
    if (!accessToken || !identity) return;
    if (!identity.recoveryWallet) {
      setError("Add a recovery wallet first.");
      return;
    }
    if (!walletAddress || !session) {
      requestWalletConnection();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const prepared = await apiPost<{
        serializedTransaction: string;
        rpcUrl: string;
      }>(
        "/api/identity/request-recovery",
        { authorityWallet: walletAddress },
        accessToken,
      );
      await signAndSendSerializedSolanaTransaction({
        walletId: session.walletId,
        rpcUrl: prepared.rpcUrl,
        serializedTransaction: prepared.serializedTransaction,
      });
      await loadIdentity(accessToken);
      setRecoveryConfirmOpen(false);
      showToast("Recovery safety window started.");
    } catch (recoveryError) {
      const message =
        recoveryError instanceof Error
          ? recoveryError.message
          : "Could not start recovery";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function openChangePin() {
    if (!accessToken) return;
    setOtpBusy(true);
    setError(null);
    try {
      const result = await apiPost<{
        otpSent: true;
        expiresAt: string | null;
      }>("/api/auth/pin/change/start", {}, accessToken);
      setOtp("");
      setNewPin("");
      setPinOpen(true);
      const seconds = result.expiresAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(result.expiresAt).getTime() - Date.now()) / 1000,
            ),
          )
        : 60;
      setOtpCooldown(Math.min(seconds, 60));
      window.setTimeout(() => pinInputRef.current?.focus(), 60);
    } catch (pinError) {
      const message =
        pinError instanceof Error
          ? pinError.message
          : "Could not start PIN change";
      setError(message);
      showToast(message);
    } finally {
      setOtpBusy(false);
    }
  }

  async function submitPinChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (otp.length !== 6 || newPin.length !== 6) {
      setError("Enter both 6-digit codes.");
      return;
    }

    setPinBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ user: UserProfile }>(
        "/api/auth/pin/change/verify",
        { otp, newPin },
        accessToken,
      );
      setUser(result.user);
      setStoredUser(result.user);
      setPinOpen(false);
      setOtp("");
      setNewPin("");
      showToast("PIN changed.");
    } catch (pinError) {
      const message =
        pinError instanceof Error
          ? pinError.message
          : "Could not change PIN";
      setError(message);
      showToast(message);
    } finally {
      setPinBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="tl-panel rounded-[28px] p-5">
        <SectionLoader label="Loading security controls..." />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-[0.76rem] text-danger">
          {error}
        </div>
      ) : null}

      <div className="tl-panel rounded-[28px] p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-[1rem] font-semibold text-[var(--text)]">
            Wallet protection
          </h3>
          <p className="mt-1 text-[0.74rem] leading-5 text-[var(--text-soft)]">
            Main and recovery authority controls for your TrustLink identity.
          </p>
        </div>

        <SecurityRow
          icon={WalletCards}
          label="Main settlement wallet"
          value={
            visibleMainWallet
              ? shortenAddress(visibleMainWallet)
                : "Not registered"
          }
          active={Boolean(visibleMainWallet)}
        />

        <button
          type="button"
          onClick={() => setBackupOpen((current) => !current)}
          className="tl-field mt-2.5 flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left"
        >
          <ShieldCheck
            className={`h-4 w-4 ${
              identity?.recoveryWallet
                ? "text-accent"
                : "text-[var(--warning)]"
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.78rem] font-medium text-[var(--text)]">
              Recovery wallet
            </span>
            <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
              {identity?.recoveryWallet
                ? shortenAddress(identity.recoveryWallet)
                : "Not configured"}
            </span>
          </span>
          {backupOpen ? (
            <ChevronUp className="h-4 w-4 text-[var(--text-faint)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--text-faint)]" />
          )}
        </button>

        {backupOpen ? (
          <form
            onSubmit={addBackupWallet}
            className="mt-3 space-y-3 rounded-[18px] border border-[var(--field-border)] bg-[var(--surface-soft)] p-3"
          >
            <label className="block">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Recovery wallet address
              </span>
              <input
                value={backupWallet}
                onChange={(event) => setBackupWallet(event.target.value)}
                placeholder="Solana public key"
                className="mt-2 block w-full rounded-[14px] border border-[var(--field-border)] bg-[var(--field)] px-3 py-3 text-[0.76rem] text-[var(--text)] outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="tl-button-primary w-full rounded-[15px] px-4 py-3 text-[0.76rem] font-semibold disabled:opacity-50"
            >
              {busy
                ? "Waiting for approval..."
                : identity?.recoveryWallet
                  ? "Update recovery wallet"
                  : "Add recovery wallet"}
            </button>
          </form>
        ) : null}
      </div>

      <div className="tl-panel rounded-[28px] p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-[1rem] font-semibold text-[var(--text)]">
            Access security
          </h3>
          <p className="mt-1 text-[0.74rem] text-[var(--text-soft)]">
            Protect app access and respond to wallet compromise.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void openChangePin()}
          disabled={otpBusy}
          className="tl-field flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left disabled:opacity-50"
        >
          <LockKeyhole className="h-4 w-4 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.78rem] font-medium text-[var(--text)]">
              TrustLink PIN
            </span>
            <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
              {user.pinConfigured ? "Configured" : "Not configured"}
            </span>
          </span>
          <span className="text-[0.68rem] font-medium text-accent">
            {otpBusy ? "Sending..." : "Change"}
          </span>
        </button>

        {identity?.recoveryWallet ? (
          <>
            <button
              type="button"
              onClick={() =>
                identity.isFrozen
                  ? void updateFreeze(false)
                  : setFreezeConfirmOpen(true)
              }
              disabled={busy}
              className="tl-field mt-2.5 flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left disabled:opacity-50"
            >
              <LockKeyhole
                className={`h-4 w-4 ${
                  identity.isFrozen ? "text-[var(--warning)]" : "text-accent"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.78rem] font-medium text-[var(--text)]">
                  {identity.isFrozen ? "Unlock account" : "Freeze account"}
                </span>
                <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                  {identity.isFrozen
                    ? "Payment authority is currently locked"
                    : "Immediately pause identity-controlled activity"}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRecoveryConfirmOpen(true)}
              disabled={busy || cooldownSeconds > 0}
              className="tl-field mt-2.5 flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left disabled:opacity-50"
            >
              <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.78rem] font-medium text-[var(--text)]">
                  Account recovery
                </span>
                <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                  {cooldownSeconds > 0
                    ? `Safety window: ${formatCountdown(cooldownSeconds)}`
                    : "Start a protected wallet recovery process"}
                </span>
              </span>
            </button>
          </>
        ) : null}
      </div>

      <div className="tl-panel rounded-[28px] p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-[1rem] font-semibold text-[var(--text)]">
            Account
          </h3>
          <p className="mt-1 text-[0.74rem] text-[var(--text-soft)]">
            Authentication state and session controls.
          </p>
        </div>
        <SecurityRow
          icon={Smartphone}
          label="WhatsApp authentication"
          value={user.phoneVerifiedAt ? "Verified" : "Not verified"}
          active={Boolean(user.phoneVerifiedAt)}
        />
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3.5 text-[0.78rem] font-semibold text-danger"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>

      <GuidedFlowModal
        open={freezeConfirmOpen}
        title="Freeze account?"
        description="This immediately pauses identity-controlled activity until an authorized wallet unlocks it."
        onClose={() => !busy && setFreezeConfirmOpen(false)}
        dismissible={!busy}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFreezeConfirmOpen(false)}
            disabled={busy}
            className="tl-button-secondary rounded-[18px] px-4 py-3 text-[0.76rem] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void updateFreeze(true)}
            disabled={busy}
            className="rounded-[18px] bg-[var(--warning)] px-4 py-3 text-[0.76rem] font-semibold text-[#1a1004] disabled:opacity-50"
          >
            {busy ? "Freezing..." : "Freeze"}
          </button>
        </div>
      </GuidedFlowModal>

      <GuidedFlowModal
        open={recoveryConfirmOpen}
        title="Start account recovery?"
        description="Recovery freezes the account and begins the on-chain safety window before authority can move."
        onClose={() => !busy && setRecoveryConfirmOpen(false)}
        dismissible={!busy}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRecoveryConfirmOpen(false)}
            disabled={busy}
            className="tl-button-secondary rounded-[18px] px-4 py-3 text-[0.76rem] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void startRecovery()}
            disabled={busy}
            className="tl-button-primary rounded-[18px] px-4 py-3 text-[0.76rem] font-semibold disabled:opacity-50"
          >
            {busy ? "Starting..." : "Start recovery"}
          </button>
        </div>
      </GuidedFlowModal>

      <OtpModal
        open={pinOpen}
        title="Verify PIN change"
        description="Enter the WhatsApp OTP, then choose a new 6-digit TrustLink PIN."
        value={otp}
        onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
        onClose={() => !pinBusy && setPinOpen(false)}
        onResend={() => void openChangePin()}
        resendDisabled={otpBusy || pinBusy}
        countdown={otpCooldown}
        busy={pinBusy}
      >
        <form onSubmit={submitPinChange} className="space-y-3">
          <label className="block">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
              New 6-digit PIN
            </span>
            <input
              ref={pinInputRef}
              value={newPin}
              onChange={(event) =>
                setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              type="password"
              maxLength={6}
              className="mt-2 block w-full rounded-[16px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-3 text-center text-[1rem] tracking-[0.35em] text-[var(--text)] outline-none"
              placeholder="••••••"
            />
          </label>
          <button
            type="submit"
            disabled={pinBusy || otp.length !== 6 || newPin.length !== 6}
            className="tl-button-primary w-full rounded-[16px] px-4 py-3 text-[0.76rem] font-semibold disabled:opacity-45"
          >
            {pinBusy ? "Changing PIN..." : "Save new PIN"}
          </button>
        </form>
      </OtpModal>
    </section>
  );
}

function SecurityRow({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="tl-field flex items-center gap-3 rounded-[18px] px-4 py-3.5">
      <Icon
        className={`h-4 w-4 ${
          active ? "text-accent" : "text-[var(--text-faint)]"
        }`}
      />
      <span className="min-w-0 flex-1 text-[0.78rem] font-medium text-[var(--text)]">
        {label}
      </span>
      <span className="max-w-[48%] truncate text-right text-[0.68rem] text-[var(--text-soft)]">
        {value}
      </span>
    </div>
  );
}
