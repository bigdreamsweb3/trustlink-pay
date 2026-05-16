"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Loader2, Shield, X } from "lucide-react";
import { buildTrustLinkSessionCodeMessage, buildTrustLinkWhatsAppNativeUrl, buildTrustLinkWhatsAppWebUrl } from "../auth";
import { QRCodeDisplay } from "./qr-code-display";

function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className={`shrink-0 ${className}`}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ManualRow({
  label,
  value,
  onCopy,
  copied = false,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <div className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
          {label}
        </div>
        <div className="break-words text-[0.82rem] font-bold leading-snug md:text-[0.9rem]" style={{ color: "var(--text)" }}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] transition active:scale-[0.94]"
        style={{
          background: copied ? "var(--accent-soft)" : "var(--surface-soft)",
          border: copied ? "1px solid var(--accent-border)" : "1px solid var(--field-border)",
          color: copied ? "var(--accent)" : "var(--text-soft)",
        }}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface WhatsAppModalProps {
  sessionCode: string;
  phoneNumber: string;
  onClose: () => void;
  onSuccess?: () => void;
  qr?: {
    enabled?: boolean;
    size?: number;
    logoUrl?: string;
  };
}

export function WhatsAppModal({
  sessionCode,
  phoneNumber,
  onClose,
  qr,
}: WhatsAppModalProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const handoffStatusRef = useRef<"idle" | "opening" | "waiting" | "fallback">("idle");
  const [handoffStatus, setHandoffStatusState] = useState<"idle" | "opening" | "waiting" | "fallback">("idle");
  const [copiedField, setCopiedField] = useState<"phone" | "message" | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const setHandoffStatus = useCallback((status: "idle" | "opening" | "waiting" | "fallback") => {
    handoffStatusRef.current = status;
    setHandoffStatusState(status);
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      if (handoffStatusRef.current === "opening") {
        setHandoffStatus("waiting");
      }
    };

    const handleFocus = () => {
      if (handoffStatusRef.current === "waiting") {
        setIsConnecting(false);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [setHandoffStatus]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    onClose();
  }, [onClose]);

  const handleOpenWhatsApp = useCallback(() => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    setIsConnecting(true);
    setHandoffStatus("opening");

    const nativeWhatsAppUrl = buildTrustLinkWhatsAppNativeUrl({ phoneNumber, sessionCode });

    if (isMobile) {
      window.location.href = nativeWhatsAppUrl;

      fallbackTimerRef.current = setTimeout(() => {
        if (handoffStatusRef.current === "opening" && document.hasFocus()) {
          setHandoffStatus("fallback");
          setIsConnecting(false);
        } else {
          setHandoffStatus("waiting");
        }
      }, 2000);

      return;
    }

    const anchor = document.createElement("a");
    anchor.href = nativeWhatsAppUrl;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    fallbackTimerRef.current = setTimeout(() => {
      if (document.hasFocus() && handoffStatusRef.current === "opening") {
        setHandoffStatus("fallback");
        setIsConnecting(false);
      } else if (!document.hasFocus()) {
        setHandoffStatus("waiting");
      }
    }, 1000);
  }, [isMobile, phoneNumber, sessionCode, setHandoffStatus]);

  const qrEnabled = qr?.enabled ?? true;
  const qrSize = qr?.size ?? 256;
  const qrValue = buildTrustLinkWhatsAppWebUrl({ phoneNumber, sessionCode });
  const authMessage = buildTrustLinkSessionCodeMessage(sessionCode);
  const formattedPhoneNumber = phoneNumber.replace(/[^0-9+]/g, "");
  const copyText = useCallback((field: "phone" | "message", value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedField(field);

    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => {
      setCopiedField(null);
    }, 1400);
  }, []);

  if (!isOpen) return null;

  const statusLabel = {
    idle: null,
    opening: isMobile ? "Opening WhatsApp..." : "Opening WhatsApp...",
    waiting: "Waiting for your verification...",
    fallback: isMobile
      ? "Could not open WhatsApp automatically."
      : "Could not open the WhatsApp app. Scan the QR code or try again.",
  }[handoffStatus];

  return (
    <AnimatePresence>
      <div className="tl-overlay fixed inset-0 z-[999] flex items-center justify-center p-4">
        <div className="absolute inset-0" onClick={() => !isConnecting && closeModal()} />

        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="tl-modal relative w-full max-w-[340px] overflow-hidden rounded-[28px] md:max-w-[860px]"
          onClick={(event) => event.stopPropagation()}
        >
          {(handoffStatus === "opening" || handoffStatus === "waiting") && (
            <div className="absolute left-0 right-0 top-0 h-[2px] overflow-hidden" style={{ background: "var(--surface-soft)" }}>
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: handoffStatus === "waiting" ? "84%" : "45%" }}
                transition={{ duration: handoffStatus === "opening" ? 2 : 0.4, ease: "easeOut" }}
                className="h-full"
                style={{ background: "var(--accent)" }}
              />
            </div>
          )}

          <div className="px-5 py-5 md:px-7 md:py-7">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.12)" }}
                >
                  <WhatsAppIcon className="h-[18px] w-[18px] text-[#25D366]" />
                </div>
                <div>
                  <div className="text-[0.78rem] font-bold" style={{ color: "var(--text)" }}>WhatsApp</div>
                  <div className="text-[0.58rem] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Session Auth</div>
                </div>
              </div>
              {handoffStatus === "idle" || handoffStatus === "fallback" ? (
                <button
                  type="button"
                  onClick={closeModal}
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-colors active:scale-[0.93]"
                  style={{ background: "var(--surface-soft)", color: "var(--text-faint)" }}
                  aria-label="Close WhatsApp verification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="mb-5 md:mb-6">
              <h2 className="text-[1.05rem] font-bold tracking-normal md:text-[1.2rem]" style={{ color: "var(--text)" }}>
                {handoffStatus === "waiting" ? "Waiting for verification..." : "Approve your session"}
              </h2>
              <p className="mt-1 text-[0.74rem] leading-relaxed md:text-[0.82rem]" style={{ color: "var(--muted)" }}>
                {handoffStatus === "waiting"
                  ? isMobile
                    ? "Send the code in WhatsApp, then come back here."
                    : "Scan the QR code or approve the session in WhatsApp."
                  : "Send your session code via WhatsApp to sign in securely."}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-[300px_1fr] md:items-start">
              {!isMobile && qrEnabled ? (
                <div className="hidden flex-col items-center md:flex">
                  <div
                    className="rounded-[18px] p-4"
                    style={{ background: "white", border: "1px solid var(--field-border)" }}
                  >
                    <QRCodeDisplay value={qrValue} size={Math.min(qrSize, 242)} logoUrl={qr?.logoUrl} />
                  </div>
                  <p className="mt-3 text-center text-[0.72rem] font-semibold" style={{ color: "var(--text-faint)" }}>
                    Scan to open WhatsApp
                  </p>
                </div>
              ) : null}

              <div className="space-y-4">
                <div
                  className="relative flex min-h-[146px] flex-col justify-end gap-3 overflow-hidden rounded-[18px] p-4 md:min-h-[190px]"
                  style={{ background: "var(--field)", border: "1px solid var(--field-border)" }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage:
                        "linear-gradient(var(--accent-border) 1px, transparent 1px), linear-gradient(90deg, var(--accent-border) 1px, transparent 1px)",
                      backgroundSize: "12px 12px",
                    }}
                  />

                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="relative z-10 flex justify-end">
                    <div className="max-w-[86%] rounded-[10px] rounded-tr-[3px] px-2.5 py-1.5" style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.14)" }}>
                      <p className="text-[0.6rem] font-semibold md:text-[0.64rem]" style={{ color: "var(--text)" }}>
                        {authMessage}
                      </p>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }} className="relative z-10 flex justify-start">
                    <div className="w-[88%] rounded-[10px] rounded-tl-[3px] px-2.5 py-2" style={{ background: "var(--panel)", border: "1px solid var(--field-border)" }}>
                      <p className="mb-1.5 text-[0.58rem] md:text-[0.62rem]" style={{ color: "var(--text-soft)" }}>
                        Confirm sign-in to TrustLink Pay?
                      </p>
                      <div className="flex gap-1.5">
                        <div className="flex-1 rounded-[6px] py-1 text-center text-[0.56rem] font-semibold" style={{ background: "var(--surface-soft)", border: "1px solid var(--field-border)", color: "var(--text-faint)" }}>
                          Decline
                        </div>
                        <div className="flex-1 rounded-[6px] py-1 text-center text-[0.56rem] font-semibold" style={{ background: "var(--accent)", color: "#04110a" }}>
                          Approve
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 2.4, duration: 0.25 }}
                    className="relative z-10 flex justify-end"
                  >
                    <div className="rounded-[8px] rounded-tr-[3px] px-2.5 py-1" style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.14)" }}>
                      <p className="text-[0.58rem] font-semibold" style={{ color: "var(--text)" }}>Approve Session</p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 3.25, duration: 0.25 }}
                    className="relative z-10 flex justify-start"
                  >
                    <div className="flex items-center gap-1 rounded-[8px] rounded-tl-[3px] px-2.5 py-1" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
                      <Check className="h-3 w-3" style={{ color: "var(--accent)" }} />
                      <p className="text-[0.58rem] font-semibold" style={{ color: "var(--accent)" }}>Session approved</p>
                    </div>
                  </motion.div>
                </div>

                <div
                  className="rounded-[18px] p-3.5 md:p-4"
                  style={{ background: "var(--field)", border: "1px solid var(--field-border)" }}
                >
                  <ManualRow label="Send to" value={formattedPhoneNumber} copied={copiedField === "phone"} onCopy={() => copyText("phone", formattedPhoneNumber)} />
                  <div className="my-3 h-px" style={{ background: "var(--field-border)" }} />
                  <ManualRow label="Message" value={authMessage} copied={copiedField === "message"} onCopy={() => copyText("message", authMessage)} />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {handoffStatus === "waiting" ? (
                <div className="flex items-center justify-center gap-2.5 rounded-[18px] py-3.5" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: "var(--accent)" }} />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
                  </span>
                  <span className="text-[0.82rem] font-semibold" style={{ color: "var(--accent)" }}>
                    Listening for verification...
                  </span>
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleOpenWhatsApp}
                  disabled={handoffStatus === "opening"}
                  className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[18px] py-3.5 text-[0.88rem] font-semibold transition-all disabled:opacity-70"
                  style={{
                    background: "linear-gradient(135deg, #25D366, #20BA5C)",
                    color: "#ffffff",
                    boxShadow: "0 4px 16px rgba(37,211,102,0.20)",
                  }}
                >
                  {handoffStatus === "opening" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Opening WhatsApp...</span>
                    </>
                  ) : handoffStatus === "fallback" ? (
                    <>
                      <WhatsAppIcon className="h-[18px] w-[18px]" />
                      <span>Try Again</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                    </>
                  ) : (
                    <>
                      <WhatsAppIcon className="h-[18px] w-[18px]" />
                      <span>Open WhatsApp</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                    </>
                  )}
                </motion.button>
              )}

              {statusLabel ? (
                <p className="text-center text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  {statusLabel}
                </p>
              ) : null}

              <div className="flex items-center justify-center gap-1.5">
                <Shield className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
                <span className="text-[0.58rem] font-medium uppercase tracking-[0.2em]" style={{ color: "var(--text-faint)" }}>
                  End-to-end encrypted session
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
