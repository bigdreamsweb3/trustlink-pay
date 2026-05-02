"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { WhatsAppWhiteIcon } from "@/src/components/whatsapp-icon";
import type { Route } from "next";

import { QRCodeDisplay } from "@/src/components/qr-code-display";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import { detectDevice, generateWhatsAppUrl, generateQRCodeData, shouldUseQRCode, shouldUseDirectLink } from "@/src/lib/device-detection";
import { SessionEventManager, type SessionVerificationResult } from "@/src/lib/session-events";
import {
  clearStoredPendingAuth,
  clearStoredPendingSession,
  clearStoredToken,
  clearStoredUser,
  getStoredPendingSession,
  setStoredPendingAuth,
  setStoredPendingSession,
  setStoredToken,
  setStoredUser,
} from "@/src/lib/storage";

/* ─── Inline icons ─── */
function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
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

const SESSION_QUERY_PARAM = "session";

function formatSessionDevice(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("safari/") && !ua.includes("chrome/")
        ? "Safari"
        : ua.includes("firefox/")
          ? "Firefox"
          : "Browser";

  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("android")
      ? "Android"
      : ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")
        ? "iOS"
        : ua.includes("mac os")
          ? "macOS"
          : "Device";

  return `${browser} on ${os}`;
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

  const deviceInfo = useMemo(() => detectDevice(), []);
  const useQRCode = useMemo(() => shouldUseQRCode(deviceInfo), [deviceInfo]);
  const useDirectLink = useMemo(() => shouldUseDirectLink(deviceInfo), [deviceInfo]);

  const businessNumber = process.env.NEXT_PUBLIC_TRUSTLINK_BUSINESS_NUMBER || "+1234567890";

  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    if (token && user) { router.replace(redirectTo as Route); }
  }, [redirectTo, router]);

  useEffect(() => {
    const restorePendingSession = async () => {
      const storedSession = getStoredPendingSession();
      if (!storedSession) {
        return;
      }

      if (new Date(storedSession.expiresAt).getTime() <= Date.now()) {
        clearStoredPendingSession();
        clearSessionQueryParam();
        return;
      }

      const url = new URL(window.location.href);
      const sessionFromUrl = url.searchParams.get(SESSION_QUERY_PARAM);
      if (sessionFromUrl && sessionFromUrl !== storedSession.sessionId) {
        return;
      }

      setSessionData(storedSession);
      setFlowState("waiting_verification");
      setError(null);
      setMessage(null);
      setShowManualWhatsAppButton(true);
      setWhatsappPopupStatus("opened");
      setSessionQueryParam(storedSession.sessionId);
      startEventListening(storedSession);
    };

    void restorePendingSession();
  }, []);

  useEffect(() => { return () => { if (eventManager) eventManager.stop(); }; }, [eventManager]);
  useEffect(() => { if (flowState !== "waiting_verification" && eventManager) { eventManager.stop(); setEventManager(null); } }, [flowState, eventManager]);

  useEffect(() => {
    if (!sessionData?.expiresAt) return;
    const timer = setInterval(() => { setTimeRemaining(formatTimeRemaining(sessionData.expiresAt)); }, 1000);
    return () => clearInterval(timer);
  }, [sessionData]);

  function setSessionQueryParam(sessionId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(SESSION_QUERY_PARAM, sessionId);
    window.history.replaceState({}, "", url.toString());
  }

  function clearSessionQueryParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete(SESSION_QUERY_PARAM);
    window.history.replaceState({}, "", url.toString());
  }

  function persistPendingSession(session: SessionData) {
    setStoredPendingSession(session);
    setSessionQueryParam(session.sessionId);
  }

  function clearPendingSessionState() {
    clearStoredPendingSession();
    clearSessionQueryParam();
  }

  function openWhatsApp(session: SessionData, preferNewTab = false) {
    const whatsappUrl = generateWhatsAppUrl(businessNumber, session.sessionCode);
    setWhatsappPopupStatus("opened");

    if (preferNewTab) {
      const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      if (popup) {
        return;
      }
    }

    window.location.href = whatsappUrl;
  }

  async function generateSession() {
    if (flowState === "generating_session" || flowState === "waiting_verification") return;
    setFlowState("generating_session");
    setError(null);
    setMessage(null);
    try {
      const sessionId = crypto.randomUUID();
      const response = await apiPost<{ success: boolean; sessionCode: string; expiresAt: string }>("/api/auth/session", {
        sessionId,
        device: formatSessionDevice(deviceInfo.userAgent),
        location: "Unavailable",
        requestedAt: new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
      });
      if (!response.success) throw new Error("Failed to generate session code");
      const newSessionData: SessionData = { sessionId, sessionCode: response.sessionCode, expiresAt: response.expiresAt };
      setSessionData(newSessionData);
      persistPendingSession(newSessionData);
      setFlowState("waiting_verification");
      startEventListening(newSessionData);
      if (deviceInfo.isMobile && deviceInfo.hasWhatsAppApp) {
        setWhatsappPopupStatus("opening");
        setTimeout(() => { openWhatsApp(newSessionData, true); }, 500);
        setTimeout(() => { setShowManualWhatsAppButton(true); }, 3000);
      }
      showToast("Session code generated. Verify via WhatsApp.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate session";
      let displayError = errorMessage;
      if (deviceInfo.isMobile && errorMessage.includes("fetch")) { displayError = "Connection issue. Please check your network and try again."; }
      setError(displayError);
      setFlowState("error");
      showToast(displayError);
    }
  }

  function startEventListening(session: SessionData) {
    const manager = new SessionEventManager(session.sessionId, session.sessionCode, handleVerificationSuccess, handleVerificationError, (connected) => setConnectionStatus(connected ? "connected" : "disconnected"));
    manager.start();
    setEventManager(manager);
    setConnectionStatus("connecting");
  }

  function handleVerificationSuccess(result: SessionVerificationResult) {
    setFlowState("verified");
    setMessage("Verification successful! Redirecting...");
    const completeUser = { id: result.user!.id, displayName: result.user!.displayName, phoneNumber: result.user!.phoneNumber, handle: "", walletAddress: null, phoneVerifiedAt: new Date().toISOString(), identityVerifiedAt: null, createdAt: new Date().toISOString() };
    setStoredToken(result.challengeToken!);
    setStoredUser(completeUser);
    clearStoredPendingAuth();
    clearPendingSessionState();
    setStoredPendingAuth({ challengeToken: result.challengeToken!, pinMode: result.stage === "pin_verify" ? "verify" : "setup", user: completeUser, redirectTo });
    showToast("Verification successful!");
    setTimeout(() => router.push(redirectTo as Route), 1000);
  }

  function handleVerificationError(error: string) {
    if (error !== "Session not yet verified") {
      clearPendingSessionState();
      setError(error);
      showToast(error);
    }
    if (eventManager) eventManager.stop();
  }

  function handleWhatsAppClick() {
    if (!sessionData) return;
    openWhatsApp(sessionData, true);
  }

  function copySessionCode() {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.sessionCode).then(() => { showToast("Session code copied!"); }).catch(() => { showToast("Failed to copy session code"); });
  }

  function formatTimeRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) {
      clearPendingSessionState();
      return "Expired";
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function handleStartOver() {
    if (eventManager) eventManager.stop();
    clearPendingSessionState();
    setEventManager(null); setSessionData(null); setFlowState("idle"); setError(null); setMessage(null); setConnectionStatus("disconnected"); setShowManualWhatsAppButton(false);
  }

  async function handleManualVerification() {
    if (!sessionData) return;
    try {
      const response = await apiPost<{ success: boolean; challengeToken?: string; user?: { id: string; displayName: string; phoneNumber: string }; stage: "pin_verify" | "pin_setup"; error?: string }>("/api/auth/session/manual-verify", { sessionCode: sessionData.sessionCode });
      if (response.success) handleVerificationSuccess(response);
      else showToast(response.error || "Manual verification failed");
    } catch (error) { showToast("Manual verification error: " + (error instanceof Error ? error.message : "Unknown error")); }
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER — CodeWords-style layout:
     Full-page dark bg with grid overlay → centered logo →
     heading + subtitle → auth buttons → footer pinned bottom
     ═══════════════════════════════════════════════════════════ */
  return (
    <main className="tl-grid-overlay relative flex min-h-[100dvh] flex-col items-center justify-between overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Content: centered vertically ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 w-full max-w-[440px]">

        {/* ─── IDLE STATE ─── */}
        {flowState === "idle" && (
          <div className="flex flex-col items-center w-full" style={{ animation: "fadeIn 0.4s var(--ease-out-expo)" }}>
            {/* Logo */}
            <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-white/[0.03] p-2.5 backdrop-blur-sm border border-[var(--surface-border)]">
              <Image src="/trustlink-logo.png" alt="TrustLink Logo" width={80} height={80} className="h-full w-full object-contain" />
            </div>

            {/* Heading */}
            <h1 className="text-[1.45rem] font-bold tracking-[-0.04em] text-center" style={{ color: "var(--text)" }}>
              Sign in to TrustLink Pay
            </h1>
            <p className="mt-2 text-[0.84rem] text-center" style={{ color: "var(--muted)" }}>
              Secure crypto payments, simplified.
            </p>

            {/* Error */}
            {error && (
              <div className="mt-5 w-full rounded-[14px] px-4 py-3 text-[0.8rem]"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--accent-border)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            {/* Auth buttons */}
            <div className="mt-8 w-full space-y-3">
              <button
                type="button"
                onClick={() => void generateSession()}
                className="group flex w-full items-center justify-center gap-3 rounded-[16px] px-5 py-4 text-[0.92rem] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
                style={{ background: "var(--panel)", color: "var(--text)" }}
              >
                <WhatsAppWhiteIcon className="h-5 w-5 text-[#25D366]" />
                Continue with WhatsApp
              </button>

              <button
                type="button"
                onClick={() => showToast("Web3 Wallet support coming soon!")}
                className="group flex w-full items-center justify-center gap-3 rounded-[16px] px-5 py-4 text-[0.92rem] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
                style={{ background: "var(--panel)", color: "var(--text)" }}
              >
                <WalletIcon className="h-5 w-5 text-[var(--accent)]" />
                Continue with Web3 Wallet
              </button>
            </div>
          </div>
        )}

        {/* ─── GENERATING STATE ─── */}
        {flowState === "generating_session" && (
          <div className="flex flex-col items-center justify-center" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
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
          <div className="w-full space-y-5" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            {/* Back + title */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleStartOver}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors active:scale-[0.93] cursor-pointer"
                style={{ background: "var(--surface-soft)", color: "var(--text-soft)" }}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-[1rem] font-bold tracking-[-0.02em]" style={{ color: "var(--text)" }}>Verify via WhatsApp</h2>
                <p className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>Send this code to our verified business number</p>
              </div>
            </div>

            {/* Session code */}
            <div className="rounded-[20px] p-5 text-center"
              style={{ background: "var(--field-strong)", border: "1px solid var(--field-border)" }}
            >
              <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-faint)" }}>Verification Code</div>
              <div className="my-2.5 font-mono text-[1.8rem] font-bold tracking-[0.12em]" style={{ color: "var(--accent)" }}>{sessionData.sessionCode}</div>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={copySessionCode}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition-colors active:scale-[0.95] cursor-pointer"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
                >
                  <CopySmIcon className="h-3 w-3" />Copy
                </button>
                {timeRemaining && (
                  <span className="flex items-center gap-1 text-[0.68rem] font-medium" style={{ color: "var(--text-faint)" }}>
                    <ClockIcon className="h-3 w-3" />{timeRemaining}
                  </span>
                )}
              </div>
            </div>

            {/* QR Code — desktop */}
            {useQRCode && (
              <div className="rounded-[18px] p-4 text-center" style={{ background: "var(--surface-soft)", border: "1px solid var(--surface-border)" }}>
                <p className="mb-3 text-[0.72rem] font-medium" style={{ color: "var(--text-soft)" }}>Scan with your phone camera</p>
                <div className="mx-auto inline-flex rounded-[14px] bg-white p-3">
                  <QRCodeDisplay value={generateQRCodeData(businessNumber, sessionData.sessionCode)} size={180} logoUrl="/brand-logos/trustlink.svg" />
                </div>
                <p className="mt-3 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  Or send code to <span className="font-semibold text-[var(--accent)]">{businessNumber}</span>
                </p>
              </div>
            )}

            {/* WhatsApp button — mobile */}
            {useDirectLink && (showManualWhatsAppButton || !deviceInfo.isMobile) && (
              <button type="button" onClick={handleWhatsAppClick}
                className="group flex w-full items-center justify-center gap-2.5 rounded-[16px] px-5 py-4 text-[0.88rem] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
                style={{ background: "var(--panel)", color: "var(--text)" }}
              >
                <WhatsAppWhiteIcon className="h-5 w-5 text-[#25D366]" />
                {deviceInfo.isMobile ? "Open WhatsApp Manually" : "Open WhatsApp to Verify"}
              </button>
            )}

            {/* Mobile WhatsApp auto-open status */}
            {useDirectLink && deviceInfo.isMobile && !showManualWhatsAppButton && (
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--accent)] border-t-transparent" />
                <span className="text-[0.78rem]" style={{ color: "var(--text-soft)" }}>Opening WhatsApp…</span>
              </div>
            )}

            {/* Connection status */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="relative flex h-2 w-2">
                {connectionStatus === "connected" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: "var(--accent)" }} />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: connectionStatus === "connected" ? "var(--accent)" : connectionStatus === "connecting" ? "var(--warning)" : "var(--danger)" }}
                />
              </span>
              <span className="text-[0.68rem] font-medium" style={{ color: "var(--text-faint)" }}>
                {connectionStatus === "connected" ? "Listening for verification…" : connectionStatus === "connecting" ? "Connecting…" : "Reconnecting…"}
              </span>
            </div>

            {process.env.NODE_ENV === "development" && (
              <button type="button" onClick={handleManualVerification} className="mx-auto block rounded-md px-2 py-1 text-[0.64rem] font-medium" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Debug: Manual Verify</button>
            )}
          </div>
        )}

        {/* ─── VERIFIED STATE ─── */}
        {flowState === "verified" && (
          <div className="flex flex-col items-center justify-center" style={{ animation: "scaleIn 0.4s var(--ease-out-expo)" }}>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
              <CheckCircleIcon className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-[1.05rem] font-bold tracking-[-0.02em]" style={{ color: "var(--text)" }}>Verified!</h3>
            <p className="mt-1 text-[0.78rem]" style={{ color: "var(--muted)" }}>Redirecting to your dashboard…</p>
          </div>
        )}

        {/* ─── ERROR STATE ─── */}
        {flowState === "error" && (
          <div className="flex flex-col items-center w-full" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--danger-soft)" }}>
              <span className="text-xl" style={{ color: "var(--danger)" }}>!</span>
            </div>
            <h3 className="text-[1rem] font-bold" style={{ color: "var(--text)" }}>Something went wrong</h3>
            {error && <p className="mt-2 text-[0.78rem] text-center" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="button" onClick={handleStartOver}
              className="mt-6 flex w-full max-w-[280px] items-center justify-center gap-2 rounded-[16px] px-5 py-4 text-[0.88rem] font-semibold transition-all active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
              style={{ background: "var(--panel)", color: "var(--text)" }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* ── Footer — pinned to bottom ── */}
      <footer className="relative z-20 w-full px-6 py-5">
        <div className="flex flex-wrap items-center justify-center gap-6 text-[0.7rem] font-medium" style={{ color: "var(--text-faint)" }}>
          <Link href={"/privacy" as Route} className="transition-colors hover:text-[var(--text-soft)]">Privacy Policy</Link>
          <Link href={"/terms" as Route} className="transition-colors hover:text-[var(--text-soft)]">Terms</Link>
          <Link href={"/support" as Route} className="transition-colors hover:text-[var(--text-soft)]">Support</Link>
        </div>
      </footer>
    </main>
  );
}
