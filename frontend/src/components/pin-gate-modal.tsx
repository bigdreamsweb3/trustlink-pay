"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import type { AuthResult, PendingAuthSession, UserProfile } from "@/src/lib/types";

function PinDigitBoxes({ pin }: { pin: string }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, index) => {
        const isFilled = Boolean(pin[index]);
        const isActive = index === Math.min(pin.length, 5);

        return (
          <div
            key={index}
            className={`grid h-14 place-items-center rounded-[18px] border text-lg font-semibold transition ${
              isFilled
                ? "border-[#7dffd9]/70 bg-[#7dffd9]/8 text-white"
                : isActive
                  ? "border-[#7dffd9]/40 bg-white/[0.03] text-white/70"
                  : "border-white/10 bg-white/[0.03] text-white/32"
            }`}
          >
            {isFilled ? "•" : ""}
          </div>
        );
      })}
    </div>
  );
}

export function PinGateModal({
  pendingAuth,
  user,
  onAuthenticated,
  onSignOut
}: {
  pendingAuth: PendingAuthSession;
  user: UserProfile;
  onAuthenticated: (result: AuthResult) => void;
  onSignOut: () => void;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPin("");
    setError(null);
  }, [pendingAuth.challengeToken, pendingAuth.pinMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, []);

  const heading = pendingAuth.pinMode === "setup" ? "Create your TrustLink PIN" : "Unlock with your PIN";
  const description = useMemo(() => {
    if (pendingAuth.pinMode === "setup") {
      return "Your account is already verified. Create your 6-digit PIN here before any part of the app becomes usable.";
    }

    return "Your WhatsApp login is complete. Enter your 6-digit TrustLink PIN to unlock the app and continue safely.";
  }, [pendingAuth.pinMode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pin.length !== 6) {
      setError("Enter your 6-digit PIN to continue.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const path = pendingAuth.pinMode === "setup" ? "/api/auth/pin/setup" : "/api/auth/pin/verify";
      const result = await apiPost<{ accessGranted: true } & AuthResult>(path, {
        challengeToken: pendingAuth.challengeToken,
        pin
      });

      onAuthenticated(result);
      showToast(pendingAuth.pinMode === "setup" ? "PIN created. App unlocked." : "PIN verified. Welcome back.");
    } catch (pinError) {
      const message = pinError instanceof Error ? pinError.message : "Could not complete PIN step";
      setError(message);
      showToast(message);
      setPin("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#03080e]/82 p-4 backdrop-blur-xl md:items-center">
      <div className="w-full max-w-[430px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#0b1118_0%,#091019_100%)] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.2em] text-[#7dffd9]/70">TrustLink secure access</div>
            <h2 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.05em] text-white">{heading}</h2>
            <p className="mt-2 max-w-[24rem] text-sm leading-6 text-white/56">{description}</p>
          </div>
          <div className="rounded-full border border-[#7dffd9]/20 bg-[#7dffd9]/10 px-3 py-1 text-[0.72rem] font-medium text-[#7dffd9]">
            @{user.handle}
          </div>
        </div>

        <div className="mb-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
          <div className="text-sm font-semibold text-white">{user.displayName}</div>
          <div className="mt-1 text-sm text-white/48">
            {pendingAuth.pinMode === "setup"
              ? "Set the transaction PIN that will protect future sessions and high-trust actions."
              : "This session stays blocked until the correct transaction PIN is entered."}
          </div>
        </div>

        {error ? <div className="mb-4 rounded-[18px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[0.78rem] font-medium uppercase tracking-[0.16em] text-white/42">6-digit PIN</span>
            <div className="relative" onClick={() => inputRef.current?.focus()}>
              <input
                ref={inputRef}
                inputMode="numeric"
                autoComplete={pendingAuth.pinMode === "setup" ? "one-time-code" : "current-password"}
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="absolute inset-0 h-full w-full cursor-text opacity-0"
                aria-label={pendingAuth.pinMode === "setup" ? "Create 6 digit PIN" : "Enter 6 digit PIN"}
              />
              <PinDigitBoxes pin={pin} />
            </div>
          </label>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-[18px] border border-white/10 px-4 py-3 text-sm font-medium text-white/64 transition hover:border-white/18 hover:text-white"
            >
              Sign out
            </button>
            <button
              type="submit"
              disabled={busy || pin.length !== 6}
              className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-5 py-3 text-sm font-semibold text-[#05110d] shadow-[0_16px_36px_rgba(88,242,177,0.18)] transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Checking PIN..." : pendingAuth.pinMode === "setup" ? "Create PIN" : "Unlock app"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
