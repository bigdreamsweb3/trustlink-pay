"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { OtpModal } from "@/src/components/modals/otp-modal";
import { PhoneNumberInput } from "@/src/components/phone-number-input";
import { SiteHeader } from "@/src/components/layout/site-header";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import type { CountryOption } from "@/src/lib/phone-countries";
import {
  detectCountryFromLocale,
  digitsOnly,
  formatPhoneInput,
  getCountryByDialCode,
  getCountryByIso2,
} from "@/src/lib/phone-countries";
import { buildPhoneResolutionPlan } from "@/src/lib/phone-input-resolution";
import { loadPreferredCountryIso2, rememberCountryUsage } from "@/src/lib/phone-preferences";
import {
  clearStoredPendingAuth,
  clearStoredToken,
  clearStoredUser,
  getStoredPendingAuth,
  getStoredToken,
  getStoredUser,
  setStoredPendingAuth,
} from "@/src/lib/storage";
import type { AuthResult, WhatsAppNumberVerificationResult } from "@/src/lib/types";

type AuthMode = "login" | "register";
type FlowState = "idle" | "waiting_opt_in" | "otp_ready";

type StartAuthResponse = {
  phoneNumber: string;
  status: "awaiting_whatsapp_opt_in" | "otp_sent";
  authMode: AuthMode;
  isRegistered: boolean;
  suggestedDisplayName: string | null;
  optedIn: boolean;
  otpReady: boolean;
  expiresAt: string | null;
  whatsappUrl: string | null;
};

type AuthStatusResponse = {
  phoneNumber: string;
  authMode: AuthMode;
  isRegistered: boolean;
  suggestedDisplayName: string | null;
  optedIn: boolean;
  otpReady: boolean;
  expiresAt: string | null;
};

