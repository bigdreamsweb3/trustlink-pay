"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ShieldCheck, Wallet2 } from "lucide-react";

type GuidanceStep = {
  title: string;
  description: string;
  done?: boolean;
};

export function TrustLinkGuidance({
  title,
  description,
  steps,
  action,
  secondaryAction,
  tone = "default",
}: {
  title: string;
  description: string;
  steps?: GuidanceStep[];
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "border-[#58f2b1]/18 bg-[#58f2b1]/8"
      : tone === "warning"
        ? "border-[#ffb86b]/18 bg-[#ffb86b]/10"
        : "border-accent-border bg-accent-soft";

  return (
    <section className={`rounded-[22px] border px-4 py-4 ${toneClass}`}>
      <div className="flex items-start gap-3.5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-[var(--surface-soft)] text-[var(--accent-deep)] dark:text-[var(--accent)]">
          {tone === "success" ? <CheckCircle2 className="h-5 w-5" /> : tone === "warning" ? <ShieldCheck className="h-5 w-5" /> : <Wallet2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.94rem] font-semibold text-[var(--text)]">{title}</h2>
          <p className="mt-1 text-[0.78rem] leading-6 text-[var(--text-soft)]">{description}</p>
        </div>
      </div>

      {steps?.length ? (
        <div className="mt-4 space-y-2">
          {steps.map((step) => (
            <div key={step.title} className="tl-field flex items-start gap-3 rounded-[16px] px-3.5 py-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${step.done ? "bg-[#4ae8c0]" : "bg-[#ffb86b]"}`} />
              <span className="min-w-0">
                <span className="block text-[0.78rem] font-semibold text-[var(--text)]">{step.title}</span>
                <span className="mt-0.5 block text-[0.72rem] leading-5 text-[var(--text-soft)]">{step.description}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}
