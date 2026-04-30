"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/src/lib/storage";

/* ─── WhatsApp inline icon ─── */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/* ─── Shield icon for trust badges ─── */
function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function ZapIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function CopySmIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
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
      
      // Debug logging for mobile
      if (deviceInfo.isMobile) {
        console.log("[Auth] Mobile session generation started", {
          sessionId,
          userAgent: deviceInfo.userAgent,
          hasWhatsAppApp: deviceInfo.hasWhatsAppApp,
        });
      }

      const response = await apiPost<{
        success: boolean;
        sessionCode: string;
        expiresAt: string;
      }>("/api/auth/session", { sessionId });

      if (deviceInfo.isMobile) {
        console.log("[Auth] Mobile session response", response);
      }

      if (!response.success) throw new Error("Failed to generate session code");

      const newSessionData: SessionData = {
        sessionId,
        sessionCode: response.sessionCode,
        expiresAt: response.expiresAt,
      };

      setSessionData(newSessionData);
      setFlowState("waiting_verification");
      startEventListening(newSessionData);
      
      // Auto-open WhatsApp on mobile for Google Auth-like experience
      if (deviceInfo.isMobile && deviceInfo.hasWhatsAppApp) {
        const whatsappUrl = generateWhatsAppUrl(businessNumber, newSessionData.sessionCode);
        console.log("[Auth] Auto-opening WhatsApp on mobile", whatsappUrl);
        
        // Try to open WhatsApp in a popup
        setTimeout(() => {
          const popup = window.open(
            whatsappUrl,
            'whatsapp',
            'width=400,height=600,scrollbars=yes,resizable=yes'
          );
          
          // Fallback: if popup is blocked, open in same tab
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            console.log("[Auth] Popup blocked, opening in same tab");
            window.location.href = whatsappUrl;
          }
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
      
      if (deviceInfo.isMobile) {
        console.error("[Auth] Mobile session generation failed", {
          error: errorMessage,
          errorDetails: error instanceof Error ? error.stack : "No stack trace",
          deviceInfo,
        });
        
        // Mobile-specific troubleshooting
        if (error instanceof Error && error.message.includes("fetch")) {
          console.error("[Auth] Network error - make sure frontend middleware is working");
          console.log("[Auth] Current URL:", window.location.href);
        }
      }
      
      // Enhanced error message for mobile
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

    clearStoredToken();
    clearStoredUser();
    clearStoredPendingAuth();

    const completeUser = {
      ...result.user!,
      handle: "",
      walletAddress: null,
      phoneVerifiedAt: new Date().toISOString(),
      identityVerifiedAt: null,
      createdAt: new Date().toISOString(),
    };

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
    
    // Try to open in popup first, fallback to new tab
    const popup = window.open(
      whatsappUrl,
      'whatsapp',
      'width=400,height=600,scrollbars=yes,resizable=yes'
    );
    
    // Fallback: if popup is blocked, open in new tab
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
  }

  function copySessionCode() {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.sessionCode).then(() => {
      showToast("Session code copied!");
    }).catch(() => {
      showToast("Failed to copy session code");
    });
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
      const testPhoneNumber = "+1234567890";
      const result = await apiPost<{
        success: boolean;
        challengeToken?: string;
        user?: { id: string; displayName: string; phoneNumber: string };
        stage: "pin_verify" | "pin_setup";
        error?: string;
      }>("/api/auth/session/manual-verify", {
        sessionCode: sessionData.sessionCode,
        phoneNumber: testPhoneNumber,
      });
      if (result.success) handleVerificationSuccess(result);
      else showToast(result.error || "Manual verification failed");
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
      {/* <div className="relative z-10 mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[18px]"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-icon))" }}
        >
          <span className="text-xl font-bold" style={{ color: "#04110a" }}>TL</span>
        </div>
        <h1 className="text-lg font-bold tracking-[-0.03em]" style={{ color: "var(--text)" }}>
          TrustLink Pay
        </h1>
        <p className="mt-1 text-[0.78rem]" style={{ color: "var(--muted)" }}>
          Secure crypto payments, simplified
        </p>
      </div> */}

      {/* ── Auth Card ── */}
      <div className="relative z-10 w-full max-w-[420px] overflow-hidden"
        // style={{
        //   background: "var(--panel)",
        //   borderColor: "var(--surface-border)",
        //   boxShadow: "var(--shadow)",
        // }}
      >
        {/* Card top accent line */}
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--accent-border), transparent)" }}
        />

        <div className="p-6">

          {/* ─── IDLE STATE ─── */}
          {flowState === "idle" && (
            <div className="space-y-6" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
              {/* WhatsApp branded header */}
              {/* <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: "rgba(37, 211, 102, 0.10)", border: "1px solid rgba(37, 211, 102, 0.12)" }}
                >
                  <WhatsAppIcon className="h-8 w-8 text-green-500" />
                </div>
                <h2 className="text-[1.18rem] font-bold tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                  Sign in with WhatsApp
                </h2>
                <p className="mx-auto mt-2 max-w-[280px] text-[0.8rem] leading-relaxed" style={{ color: "var(--muted)" }}>
                  Generate a secure session code and verify it instantly through WhatsApp.
                </p>
              </div> */}

              {/* Error display */}
              {error && (
                <div className="rounded-[14px] px-4 py-3 text-[0.8rem]"
                  style={{ background: "var(--danger-soft)", border: "1px solid rgba(217, 80, 80, 0.12)", color: "var(--danger)" }}
                >
                  {error}
                </div>
              )}

              {/* Main CTA */}
              <button
                type="button"
                onClick={() => void generateSession()}
                className="group flex w-full items-center justify-center gap-2.5 rounded-[18px] px-5 py-3.5 text-[0.88rem] font-semibold tracking-[-0.01em] transition-all duration-200 active:scale-[0.97] cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #25D366, #20BA5C)",
                  color: "#ffffff",
                  boxShadow: "0 4px 16px rgba(37, 211, 102, 0.20), 0 1px 3px rgba(37, 211, 102, 0.10)",
                }}
              >
                <WhatsAppIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                Continue with WhatsApp
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1" style={{ background: "var(--surface-border)" }} />
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
                  How it works
                </span>
                <div className="h-px flex-1" style={{ background: "var(--surface-border)" }} />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {[
                  { step: "1", text: "Generate a unique session code" },
                  { step: "2", text: "Send it to TrustLink via WhatsApp" },
                  { step: "3", text: "Verified automatically — you're in" },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3 rounded-[14px] px-3.5 py-2.5"
                    style={{ background: "var(--surface-soft)" }}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
                    >
                      {item.step}
                    </div>
                    <span className="text-[0.78rem] font-medium" style={{ color: "var(--text-soft)" }}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── GENERATING STATE ─── */}
          {flowState === "generating_session" && (
            <div className="flex flex-col items-center justify-center py-12" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
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
            <div className="space-y-5" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>

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
                    Verify Session
                  </h2>
                  <p className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                    Send this code via WhatsApp to sign in
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
                  Session Code
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
                    Or send "<span className="font-semibold" style={{ color: "var(--accent)" }}>{sessionData.sessionCode}</span>" to {businessNumber}
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
                    background: "linear-gradient(135deg, #25D366, #20BA5C)",
                    color: "#ffffff",
                    boxShadow: "0 4px 16px rgba(37, 211, 102, 0.20)",
                  }}
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {deviceInfo.isMobile ? "Open WhatsApp Manually" : "Open WhatsApp to Verify"}
                </button>
              )}

              {/* Auto-opening indicator for mobile */}
              {useDirectLink && deviceInfo.isMobile && !showManualWhatsAppButton && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent"></div>
                  <span className="text-[0.8rem]" style={{ color: "var(--text-soft)" }}>
                    Opening WhatsApp...
                  </span>
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
            <div className="flex flex-col items-center justify-center py-12" style={{ animation: "scaleIn 0.4s var(--ease-out-expo)" }}>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}
              >
                <CheckCircleIcon className="h-8 w-8 text-accent"  />
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
            <div className="space-y-5 py-4" style={{ animation: "fadeIn 0.3s var(--ease-out-expo)" }}>
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
                
                {/* Mobile-specific troubleshooting */}
                {deviceInfo.isMobile && (
                  <div className="mt-4 text-left rounded-[14px] px-3 py-3 text-[0.7rem]"
                    style={{ background: "var(--surface-soft)", border: "1px solid var(--surface-border)" }}
                  >
                    <p className="font-medium mb-2" style={{ color: "var(--text)" }}>Mobile troubleshooting:</p>
                    <ul className="space-y-1" style={{ color: "var(--text-soft)" }}>
                      <li>• Check your internet connection</li>
                      <li>• Make sure both servers are running</li>
                      <li>• Try refreshing the page</li>
                      <li>• Clear browser cache and retry</li>
                    </ul>
                  </div>
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
                
                {/* Debug info for mobile */}
                {deviceInfo.isMobile && process.env.NODE_ENV === "development" && (
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[Auth] Debug info:", {
                        deviceInfo,
                        flowState,
                        error,
                        sessionData,
                        connectionStatus,
                      });
                      showToast("Debug info logged to console");
                    }}
                    className="mx-auto block rounded-md px-2 py-1 text-[0.64rem] font-medium"
                    style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                  >
                    Debug: Log Info
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Trust badges ── */}
      {/* {flowState === "idle" && (
        <div className="relative z-10 mt-7 flex w-full max-w-[420px] items-start gap-2" style={{ animation: "fadeIn 0.4s 0.15s var(--ease-out-expo) both" }}>
          {[
            { icon: ShieldIcon, label: "End-to-end secure" },
            { icon: ZapIcon, label: "Instant verification" },
            { icon: ClockIcon, label: "Time-limited codes" },
          ].map((badge) => (
            <div key={badge.label} className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] px-2 py-3 text-center"
              style={{ background: "var(--surface-soft)", border: "1px solid var(--surface-border)" }}
            >
              <badge.icon className="h-4 w-4 text-accent" />
              <span className="text-[0.62rem] font-medium leading-tight" style={{ color: "var(--text-faint)" }}>
                {badge.label}
              </span>
            </div>
          ))}
        </div>
      )} */}
    </main>
  );
}
