"use client";

import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef } from "react";

import { SectionLoader } from "@/src/components/section-loader";

type PinEntryModalProps = {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
  busy?: boolean;
  children?: ReactNode;
};

export function PinEntryModal({
  open,
  title,
  description,
  value,
  onChange,
  onClose,
  busy = false,
  children,
}: PinEntryModalProps) {
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
                onKeyDown={(event) => handleKeyDown(event, index)}
                inputMode="numeric"
                autoComplete={index === 0 ? "current-password" : "off"}
                maxLength={1}
                type="password"
                className="h-12 w-11 rounded-2xl border border-white/10 bg-[#111722] text-center text-lg font-semibold text-white outline-none transition focus:border-[#58f2b1]/50 focus:ring-1 focus:ring-[#58f2b1]/20"
                aria-label={`PIN digit ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 text-sm text-white/46">
          TrustLink uses your PIN here so money actions stay fast without waiting for a fresh OTP every time.
        </div>

        {busy ? (
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
            <SectionLoader label="Checking PIN..." />
          </div>
        ) : null}
      </div>
    </div>
  );
}
