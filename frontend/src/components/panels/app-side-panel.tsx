"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export function AppSidePanel({
  open,
  title,
  kicker,
  desktopInline = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  desktopInline?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div
          className={desktopInline ? "hidden md:block" : "tl-overlay fixed inset-0 z-999 md:hidden"}
          onClick={desktopInline ? undefined : onClose}
        >
          {!desktopInline ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-[var(--overlay)]"
            />
          ) : null}

          <motion.aside
            initial={desktopInline ? { opacity: 0, x: 28 } : { x: "100%" }}
            animate={desktopInline ? { opacity: 1, x: 0 } : { x: 0 }}
            exit={desktopInline ? { opacity: 0, x: 28 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className={desktopInline
              ? "tl-panel absolute inset-0 flex md:h-screen md:max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-tl-[34px] z-999"
              : "absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col gap-3 border-l border-[var(--dock-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] bg-[image:var(--pop-bg)] rounded-tl-[34px] backdrop-blur-2xl"}
            onClick={(event) => event.stopPropagation()}
          >
            {/* ── Panel Header ── */}
            <div className="flex items-center justify-between px-6 pt-5">
              <div className="min-w-0 flex-1">
                {kicker ? (
                  <div className="tl-text-muted text-[0.65rem] uppercase tracking-[0.22em]">
                    {kicker}
                  </div>
                ) : null}
                <h2 className={`text-lg font-semibold tracking-[-0.03em] text-[var(--text)] ${kicker ? "mt-1.5" : ""}`}>
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tl-field-btn button grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--surface-soft)] active:scale-[0.96]"
                aria-label={`Close ${title}`}
              >
                <X className="h-4.5 w-4.5 text-[var(--text-soft)]" />
              </button>
            </div>

            {/* ── Header/Content Divider ── */}
            <div className="mx-6 h-px bg-[var(--surface-soft)] opacity-60" />

            {/* ── Scrollable Content ── */}
            <div className="flex-1 overflow-y-auto px-6 pt-0 pb-5">
              {children}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}