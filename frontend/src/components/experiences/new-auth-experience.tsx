"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { WhatsAppIcon, WhatsAppWhiteIcon, QRCodeDisplay, WhatsAppModal } from "@/src/lib/whatsapp";
import type { Route } from "next";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import {
  detectDevice,
  generateQRCodeData,
  shouldUseQRCode,
} from "@/src/lib/device-detection";
import {
  SessionEventManager,
  type SessionVerificationResult,
} from "@/src/lib/session-events";
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
function CopySmIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

/* ─── Types ─── */
type AuthFlowState =
  | "idle"
  | "generating_session"
  | "waiting_verification"
  | "verified"
  | "error";

interface SessionData {
  sessionId: string;
  sessionCode: string;
  expiresAt: string;
  businessNumber: string;
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
export function NewAuthExperience({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [flowState, setFlowState] = useState<AuthFlowState>("idle");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [eventManager, setEventManager] = useState<SessionEventManager | null>(
    null,
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const deviceInfo = useMemo(() => detectDevice(), []);
  const useQRCode = useMemo(() => shouldUseQRCode(deviceInfo), [deviceInfo]);
  const businessNumber = sessionData?.businessNumber ?? "";

  /* ── Auth check ── */
  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    if (token && user) {
      router.replace(redirectTo as Route);
    }
  }, [redirectTo, router]);

  /* ── Restore pending session ── */
  useEffect(() => {
    const restorePendingSession = async () => {
      const storedSession = getStoredPendingSession();
      if (!storedSession) return;
      if (!storedSession.businessNumber) {
        clearStoredPendingSession();
        clearSessionQueryParam();
        return;
      }
      if (new Date(storedSession.expiresAt).getTime() <= Date.now()) {
        clearStoredPendingSession();
        clearSessionQueryParam();
        return;
      }
      const url = new URL(window.location.href);
      const sessionFromUrl = url.searchParams.get(SESSION_QUERY_PARAM);
      if (sessionFromUrl && sessionFromUrl !== storedSession.sessionId) return;
      setSessionData(storedSession);
      setFlowState("waiting_verification");
      setError(null);
      setMessage(null);
      setSessionQueryParam(storedSession.sessionId);
      startEventListening(storedSession);
    };
    void restorePendingSession();
  }, []);

  useEffect(() => {
    return () => {
      if (eventManager) eventManager.stop();
    };
  }, [eventManager]);
  useEffect(() => {
    if (flowState !== "waiting_verification" && eventManager) {
      eventManager.stop();
      setEventManager(null);
    }
  }, [flowState, eventManager]);
  useEffect(() => {
    if (!sessionData?.expiresAt) return;
    const timer = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(sessionData.expiresAt));
    }, 1000);
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

  async function generateSession() {
    if (
      flowState === "generating_session" ||
      flowState === "waiting_verification"
    )
      return;
    setFlowState("generating_session");
    setError(null);
    setMessage(null);
    try {
      const sessionId = crypto.randomUUID();
      const response = await apiPost<{
        success: boolean;
        sessionCode: string;
        expiresAt: string;
        businessNumber: string;
      }>("/api/auth/session", {
        sessionId,
        device: formatSessionDevice(deviceInfo.userAgent),
        location: "Unavailable",
        requestedAt: new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
      });
      if (!response.success) throw new Error("Failed to generate session code");
      const newSessionData: SessionData = {
        sessionId,
        sessionCode: response.sessionCode,
        expiresAt: response.expiresAt,
        businessNumber: response.businessNumber,
      };
      setSessionData(newSessionData);
      persistPendingSession(newSessionData);
      setFlowState("waiting_verification");
      startEventListening(newSessionData);
      setShowWhatsAppModal(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate session";
      setError(
        deviceInfo.isMobile && errorMessage.includes("fetch")
          ? "Connection issue. Please check your network and try again."
          : errorMessage,
      );
      setFlowState("error");
    }
  }

  function startEventListening(session: SessionData) {
    const manager = new SessionEventManager(
      session.sessionId,
      session.sessionCode,
      handleVerificationSuccess,
      handleVerificationError,
      (connected) =>
        setConnectionStatus(connected ? "connected" : "disconnected"),
    );
    manager.start();
    setEventManager(manager);
    setConnectionStatus("connecting");
  }

  function handleVerificationSuccess(result: SessionVerificationResult) {
    setFlowState("verified");
    setMessage("Verification successful! Redirecting...");
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
    clearPendingSessionState();
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
      clearPendingSessionState();
      setError(error);
      showToast(error);
    }
    if (eventManager) eventManager.stop();
  }

  function copySessionCode() {
    if (!sessionData) return;
    navigator.clipboard
      .writeText(sessionData.sessionCode)
      .then(() => {
        showToast("Session code copied!");
      })
      .catch(() => {
        showToast("Failed to copy session code");
      });
  }

