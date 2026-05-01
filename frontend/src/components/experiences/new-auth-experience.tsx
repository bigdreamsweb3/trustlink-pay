"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { WhatsAppWhiteIcon } from "@/src/components/whatsapp-icon";
import { WhatsAppIframe } from "@/src/components/whatsapp-iframe";
import type { Route } from "next";

import { QRCodeDisplay } from "@/src/components/qr-code-display";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import { detectDevice, generateWhatsAppUrl, generateQRCodeData, shouldUseQRCode, shouldUseDirectLink } from "@/src/lib/device-detection";
import { SessionEventManager, type SessionVerificationResult } from "@/src/lib/session-events";
import {
  clearStoredPendingAuth,
  clearStoredToken,
  clearStoredUser,
  setStoredPendingAuth,
  setStoredToken,
  setStoredUser,
} from "@/src/lib/storage";


/* ─── Shield icon for trust badges ─── */
function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ZapIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CopySmIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

/* ─── Types ─── */
type AuthFlowState = "idle" | "generating_session" | "waiting_verification" | "verified" | "error";

interface SessionData {
  sessionId: string;
  sessionCode: string;
  expiresAt: string;
}

/* ─── Component ─── */
export function NewAuthExperience({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [flowState, setFlowState] = useState<AuthFlowState>("idle");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [eventManager, setEventManager] = useState<SessionEventManager | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [showManualWhatsAppButton, setShowManualWhatsAppButton] = useState(false);
  const [whatsappPopupStatus, setWhatsappPopupStatus] = useState<"opening" | "opened" | "closed" | "desktop_app">("opening");
  const [showWhatsAppIframe, setShowWhatsAppIframe] = useState(false);
  const [whatsappIframeStatus, setWhatsappIframeStatus] = useState<"opening" | "opened" | "closed" | "error">("opening");

  const deviceInfo = useMemo(() => detectDevice(), []);
  const useQRCode = useMemo(() => shouldUseQRCode(deviceInfo), [deviceInfo]);
  const useDirectLink = useMemo(() => shouldUseDirectLink(deviceInfo), [deviceInfo]);

  const businessNumber = process.env.NEXT_PUBLIC_TRUSTLINK_BUSINESS_NUMBER || "+1234567890";

  /* ─── Redirect if already logged in ─── */
  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    if (token && user) {
      router.replace(redirectTo as Route);
    }
  }, [redirectTo, router]);

  /* ─── Cleanup event manager ─── */
  useEffect(() => {
    return () => { if (eventManager) eventManager.stop(); };
  }, [eventManager]);

  useEffect(() => {
    if (flowState !== "waiting_verification" && eventManager) {
      eventManager.stop();
      setEventManager(null);
    }
  }, [flowState, eventManager]);

  /* ─── Timer ─── */
  useEffect(() => {
    if (!sessionData?.expiresAt) return;
    const timer = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(sessionData.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionData]);

  /* ─── Session generation ─── */
  async function generateSession() {
    if (flowState === "generating_session" || flowState === "waiting_verification") return;

    setFlowState("generating_session");
    setError(null);
    setMessage(null);

    try {
      const sessionId = crypto.randomUUID();

      const response = await apiPost<{
        success: boolean;
        sessionCode: string;
        expiresAt: string;
      }>("/api/auth/session", { sessionId });

      if (!response.success) throw new Error("Failed to generate session code");

      const newSessionData: SessionData = {
        sessionId,
        sessionCode: response.sessionCode,
        expiresAt: response.expiresAt,
      };

      setSessionData(newSessionData);
      setFlowState("waiting_verification");
      startEventListening(newSessionData);

      // Auto-open WhatsApp popup with better error handling
      if (deviceInfo.isMobile && deviceInfo.hasWhatsAppApp) {
        const whatsappUrl = generateWhatsAppUrl(businessNumber, newSessionData.sessionCode);
        setWhatsappPopupStatus("opening");

        // Open WhatsApp in same tab for better UX
        setTimeout(() => {
          setWhatsappPopupStatus("opened");
          window.location.href = whatsappUrl;
        }, 500);

        // Show manual button as fallback after 3 seconds
        setTimeout(() => {
          setShowManualWhatsAppButton(true);
        }, 3000);
      }

      showToast("Session code generated. Verify via WhatsApp.");
    } catch (error) {
      // Enhanced error logging for mobile
      const errorMessage = error instanceof Error ? error.message : "Failed to generate session";

      let displayError = errorMessage;
      if (deviceInfo.isMobile && errorMessage.includes("fetch")) {
        displayError = "Connection issue. Please check both servers are running and try again.";
      }

      setError(displayError);
      setFlowState("error");
      showToast(displayError);
    }
  }

  /* ─── Event listening ─── */
  function startEventListening(session: SessionData) {
    const manager = new SessionEventManager(
      session.sessionId,
      session.sessionCode,
      handleVerificationSuccess,
      handleVerificationError,
      (connected) => setConnectionStatus(connected ? "connected" : "disconnected"),
    );
    manager.start();
    setEventManager(manager);
    setConnectionStatus("connecting");
  }

  function handleVerificationSuccess(result: SessionVerificationResult) {
    setFlowState("verified");
    setMessage("Verification successful! Redirecting...");

    // Store the authentication token and user data
    const completeUser = {
      id: result.user!.id,
      displayName: result.user!.displayName,
      phoneNumber: result.user!.phoneNumber,
      handle: "",
      walletAddress: null,
      phoneVerifiedAt: new Date().toISOString(),
      identityVerifiedAt: null,
      createdAt: new Date().toISOString(),
    };

    setStoredToken(result.challengeToken!);
    setStoredUser(completeUser);
    clearStoredPendingAuth();

    setStoredPendingAuth({
      challengeToken: result.challengeToken!,
      pinMode: result.stage === "pin_verify" ? "verify" : "setup",
      user: completeUser,
      redirectTo,
    });

    showToast("Verification successful!");
    setTimeout(() => router.push(redirectTo as Route), 1000);
  }

  function handleVerificationError(error: string) {
    if (error !== "Session not yet verified") {
      setError(error);
      showToast(error);
    }
    if (eventManager) eventManager.stop();
  }

  function handleWhatsAppClick() {
    if (!sessionData) return;
    const whatsappUrl = generateWhatsAppUrl(businessNumber, sessionData.sessionCode);
    setWhatsappPopupStatus("opening");

    // Open WhatsApp in same tab
    setWhatsappPopupStatus("opened");
    window.location.href = whatsappUrl;
  }

  function copySessionCode() {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.sessionCode).then(() => {
      showToast("Session code copied!");
    }).catch(() => {
      showToast("Failed to copy session code");
    });
  }

  function handleWhatsAppIframeStatus(status: "opening" | "opened" | "closed" | "error") {
    setWhatsappIframeStatus(status);
  }

  function handleWhatsAppIframeClose() {
    setShowWhatsAppIframe(false);
    setWhatsappIframeStatus("closed");
  }

  function formatTimeRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function handleStartOver() {
    if (eventManager) eventManager.stop();
    setEventManager(null);
    setSessionData(null);
    setFlowState("idle");
    setError(null);
    setMessage(null);
    setConnectionStatus("disconnected");
  }

  async function handleManualVerification() {
    if (!sessionData) return;

    try {
      const response = await apiPost<{
        success: boolean;
        challengeToken?: string;
        user?: { id: string; displayName: string; phoneNumber: string };
        stage: "pin_verify" | "pin_setup";
        error?: string;
      }>("/api/auth/session/manual-verify", {
        sessionCode: sessionData.sessionCode,
      });

      if (response.success) {
        handleVerificationSuccess(response);
      } else {
        showToast(response.error || "Manual verification failed");
      }
    } catch (error) {
      showToast("Manual verification error: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-10"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Subtle ambient glow ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[12%] h-[320px] w-[320px] -translate-x-1/2 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Logo + tagline ── */}
      <div className="relative z-10 mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/5 p-2 backdrop-blur-sm">
          <Image
            src="/trustlink-logo.png"
            alt="TrustLink Logo"
            width={64}
            height={64}
            className="h-full w-full object-contain"
          />
        </div>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          TrustLink Pay
        </h1>
        <p className="mt-1 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Secure crypto payments, simplified
        </p>
      </div>

      {/* ── Auth Actions ── */}
      <div className="relative z-10 w-full max-w-[420px]">
        {/* ─── IDLE STATE ─── */}
        {flowState === "idle" && (
          <div className="space-y-8" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            {/* Error display */}
            {error && (
              <div className="rounded-[14px] px-4 py-3 text-[0.8rem]"
                style={{ background: "var(--danger-soft)", border: "1px solid rgba(217, 80, 80, 0.12)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            {/* WhatsApp Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void generateSession()}
                className="group flex w-full items-center justify-center gap-3 rounded-[20px] px-6 py-4 text-[0.95rem] font-bold transition-all duration-200 active:scale-[0.97] cursor-pointer"
                style={{
                  background: "#25D366",
                  color: "#ffffff",
                }}
              >
                <WhatsAppWhiteIcon className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
                Verify via WhatsApp
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 px-2 opacity-50">
              <div className="h-px flex-1 bg-[var(--surface-border)]" />
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]">OR</span>
              <div className="h-px flex-1 bg-[var(--surface-border)]" />
            </div>

            {/* Web3 Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  showToast("Web3 Wallet support coming soon!");
                }}
                className="group flex w-full items-center justify-center gap-3 rounded-[20px] px-6 py-4 text-[0.95rem] font-bold transition-all duration-200 active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]"
                style={{
                  background: "var(--panel)",
                  color: "var(--text)",
                }}
              >
                <WalletIcon className="h-6 w-6 text-[var(--accent)] transition-transform duration-200 group-hover:scale-110" />
                Sign in via Web3 Wallet
              </button>
            </div>
          </div>
        )}

        {/* ─── GENERATING STATE ─── */}
        {flowState === "generating_session" && (
          <div className="flex flex-col items-center justify-center py-12 rounded-3xl border bg-[var(--panel)] border-[var(--surface-border)]" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-transparent"
              style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent-border)" }}
            />
            <p className="text-[0.84rem] font-medium" style={{ color: "var(--text-soft)" }}>
              Generating secure session…
            </p>
          </div>
        )}

        {/* ─── WAITING VERIFICATION STATE ─── */}
        {flowState === "waiting_verification" && sessionData && (
          <div className="space-y-5 p-6 rounded-3xl border bg-[var(--panel)] border-[var(--surface-border)] shadow-xl" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            {/* Back + title row */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleStartOver}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors active:scale-[0.93] cursor-pointer"
                style={{ background: "var(--surface-soft)", color: "var(--text-soft)" }}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-[1rem] font-bold tracking-[-0.02em]" style={{ color: "var(--text)" }}>
                  Secure Verification
                </h2>
                <p className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  Send this code to our verified business number
                </p>
              </div>
            </div>

            {/* Session code display */}
            <div className="rounded-[20px] p-5 text-center"
              style={{
                background: "var(--field-strong)",
                border: "1px solid var(--field-border)",
              }}
            >
              <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-faint)" }}>
                Verification Code
              </div>
              <div className="my-2.5 font-mono text-[1.8rem] font-bold tracking-[0.12em]" style={{ color: "var(--accent)" }}>
                {sessionData.sessionCode}
              </div>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={copySessionCode}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition-colors active:scale-[0.95] cursor-pointer"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
                >
                  <CopySmIcon className="h-3 w-3" />
                  Copy
                </button>
                {timeRemaining && (
                  <span className="flex items-center gap-1 text-[0.68rem] font-medium" style={{ color: "var(--text-faint)" }}>
                    <ClockIcon className="h-3 w-3" />
                    {timeRemaining}
                  </span>
                )}
              </div>
            </div>

            {/* QR Code for desktop */}
            {useQRCode && (
              <div className="rounded-[18px] p-4 text-center"
                style={{ background: "var(--surface-soft)", border: "1px solid var(--surface-border)" }}
              >
                <p className="mb-3 text-[0.72rem] font-medium" style={{ color: "var(--text-soft)" }}>
                  Scan with your phone camera
                </p>
                <div className="mx-auto inline-flex rounded-[14px] bg-white p-3">
                  <QRCodeDisplay
                    value={generateQRCodeData(businessNumber, sessionData.sessionCode)}
                    size={180}
                    logoUrl="/brand-logos/trustlink.svg"
                  />
                </div>
                <p className="mt-3 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  Or send code to <span className="font-semibold text-[var(--accent)]">{businessNumber}</span>
                </p>
              </div>
            )}

            {/* WhatsApp direct link for mobile */}
            {useDirectLink && (showManualWhatsAppButton || !deviceInfo.isMobile) && (
              <button
                type="button"
                onClick={handleWhatsAppClick}
                className="group flex w-full items-center justify-center gap-2.5 rounded-[18px] px-5 py-3.5 text-[0.88rem] font-semibold tracking-[-0.01em] transition-all duration-200 active:scale-[0.97] cursor-pointer"
                style={{
                  background: "#25D366",
                  color: "#ffffff",
                }}
              >
                <WhatsAppWhiteIcon className="h-5 w-5" />
                {deviceInfo.isMobile ? "Open WhatsApp Manually" : "Verify via WhatsApp"}
              </button>
            )}

            {/* WhatsApp status indicator */}
            {useDirectLink && deviceInfo.isMobile && !showManualWhatsAppButton && (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="flex items-center justify-center gap-2">
                  {whatsappPopupStatus === "opening" && (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent"></div>
                      <span className="text-[0.8rem]" style={{ color: "var(--text-soft)" }}>
                        Opening WhatsApp...
                      </span>
                    </>
                  )}
                  {whatsappPopupStatus === "opened" && (
                    <>
                      <div className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircleIcon className="h-2.5 w-2.5 text-white" />
                      </div>
                      <span className="text-[0.8rem]" style={{ color: "var(--text-soft)" }}>
                        WhatsApp opened - Send verification message
                      </span>
                    </>
                  )}
                  {whatsappPopupStatus === "closed" && (
                    <>
                      <div className="h-4 w-4 rounded-full bg-orange-500 flex items-center justify-center">
                        <span className="text-white text-xs">!</span>
                      </div>
                      <span className="text-[0.8rem]" style={{ color: "var(--text-soft)" }}>
                        WhatsApp closed - Use button below to reopen
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Waiting indicator */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  {connectionStatus === "connected" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: "var(--accent)" }} />
                  )}
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full"
                    style={{
                      background: connectionStatus === "connected" ? "var(--accent)"
                        : connectionStatus === "connecting" ? "var(--warning)"
                          : "var(--danger)",
                    }}
                  />
                </span>
                <span className="text-[0.7rem] font-medium" style={{ color: "var(--text-faint)" }}>
                  {connectionStatus === "connected" ? "Listening for verification…"
                    : connectionStatus === "connecting" ? "Connecting…"
                      : "Reconnecting…"}
                </span>
              </div>
            </div>

            {/* Dev-only manual verify */}
            {process.env.NODE_ENV === "development" && (
              <button type="button" onClick={handleManualVerification}
                className="mx-auto block rounded-md px-2 py-1 text-[0.64rem] font-medium"
                style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
              >
                Debug: Manual Verify
              </button>
            )}
          </div>
        )}

        {/* ─── VERIFIED STATE ─── */}
        {flowState === "verified" && (
          <div className="flex flex-col items-center justify-center py-12 rounded-3xl border bg-[var(--panel)] border-[var(--surface-border)]" style={{ animation: "scaleIn 0.4s var(--ease-out-expo)" }}>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}
            >
              <CheckCircleIcon className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-[1.05rem] font-bold tracking-[-0.02em]" style={{ color: "var(--text)" }}>
              Verified!
            </h3>
            <p className="mt-1 text-[0.78rem]" style={{ color: "var(--muted)" }}>
              Redirecting to your dashboard…
            </p>
          </div>
        )}

        {/* ─── ERROR STATE ─── */}
        {flowState === "error" && (
          <div className="space-y-5 py-4 p-6 rounded-3xl border bg-[var(--panel)] border-[var(--surface-border)]" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "var(--danger-soft)" }}
              >
                <span className="text-xl" style={{ color: "var(--danger)" }}>!</span>
              </div>
              <h3 className="text-[1rem] font-bold" style={{ color: "var(--text)" }}>
                Something went wrong
              </h3>
              {error && (
                <p className="mt-2 text-[0.78rem]" style={{ color: "var(--danger)" }}>{error}</p>
              )}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleStartOver}
                className="flex w-full items-center justify-center gap-2 rounded-[18px] px-5 py-3.5 text-[0.88rem] font-semibold transition-all active:scale-[0.97] cursor-pointer"
                style={{
                  background: "var(--field)",
                  color: "var(--text)",
                  border: "1px solid var(--field-border)",
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-20 mt-10 w-full max-w-[420px] px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-6 text-[0.7rem] font-bold uppercase tracking-widest" style={{ color: "var(--text-soft)" }}>
            <Link href={"/privacy" as Route} className="transition-colors hover:text-[var(--accent)]">Privacy Policy</Link>
            <Link href={"/terms" as Route} className="transition-colors hover:text-[var(--accent)]">Terms of Service</Link>
            <Link href={"/support" as Route} className="transition-colors hover:text-[var(--accent)]">Support</Link>
          </div>
          <div className="text-[0.65rem] font-medium" style={{ color: "var(--text-faint)" }}>
            © 2024 TrustLink Labs. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}

