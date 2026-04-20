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
              className="absolute inset-0 bg-[var(--overlay)]"
            />
          ) : null}

          <motion.aside
            initial={desktopInline ? { opacity: 0, x: 28 } : { x: "100%" }}
            animate={desktopInline ? { opacity: 1, x: 0 } : { x: 0 }}
            exit={desktopInline ? { opacity: 0, x: 28 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={desktopInline
              ? "tl-panel absolute inset-0 flex h-[calc(93vh-3rem)] w-full flex-col overflow-hidden rounded-[34px]"
              : "absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col border-l border-[var(--dock-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] bg-[image:var(--pop-bg)] backdrop-blur-2xl"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                {kicker ? <div className="tl-text-muted text-[0.68rem] uppercase tracking-[0.2em]">{kicker}</div> : null}
                <h2 className="mt-1 text-[1rem] font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tl-field button grid h-10 w-10 place-items-center rounded-full transition hover:bg-[var(--surface-soft)]"
                aria-label={`Close ${title}`}
              >
                <X className="h-4.5 w-4.5 text-[var(--text-soft)]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {children}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