  function copyBusinessNumber() {
    navigator.clipboard
      .writeText(businessNumber)
      .then(() => {
        showToast("WhatsApp number copied!");
      })
      .catch(() => {
        showToast("Failed to copy WhatsApp number");
      });
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
    setEventManager(null);
    setSessionData(null);
    setFlowState("idle");
    setError(null);
    setMessage(null);
    setConnectionStatus("disconnected");
    setShowWhatsAppModal(false);
  }

  function handleBackToTrustLink() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/" as Route);
  }

  // style={{ background: "var(--bg)" }}

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <main className="tl-grid-overlay relative flex min-h-dvh flex-col items-center justify-between overflow-hidden">
      <div className="w-full px-5 pt-5">
        <button
          type="button"
          onClick={handleBackToTrustLink}
          className="inline-flex items-center gap-2 rounded-[14px] border border-field-border bg-field px-4 py-2 tl-body-sm font-bold text-text-soft transition hover:text-(--text) cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to TrustLink Pay
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 w-full max-w-110">
        {/* ─── IDLE ─── */}
        {flowState === "idle" && (
          <div
            className="flex flex-col items-center w-full"
            style={{ animation: "fadeIn 0.4s var(--ease-out-expo)" }}
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-white/[0.03] p-2.5 backdrop-blur-sm border border-[var(--surface-border)]">
              <Image
                src="/trustlink-logo.svg"
                alt="TrustLink Logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </div>
            <h1
              className="text-[1.45rem] font-bold tracking-[-0.04em] text-center"
              style={{ color: "var(--text)" }}
            >
              Sign in to TrustLink Pay
            </h1>
            <p
              className="mt-2 tl-body-sm text-center"
              style={{ color: "var(--muted)" }}
            >
              Secure crypto payments, simplified.
            </p>
            {error && (
              <div
                className="mt-5 w-full rounded-[14px] px-4 py-3 text-[0.8rem]"
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}
            <div className="mt-8 w-full space-y-3">
              <button
                type="button"
                onClick={() => void generateSession()}
                className="group flex w-full items-center justify-center gap-3 rounded-[16px] px-5 py-4 text-[0.92rem] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
                style={{ background: "var(--panel)", color: "var(--text)" }}
              >
                <WhatsAppIcon className="h-5 w-5" />
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

        {/* ─── GENERATING ─── */}
        {flowState === "generating_session" && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}
          >
            <div
              className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-transparent"
              style={{
                borderTopColor: "var(--accent)",
                borderRightColor: "var(--accent-border)",
              }}
            />
            <p
              className="tl-body-sm font-medium"
              style={{ color: "var(--text-soft)" }}
            >
              Generating secure session…
            </p>
          </div>
        )}

        {/* ─── WAITING — Coinbase-style: centered, QR prominent ─── */}
        {flowState === "waiting_verification" && sessionData && (
          <div
            className="flex w-full flex-col items-center text-center"
            style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}
          >
            {/* Top label */}
            <p
              className="mb-6 text-[0.78rem] font-medium"
              style={{ color: "var(--text-soft)" }}
            >
              Verify with WhatsApp
            </p>

            {/* QR code — desktop primary, mobile hidden */}
            {useQRCode ? (
              <>
                <div className="rounded-[20px] bg-white p-4 shadow-softbox mb-5">
                  <QRCodeDisplay
                    value={generateQRCodeData(
                      businessNumber,
                      sessionData.sessionCode,
                    )}
                    size={240}
                    logoUrl="/trustlink-logo.svg"
                  />
                </div>
                <p
                  className="mb-2 text-[0.8rem] font-medium"
                  style={{ color: "var(--text-soft)" }}
                >
                  Open WhatsApp and scan this code
                </p>
                <p
                  className="mb-6 text-[0.78rem] leading-relaxed"
                  style={{ color: "var(--text-faint)" }}
                >
                  Or send{" "}
                  <button
                    type="button"
                    onClick={copySessionCode}
                    className="cursor-pointer font-mono text-[1rem] font-bold tracking-[0.12em] transition-opacity hover:opacity-80 active:scale-[0.98]"
                    style={{ color: "var(--accent)" }}
                  >
                    {sessionData.sessionCode}
                  </button>{" "}
                  to{" "}
                  <button
                    type="button"
                    onClick={copyBusinessNumber}
                    className="cursor-pointer font-bold transition-opacity hover:opacity-80 active:scale-[0.98]"
                    style={{ color: "var(--text-soft)" }}
                  >
                    {businessNumber}
                  </button>
                </p>
              </>
            ) : (
              /* Mobile: large session code instead of QR */
              <div
                className="w-full rounded-[22px] p-6 mb-5 text-center"
                style={{
                  background: "var(--field-strong)",
                  border: "1px solid var(--field-border)",
                }}
              >
                <p
                  className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] mb-2"
                  style={{ color: "var(--text-faint)" }}
                >
                  Verification Code
                </p>
                <div
                  className="font-mono text-[2rem] font-bold tracking-[0.16em]"
                  style={{ color: "var(--accent)" }}
                >
                  {sessionData.sessionCode}
                </div>
                <button
                  type="button"
                  onClick={copySessionCode}
                  className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-medium mx-auto transition-colors active:scale-[0.95] cursor-pointer"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-border)",
                  }}
                >
                  <CopySmIcon className="h-3 w-3" />
                  Copy
                </button>
                <div
                  className="mt-5 rounded-[16px] px-4 py-3"
                  style={{
                    background: "var(--surface-soft)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <p
                    className="text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Send to WhatsApp number
                  </p>
                  <button
                    type="button"
                    onClick={copyBusinessNumber}
                    className="mt-2 inline-flex items-center justify-center gap-1.5 font-mono text-[1rem] font-bold transition-opacity hover:opacity-80 active:scale-[0.98] cursor-pointer"
                    style={{ color: "var(--text)" }}
                  >
                    {businessNumber}
                    <CopySmIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Connection status */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="relative flex h-2 w-2">
                {connectionStatus === "connected" && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{
                    background:
                      connectionStatus === "connected"
                        ? "var(--accent)"
                        : connectionStatus === "connecting"
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                />
              </span>
              <span
                className="tl-meta-sm font-medium"
                style={{ color: "var(--text-faint)" }}
              >
                {connectionStatus === "connected"
                  ? "Listening for verification…"
                  : connectionStatus === "connecting"
                    ? "Connecting…"
                    : "Reconnecting…"}
              </span>
              {timeRemaining && timeRemaining !== "Expired" && (
                <>
                  <span
                    style={{ color: "var(--text-faint)", fontSize: "0.62rem" }}
                  >
                    ·
                  </span>
                  <span
                    className="tl-meta-sm font-medium"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {timeRemaining}
                  </span>
                </>
              )}
            </div>

            {/* Bottom actions — like Coinbase's bottom bar */}
            <div className="flex w-full items-center justify-between">
              <button
                type="button"
                onClick={handleStartOver}
                className="text-[0.72rem] font-medium transition-colors cursor-pointer hover:text-[var(--text-soft)] active:scale-[0.97]"
                style={{ color: "var(--text-faint)" }}
              >
                ← Start over
              </button>

              <button
                type="button"
                onClick={() => setShowWhatsAppModal(true)}
                className="flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[0.78rem] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #25D366, #20BA5C)",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(37,211,102,0.18)",
                }}
              >
                <WhatsAppWhiteIcon className="h-4 w-4" />
                Open WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* ─── VERIFIED ─── */}
        {flowState === "verified" && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ animation: "scaleIn 0.4s var(--ease-out-expo)" }}
          >
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-border)",
              }}
            >
              <CheckCircleIcon className="h-8 w-8 text-accent" />
            </div>
            <h3
              className="text-[1.05rem] font-bold tracking-[-0.02em]"
              style={{ color: "var(--text)" }}
            >
              Verified!
            </h3>
            <p
              className="mt-1 text-[0.78rem]"
              style={{ color: "var(--muted)" }}
            >
              Redirecting to your dashboard…
            </p>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {flowState === "error" && (
          <div
            className="flex flex-col items-center w-full"
            style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}
          >
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--danger-soft)" }}
            >
              <span className="text-xl" style={{ color: "var(--danger)" }}>
                !
              </span>
            </div>
            <h3
              className="text-[1rem] font-bold"
              style={{ color: "var(--text)" }}
            >
              Something went wrong
            </h3>
            {error && (
              <p
                className="mt-2 text-[0.78rem] text-center"
                style={{ color: "var(--danger)" }}
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleStartOver}
              className="mt-6 flex w-full max-w-[280px] items-center justify-center gap-2 rounded-[16px] px-5 py-4 text-[0.88rem] font-semibold transition-all active:scale-[0.97] cursor-pointer border border-[var(--surface-border)] hover:border-[var(--accent-border)] hover:bg-white/[0.02]"
              style={{ background: "var(--panel)", color: "var(--text)" }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp Modal */}
      {flowState === "waiting_verification" &&
      sessionData &&
      showWhatsAppModal ? (
        <WhatsAppModal
          sessionCode={sessionData.sessionCode}
          phoneNumber={businessNumber}
          qr={{ logoUrl: "/trustlink-logo.svg" }}
          onClose={() => setShowWhatsAppModal(false)}
        />
      ) : null}

      {/* Footer */}
      <footer className="relative z-20 w-full px-6 py-5">
        <div
          className="flex flex-wrap items-center justify-center gap-6 text-[0.7rem] font-medium"
          style={{ color: "var(--text-faint)" }}
        >
          <Link
            href={"/privacy" as Route}
            className="transition-colors hover:text-[var(--text-soft)]"
          >
            Privacy Policy
          </Link>
          <Link
            href={"/terms" as Route}
            className="transition-colors hover:text-[var(--text-soft)]"
          >
            Terms
          </Link>
          <Link
            href={"/support" as Route}
            className="transition-colors hover:text-[var(--text-soft)]"
          >
            Support
          </Link>
        </div>
      </footer>
    </main>
  );
}
