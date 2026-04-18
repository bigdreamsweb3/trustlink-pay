"use client";

import { SpinnerIcon } from "@/src/components/app-icons";

type SectionLoaderProps = {
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function SectionLoader({ label = "Loading...", size = "sm", className = "" }: SectionLoaderProps) {
  const iconClass = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const textClass = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`tl-text-muted flex items-center gap-2 ${textClass} ${className}`}>
      <SpinnerIcon className={`${iconClass} animate-spin text-[var(--accent-deep)] dark:text-[#7dffd9]`} />
      <span>{label}</span>
    </div>
  );
}
