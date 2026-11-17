"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function FloatingGuidanceOverlay({
  open,
  dismissible = false,
  onClose,
  children,
}: {
  open: boolean;
  dismissible?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[55] px-4 md:inset-x-auto md:bottom-6 md:right-6 md:w-[390px]">
      <div className="pointer-events-auto relative rounded-[24px] border border-white/10 bg-[var(--bg-elevated)]/96 shadow-softbox backdrop-blur-xl">
        {dismissible && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/12 bg-black/45 text-white shadow-softbox backdrop-blur transition-colors hover:bg-black/65"
            aria-label="Close guidance"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
