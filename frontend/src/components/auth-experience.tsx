"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { PhoneNumberInput } from "@/src/components/phone-number-input";
import { SiteHeader } from "@/src/components/site-header";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import type { CountryOption } from "@/src/lib/phone-countries";
import { rememberCountryUsage } from "@/src/lib/phone-preferences";
import {
  clearStoredPendingAuth,
  clearStoredToken,
  clearStoredUser,
  getStoredPendingAuth,
  getStoredToken,
  getStoredUser,
  setStoredPendingAuth
} from "@/src/lib/storage";
import type { AuthResult } from "@/src/lib/types";

type AuthMode = "login" | "register";

export function AuthExperience({
  initialMode,
  redirectTo
}: {
  initialMode: AuthMode;
  redirectTo: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpCooldowns, setOtpCooldowns] = useState<{ register: number; login: number }>({
    register: 0,
    login: 0
  });
  const [registerCountry, setRegisterCountry] = useState<CountryOption | null>(null);
  const [loginCountry, setLoginCountry] = useState<CountryOption | null>(null);
  const [registerForm, setRegisterForm] = useState({
    phoneNumber: "",
    otp: "",
    displayName: "",
    handle: ""
  });
  const [loginForm, setLoginForm] = useState({
    phoneNumber: "",
    otp: ""
  });

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

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
    if (otpCooldowns.register === 0 && otpCooldowns.login === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setOtpCooldowns((current) => ({
        register: Math.max(0, current.register - 1),
        login: Math.max(0, current.login - 1)
      }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCooldowns.login, otpCooldowns.register]);

  async function sendOtp(kind: AuthMode) {
    const phoneNumber = kind === "register" ? registerForm.phoneNumber : loginForm.phoneNumber;
    const selectedCountry = kind === "register" ? registerCountry : loginCountry;

    if (otpCooldowns[kind] > 0) {
      return;
    }

    if (!phoneNumber) {
      setError("Enter your WhatsApp number first.");
      showToast("Enter your WhatsApp number first.");
      return;
    }

    setOtpBusy(true);
    setError(null);
    setMessage(null);

    try {
      const path = kind === "register" ? "/api/auth/register/start" : "/api/auth/login/start";
      const result = await apiPost<{ expiresAt: string }>(path, { phoneNumber });
      if (selectedCountry) {
        rememberCountryUsage(selectedCountry.iso2);
      }
      setMessage(
        `Verification code sent. Expires ${new Date(result.expiresAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        })}.`
      );
      setOtpCooldowns((current) => ({ ...current, [kind]: 60 }));
      showToast("Verification code sent to WhatsApp.");
    } catch (otpError) {
      const message = otpError instanceof Error ? otpError.message : "Could not send OTP";
      setError(message);
      showToast(message);
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await apiPost<{
        registered: true;
        challengeToken: string;
        pinSetupRequired: true;
        user: AuthResult["user"];
      }>("/api/auth/register", registerForm);

      if (registerCountry) {
        rememberCountryUsage(registerCountry.iso2);
      }

      clearStoredToken();
      clearStoredUser();
      clearStoredPendingAuth();
      setStoredPendingAuth({
        challengeToken: result.challengeToken,
        pinMode: "setup",
        user: result.user,
        redirectTo
      });
      showToast("Number verified. Create your PIN inside the app.");
      router.push(redirectTo as Route);
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : "Registration failed";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await apiPost<{
        authenticated: false;
        challengeToken: string;
        pinRequired: boolean;
        pinSetupRequired: boolean;
        user: AuthResult["user"];
      }>("/api/auth/login", loginForm);

      if (loginCountry) {
        rememberCountryUsage(loginCountry.iso2);
      }

      clearStoredToken();
      clearStoredUser();
      clearStoredPendingAuth();
      setStoredPendingAuth({
        challengeToken: result.challengeToken,
        pinMode: result.pinRequired ? "verify" : "setup",
        user: result.user,
        redirectTo
      });
      showToast(result.pinRequired ? "OTP confirmed. Unlock the app with your PIN." : "OTP confirmed. Create your PIN inside the app.");
      router.push(redirectTo as Route);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <SiteHeader />

      <section className="auth-layout">
        <aside className="auth-panel auth-panel--lead">
          <span className="hero-kicker">Access your transfer desk</span>
          <h1>{mode === "register" ? "Create a TrustLink identity." : "Sign in and continue sending."}</h1>
          <p>
            Registration starts with WhatsApp OTP. Sign-in also starts with WhatsApp OTP. After that, TrustLink opens
            the app and asks for the transaction PIN inside the secure app shell before anything becomes usable.
          </p>

          <div className="auth-panel--form">
            <div className="auth-switch">
              <button
                className={mode === "login" ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setMode("login");
                  router.replace(`/auth?mode=login&redirect=${encodeURIComponent(redirectTo)}`);
                }}
              >
                Sign in
              </button>
              <button
                className={mode === "register" ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setMode("register");
                  router.replace(`/auth?mode=register&redirect=${encodeURIComponent(redirectTo)}`);
                }}
              >
                Sign up
              </button>
            </div>

            {message ? <div className="notice notice--success">{message}</div> : null}
            {error ? <div className="notice notice--error">{error}</div> : null}

            {mode === "register" ? (
              <form className="stack-form" onSubmit={handleRegister}>
                <PhoneNumberInput
                  label="WhatsApp number"
                  value={registerForm.phoneNumber}
                  onChange={(value, country) => {
                    setRegisterForm((current) => ({ ...current, phoneNumber: value }));
                    setRegisterCountry(country);
                  }}
                />
                <label className="field-block">
                  <span>Display name</span>
                  <input
                    value={registerForm.displayName}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="Daniel Trust"
                  />
                </label>
                <label className="field-block">
                  <span>Handle</span>
                  <input
                    value={registerForm.handle}
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, handle: event.target.value.toLowerCase() }))
                    }
                    placeholder="daniel_trust"
                  />
                </label>
                <label className="field-block">
                  <span>Verification code</span>
                  <input
                    value={registerForm.otp}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, otp: event.target.value }))}
                    placeholder="6-digit code"
                  />
                </label>
                <div className="inline-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={otpBusy || otpCooldowns.register > 0}
                    onClick={() => void sendOtp("register")}
                  >
                    {otpCooldowns.register > 0 ? `Resend OTP in ${otpCooldowns.register}s` : "Send OTP"}
                  </button>
                  <button className="button button--primary" type="submit" disabled={busy}>
                    Create account
                  </button>
                </div>
              </form>
            ) : (
              <form className="stack-form" onSubmit={handleLogin}>
                <PhoneNumberInput
                  label="WhatsApp number"
                  value={loginForm.phoneNumber}
                  onChange={(value, country) => {
                    setLoginForm((current) => ({ ...current, phoneNumber: value }));
                    setLoginCountry(country);
                  }}
                />
                <label className="field-block">
                  <span>Verification code</span>
                  <input
                    value={loginForm.otp}
                    onChange={(event) => setLoginForm((current) => ({ ...current, otp: event.target.value }))}
                    placeholder="6-digit code"
                  />
                </label>
                <div className="inline-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={otpBusy || otpCooldowns.login > 0}
                    onClick={() => void sendOtp("login")}
                  >
                    {otpCooldowns.login > 0 ? `Resend OTP in ${otpCooldowns.login}s` : "Send OTP"}
                  </button>
                  <button className="button button--primary" type="submit" disabled={busy}>
                    Sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        </aside>

        <section className="auth-points">
          <div>
            <strong>Wallet-led sending</strong>
            <span>The sender wallet comes from a connected Solana wallet, not a loose text field.</span>
          </div>
          <div>
            <strong>OTP first, PIN inside the app</strong>
            <span>OTP confirms the WhatsApp number. The PIN appears only after the app opens, as a blocking in-app security step.</span>
          </div>
          <div>
            <strong>Claim-safe flow</strong>
            <span>Claim uses the signed-in account. The receiver number is never typed again on the claim screen.</span>
          </div>
        </section>
      </section>
    </main>
  );
}