export function AuthExperience({
  redirectTo,
}: {
  initialMode?: AuthMode;
  redirectTo: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resolvedPhoneNumber, setResolvedPhoneNumber] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [showCountryFallback, setShowCountryFallback] = useState(false);
  const [suggestedCountries, setSuggestedCountries] = useState<CountryOption[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [busy, setBusy] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [optionalDisplayName, setOptionalDisplayName] = useState("");
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
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCheckSkipped, setPhoneCheckSkipped] = useState(false);
  const lastSubmittedOtpRef = useRef<string | null>(null);
  const otpRequestLockRef = useRef(false);
  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const preferredCountry = useMemo(() => {
    const preferredIso2 = loadPreferredCountryIso2();
    return getCountryByIso2(preferredIso2) ?? localeCountry;
  }, [localeCountry]);

  const otpDescription = useMemo(() => {
    const base =
      authMode === "register"
        ? "Enter the 6-digit code TrustLink sent after your WhatsApp opt-in."
        : "Enter the 6-digit code TrustLink sent to continue sign-in.";

    if (authMode === "register") {
      return `${base} You can optionally add a display name now or skip it until later.`;
    }

    return base;
  }, [authMode]);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    const pendingAuth = getStoredPendingAuth();

    if (token && user) {
      router.replace(redirectTo as Route);
      return;
    }

    if (pendingAuth?.challengeToken) {
      router.replace((pendingAuth.redirectTo || redirectTo) as Route);
    }
  }, [redirectTo, router]);

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
    const trimmed = phoneNumber.trim();

    if (!trimmed) {
      setResolvedPhoneNumber("");
      setPhoneVerificationState("idle");
      setPhoneVerificationLabel(null);
      setPhoneVerificationDetails(null);
      setPhoneVerified(false);
      setPhoneCheckSkipped(false);
      setShowCountryFallback(false);
      setSuggestedCountries([]);
      return;
    }

    async function verifyResolvedPhone(
      normalizedPhone: string,
      country: CountryOption | null,
      options?: { revealFallback?: boolean; suppressDetailsOnFailure?: boolean },
    ) {
      try {
        const result = await apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", {
          phoneNumber: normalizedPhone,
        });

        setResolvedPhoneNumber(normalizedPhone);
        setPhoneVerified(result.isBusiness);
        setPhoneVerificationDetails({
          displayName: result.displayName,
          profilePic: result.profilePic,
          exists: result.exists,
          isBusiness: result.isBusiness,
          url: result.url,
          resolvedPhoneNumber: formatPhoneInput(normalizedPhone),
          detectedCountry: country,
        });
        setPhoneVerificationState(result.isBusiness ? "valid" : "warning");
        setPhoneVerificationLabel(null);
        if (!result.isBusiness && options?.suppressDetailsOnFailure) {
          setResolvedPhoneNumber("");
          setPhoneVerificationDetails(null);
          setPhoneVerificationState("warning");
          setShowCountryFallback(Boolean(options?.revealFallback));
          return;
        }

        setShowCountryFallback(Boolean(options?.revealFallback));
      } catch {
        if (options?.suppressDetailsOnFailure) {
          setResolvedPhoneNumber("");
          setPhoneVerificationDetails(null);
          setPhoneVerificationState("warning");
          setPhoneVerificationLabel(null);
          setShowCountryFallback(Boolean(options?.revealFallback));
          return;
        }

        setResolvedPhoneNumber(normalizedPhone);
        setPhoneVerified(false);
        setPhoneVerificationDetails({
          displayName: null,
          profilePic: null,
          exists: false,
          isBusiness: false,
          url: `https://api.whatsapp.com/send?phone=${normalizedPhone.replace(/\D/g, "")}`,
          resolvedPhoneNumber: formatPhoneInput(normalizedPhone),
          detectedCountry: country,
        });
        setPhoneVerificationState("warning");
        setPhoneVerificationLabel(null);
        setShowCountryFallback(Boolean(options?.revealFallback));
      }
    }

    const timer = window.setTimeout(async () => {
      setPhoneVerificationState("checking");
      setPhoneVerificationLabel("Checking WhatsApp availability...");
      setPhoneVerificationDetails(null);
      setPhoneVerified(false);
      setShowCountryFallback(false);
      const plan = buildPhoneResolutionPlan({
        input: trimmed,
        localeCountry,
        preferredCountry,
        selectedCountry,
      });

      if (plan.kind === "idle") {
        setPhoneVerificationState("idle");
        setPhoneVerificationLabel(null);
        return;
      }

      if (plan.kind === "fallback") {
        setResolvedPhoneNumber("");
        setPhoneVerified(false);
        setSuggestedCountries(plan.suggestedCountries);
        setPhoneVerificationState("warning");
        setPhoneVerificationLabel(null);
        setShowCountryFallback(true);
        return;
      }

      setSuggestedCountries(plan.suggestedCountries);

      if (plan.kind === "single") {
        await verifyResolvedPhone(plan.candidate.normalizedPhone, plan.candidate.country, {
          revealFallback: plan.candidate.revealFallback,
          suppressDetailsOnFailure: plan.candidate.revealFallback,
        });
        return;
      }

      for (const candidate of plan.candidates) {
        try {
          const result = await apiPost<WhatsAppNumberVerificationResult>("/api/whatsapp/verify-number", {
            phoneNumber: candidate.normalizedPhone,
          });

          if (result.isBusiness) {
            setResolvedPhoneNumber(candidate.normalizedPhone);
            setPhoneVerified(true);
            setPhoneVerificationDetails({
              displayName: result.displayName,
              profilePic: result.profilePic,
              exists: result.exists,
              isBusiness: result.isBusiness,
              url: result.url,
              resolvedPhoneNumber: formatPhoneInput(candidate.normalizedPhone),
              detectedCountry: candidate.country,
            });
            setPhoneVerificationState("valid");
            setPhoneVerificationLabel(null);
            setShowCountryFallback(false);
            return;
          }
        } catch {
          // Keep the first automatic pass silent. We only show fallback first,
          // then reveal personal/unknown details after the user picks a country.
        }
      }

      setPhoneVerified(false);
      setResolvedPhoneNumber("");
      setPhoneVerificationDetails(null);
      setPhoneVerificationState("warning");
      setPhoneVerificationLabel(null);
      setShowCountryFallback(true);
    }, 420);

    return () => window.clearTimeout(timer);
  }, [localeCountry, phoneNumber, preferredCountry, selectedCountry]);

  useEffect(() => {
    if (flowState !== "waiting_opt_in" || !resolvedPhoneNumber) {
      return;
    }

    const timer = window.setInterval(() => {
      void pollOtpStatus();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [flowState, resolvedPhoneNumber]);

  useEffect(() => {
    if (otp.length < 6) {
      lastSubmittedOtpRef.current = null;
      otpRequestLockRef.current = false;
    }

    if (!otpModalOpen || otp.length !== 6 || otpBusy || otpRequestLockRef.current) {
      return;
    }

    if (lastSubmittedOtpRef.current === otp) {
      return;
    }

    lastSubmittedOtpRef.current = otp;
    void handleVerifyOtp();
  }, [otp, otpBusy, otpModalOpen]);

  function rememberSelectedCountry() {
    if (selectedCountry) {
      rememberCountryUsage(selectedCountry.iso2);
    }
  }

  function applySuggestedDisplayName(nextAuthMode: AuthMode, suggestedDisplayName: string | null) {
    const normalizedSuggestion = suggestedDisplayName?.trim();

    if (nextAuthMode !== "register" || !normalizedSuggestion || normalizedSuggestion === "TrustLink User") {
      return;
    }

    setOptionalDisplayName((currentValue) => {
      const normalizedCurrentValue = currentValue.trim();
      if (!normalizedCurrentValue || normalizedCurrentValue === "TrustLink User") {
        return normalizedSuggestion;
      }

      return currentValue;
    });
  }

  async function startFlow() {
    if (busy || flowState === "waiting_opt_in") {
      return;
    }

    if (!resolvedPhoneNumber) {
      const nextError = "Enter your WhatsApp number first.";
      setError(nextError);
      showToast(nextError);
      return;
    }

    if (!phoneVerified && !phoneCheckSkipped) {
      const nextError = "Verify a valid WhatsApp number before continuing.";
      setError(nextError);
      showToast(nextError);
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    setWaitingMessage(null);

    try {
      const result = await apiPost<StartAuthResponse>("/api/auth/phone/start", {
        phoneNumber: resolvedPhoneNumber,
        skipWhatsAppCheck: phoneCheckSkipped,
      });

      rememberSelectedCountry();
      setAuthMode(result.authMode);
      setIsRegistered(result.isRegistered);
      applySuggestedDisplayName(result.authMode, result.suggestedDisplayName);

      if (result.status === "otp_sent") {
        openOtpFlow(result.expiresAt);
        setMessage("Verification code sent to your WhatsApp number.");
        showToast("Verification code sent.");
        return;
      }

      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      }

      setFlowState("waiting_opt_in");
      setWaitingMessage("Send START TRUSTLINK to TrustLink’s business number on WhatsApp. If the automatic WhatsApp handoff does not open on your device, open WhatsApp manually and send the message yourself.");
      showToast("Send START TRUSTLINK to TrustLink on WhatsApp.");
    } catch (startError) {
      const nextError = startError instanceof Error ? startError.message : "Could not start authentication";
      setError(nextError);
      showToast(nextError);
    } finally {
      setBusy(false);
    }
  }

  function openOtpFlow(expiresAt: string | null) {
    setFlowState("otp_ready");
    setOtpModalOpen(true);
    setOtp("");
    lastSubmittedOtpRef.current = null;
    otpRequestLockRef.current = false;
    if (expiresAt) {
      const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setOtpCooldown(Math.min(seconds, 60));
    } else {
      setOtpCooldown(60);
    }
  }

  async function pollOtpStatus() {
    try {
      const result = await apiPost<AuthStatusResponse>("/api/auth/phone/status", {
        phoneNumber: resolvedPhoneNumber,
      });

      setAuthMode(result.authMode);
      setIsRegistered(result.isRegistered);
      applySuggestedDisplayName(result.authMode, result.suggestedDisplayName);

      if (result.otpReady) {
        setWaitingMessage(null);
        openOtpFlow(result.expiresAt);
        showToast("Verification code sent.");
      }
    } catch {
      // Keep polling quietly while the user completes WhatsApp opt-in.
    }
  }

  async function resendOtp() {
    if (otpCooldown > 0) {
      return;
    }

    await startFlow();
  }

  async function handleVerifyOtp() {
    if (otpRequestLockRef.current) {
      return;
    }

    otpRequestLockRef.current = true;
    setOtpBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await apiPost<{
        authenticated: false;
        challengeToken: string;
        pinRequired: boolean;
        pinSetupRequired: boolean;
        isNewUser: boolean;
        user: AuthResult["user"];
      }>("/api/auth/phone/verify", {
        phoneNumber: resolvedPhoneNumber,
        otp,
        displayName: authMode === "register" ? optionalDisplayName.trim() : undefined,
      });

      rememberSelectedCountry();
      clearStoredToken();
      clearStoredUser();
      clearStoredPendingAuth();
      setOtpModalOpen(false);
      setStoredPendingAuth({
        challengeToken: result.challengeToken,
        pinMode: result.pinRequired ? "verify" : "setup",
        user: result.user,
        redirectTo,
      });
      showToast(result.pinRequired ? "OTP confirmed. Unlock the app with your PIN." : "OTP confirmed. Create your PIN inside the app.");
      router.push(redirectTo as Route);
    } catch (verifyError) {
      otpRequestLockRef.current = false;
      const nextError = verifyError instanceof Error ? verifyError.message : "Could not verify OTP";
      setError(nextError);
      showToast(nextError);
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <SiteHeader />

      <section className="auth-layout">
        <aside className="auth-panel auth-panel--lead">
          <span className="hero-kicker">Access your transfer desk</span>
          <h1>Use your WhatsApp number to continue.</h1>
          <p>
            TrustLink starts every sign-in and sign-up with one WhatsApp number. If your number has already opted in,
            TrustLink sends the OTP immediately. If not, send <strong>START TRUSTLINK</strong> to TrustLink’s business number on WhatsApp and we will continue from there.
          </p>

          <div className="auth-panel--form">
            {message ? <div className="notice notice--success">{message}</div> : null}
            {waitingMessage ? <div className="notice notice--success">{waitingMessage}</div> : null}
            {error ? <div className="notice notice--error">{error}</div> : null}

            <div className="stack-form">
              <PhoneNumberInput
                label="WhatsApp number"
                value={phoneNumber}
                verificationState={phoneVerificationState}
                verificationLabel={phoneVerificationLabel}
                verificationDetails={phoneVerificationDetails}
                showCountryFallback={showCountryFallback}
                selectedCountry={selectedCountry}
                suggestedCountries={suggestedCountries}
                fallbackMessage="We couldn't detect this number automatically."
                onChange={(value) => {
                  setPhoneNumber(value);
                  setResolvedPhoneNumber("");
                  setSelectedCountry(null);
                  setShowCountryFallback(false);
                  setSuggestedCountries([]);
                  setFlowState("idle");
                  setWaitingMessage(null);
                  setMessage(null);
                  setError(null);
                  setPhoneVerificationDetails(null);
                  setPhoneCheckSkipped(false);
                }}
                onCountrySelect={(country) => {
                  setSelectedCountry(country);
                  setShowCountryFallback(false);
                  setPhoneVerificationState("checking");
                  setPhoneVerificationLabel(`Retrying with ${country.name}...`);
                  setError(null);
                }}
                onSkipVerification={() => {
                  setPhoneCheckSkipped(true);
                  setPhoneVerified(true);
                  setError(null);
                }}
                skipVerificationLabel={phoneCheckSkipped ? null : "Skip"}
              />

              <button
                className="button w-full rounded-[20px] border border-[#76ffd8]/22 bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.16),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-text shadow-softbox transition hover:border-[#76ffd8]/36 hover:bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.2),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.035)_100%)] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={busy || flowState === "waiting_opt_in" || (!phoneVerified && !phoneCheckSkipped)}
                onClick={() => void startFlow()}
              >
                {flowState === "waiting_opt_in" ? "Waiting for WhatsApp..." : busy ? "Checking number..." : "Continue"}
              </button>
            </div>
          </div>
        </aside>

        <section className="auth-points">
          <div className="h-fit">
            <strong>Phone-first access</strong>
            <span>Your WhatsApp number decides whether TrustLink continues as sign-in or first-time setup.</span>
          </div>
          <div className="h-fit">
            <strong>Send START TRUSTLINK</strong>
            <span>If automatic WhatsApp opening fails on your device, open WhatsApp manually and send START TRUSTLINK to TrustLink’s business number.</span>
          </div>
          <div className="h-fit">
            <strong>OTP follows automatically</strong>
            <span>Once TrustLink receives your WhatsApp opt-in, the verification code is prepared and the sign-in flow continues here.</span>
          </div>
        </section>
      </section>

      <OtpModal
        open={otpModalOpen}
        title={authMode === "register" ? "Verify your WhatsApp number" : "Enter verification code"}
        description={otpDescription}
        value={otp}
        onChange={(nextValue) => setOtp(nextValue.replace(/[^\d]/g, "").slice(0, 6))}
        onClose={() => setOtpModalOpen(false)}
        onResend={() => void resendOtp()}
        resendLabel="Resend OTP"
        resendDisabled={busy}
        countdown={otpCooldown}
        busy={otpBusy}
      >
        {authMode === "register" ? (
          <label className="field-block">
            <span>Display name (optional)</span>
            <input
              value={optionalDisplayName}
              onChange={(event) => setOptionalDisplayName(event.target.value)}
              placeholder="TrustLink User"
            />
          </label>
        ) : null}
      </OtpModal>
    </main>
  );
}
