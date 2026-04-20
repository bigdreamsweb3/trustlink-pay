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
    <div className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center" onClick={() => !busy && onClose?.()}>
      <div
        className="tl-modal w-full rounded-t-[28px] px-5 pb-6 pt-5 md:max-w-[430px] md:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">{title}</h2>
          <p className="tl-text-muted text-sm">{description}</p>
        </div>

        {children ? <div className="mb-4">{children}</div> : null}

        <div className="tl-field rounded-[22px] px-4 py-4">
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
                className="tl-field-strong h-12 w-11 rounded-2xl text-center text-lg font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--accent-soft)]"
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="tl-text-muted">
            {countdown > 0 ? `Resend available in ${countdown}s` : "You can request another OTP if needed."}
          </span>
          {onResend ? (
            <button
              type="button"
              onClick={onResend}
              disabled={resendDisabled || countdown > 0 || busy}
              className="tl-button-secondary rounded-full px-3 py-2 text-xs font-medium disabled:opacity-40"
            >
              {resendLabel}
            </button>
          ) : null}
        </div>

        {busy ? (
          <div className="tl-field mt-4 rounded-[22px] px-4 py-4">
            <SectionLoader label="Verifying code..." />
          </div>
        ) : null}
      </div>
    </div>
  );
}
