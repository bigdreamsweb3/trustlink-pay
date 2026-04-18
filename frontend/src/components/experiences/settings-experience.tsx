"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { OtpModal } from "@/src/components/modals/otp-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import { useTheme } from "@/src/lib/theme";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { UserProfile } from "@/src/lib/types";

function PinDigitBoxes({ pin }: { pin: string }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, index) => {
        const isFilled = Boolean(pin[index]);
        const isActive = index === Math.min(pin.length, 5);

        return (
          <div
            key={index}
            className={`grid h-12 place-items-center rounded-[18px] border text-lg font-semibold transition ${isFilled
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)] dark:text-text"
              : isActive
                ? "border-[var(--accent-border)] bg-[var(--surface-soft)] text-[var(--text-soft)]"
                : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)]"
              }`}
          >
            {isFilled ? "•" : ""}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsExperience() {
  const { hydrated, user, setUser, accessToken, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/settings");
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const result = await apiPost<{ pinChanged: true; user: UserProfile }>("/api/auth/pin/change/verify", {
        otp,
        newPin,
      }, accessToken);

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

  return (
    <AppMobileShell
      currentTab="settings"
      title="Settings"
      subtitle="Control how TrustLink feels on this device, while keeping room for deeper preferences later."
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

        <section className="tl-panel rounded-[28px] p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Preferences</h2>
            <p className="tl-text-muted text-sm">This is where personal app preferences will live as TrustLink grows.</p>
          </div>

          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Display currency</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">USD</div>
                <div className="tl-text-muted mt-1 text-sm">Multi-currency balance conversion is planned for a future update.</div>
              </div>
              <span className="tl-button-secondary rounded-full px-3 py-1.5 text-[0.72rem]">Coming soon</span>
            </div>
          </div>

          <div className="tl-field mt-4 rounded-[22px] px-4 py-4">
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
            <p className="tl-text-muted mt-3 text-sm">Switch between the bright mint-and-white TrustLink Pay look and the existing dark mode.</p>
          </div>
        </section>

        <section className="tl-panel rounded-[28px] p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Security</h2>
            <p className="tl-text-muted text-sm">Changing your TrustLink PIN now requires a fresh WhatsApp OTP verification.</p>
          </div>

          <button
            type="button"
            onClick={() => void openChangePinFlow()}
            disabled={otpBusy}
            className="tl-button-primary w-full rounded-[22px] px-4 py-3 text-sm font-semibold disabled:opacity-50"
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
