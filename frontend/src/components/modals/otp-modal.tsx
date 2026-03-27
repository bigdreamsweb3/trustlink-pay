"use client";

import { ClipboardEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef } from "react";

import { SectionLoader } from "@/src/components/section-loader";

type OtpModalProps = {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
  resendLabel?: string;
  resendDisabled?: boolean;
  onResend?: () => void;
  countdown?: number;
  busy?: boolean;
  children?: ReactNode;
};

export function OtpModal({
  open,
  title,
  description,
  value,
  onChange,
  onClose,
  resendLabel = "Resend OTP",
  resendDisabled,
  onResend,
  countdown = 0,
  busy = false,
  children,
}: OtpModalProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = useMemo(
    () => Array.from({ length: 6 }, (_, index) => value[index] ?? ""),
    [value],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const emptyIndex = digits.findIndex((digit) => !digit);
    const focusIndex = emptyIndex === -1 ? digits.length - 1 : emptyIndex;
    inputRefs.current[focusIndex]?.focus();
  }, [digits, open]);

  if (!open) {
    return null;
  }

  function setDigit(index: number, nextDigit: string) {
    const sanitized = nextDigit.replace(/[^\d]/g, "").slice(-1);
    const nextValue = digits
      .map((digit, digitIndex) => (digitIndex === index ? sanitized : digit))
      .join("");

    onChange(nextValue);

    if (sanitized && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/[^\d]/g, "").slice(0, 6);
    if (!pasted) {
      return;
    }

    event.preventDefault();
    onChange(pasted);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center"
      onClick={() => !busy && onClose?.()}
    >
      <div
        className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">{title}</h2>
          <p className="text-sm text-white/48">{description}</p>
        </div>

        {children ? <div className="mb-4">{children}</div> : null}

        <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                value={digit}
                onChange={(event) => setDigit(index, event.target.value)}
                onPaste={handlePaste}
                onKeyDown={(event) => handleKeyDown(event, index)}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                className="h-12 w-11 rounded-2xl border border-white/10 bg-[#111722] text-center text-lg font-semibold text-white outline-none transition focus:border-[#58f2b1]/50 focus:ring-1 focus:ring-[#58f2b1]/20"
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-white/46">
            {countdown > 0 ? `Resend available in ${countdown}s` : "You can request another OTP if needed."}
          </span>
          {onResend ? (
            <button
              type="button"
              onClick={onResend}
              disabled={resendDisabled || countdown > 0 || busy}
              className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/78 disabled:opacity-40"
            >
              {resendLabel}
            </button>
          ) : null}
        </div>

        {busy ? (
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
            <SectionLoader label="Verifying code..." />
          </div>
        ) : null}
      </div>
    </div>
  );
}
