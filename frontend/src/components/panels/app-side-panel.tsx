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
          className={
            desktopInline
              ? "hidden md:fixed md:inset-0 md:z-50 md:block"
              : "fixed inset-0 z-999 md:hidden"
          }
          onClick={desktopInline ? onClose : onClose}
        >
          {/* ── Overlay backdrop (both mobile and desktop) ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0"
            style={{ background: "var(--overlay)", backdropFilter: "blur(16px)" }}
          />

          <motion.aside
            initial={desktopInline ? { opacity: 0, x: 24 } : { x: "100%" }}
            animate={desktopInline ? { opacity: 1, x: 0 } : { x: 0 }}
            exit={desktopInline ? { opacity: 0, x: 24 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={
              desktopInline
                ? "fixed right-0 top-0 z-50 flex h-screen w-[340px] flex-col border-l shadow-2xl"
                : "absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col border-l"
            }
            style={{
              background: "color-mix(in srgb, var(--bg-elevated) 94%, transparent)",
              backgroundImage: "var(--pop-bg)",
              borderColor: "var(--field-border)",
              backdropFilter: "blur(24px)",
              borderTopLeftRadius: desktopInline ? 0 : 28,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
              <div className="min-w-0 flex-1">
                {kicker ? (
                  <div className="text-[0.58rem] font-medium uppercase tracking-[0.2em] mb-1"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {kicker}
                  </div>
                ) : null}
                <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em]"
                  style={{ color: "var(--text)" }}
                >
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors cursor-pointer active:scale-[0.93]"
                style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--field-border)",
                }}
                aria-label={`Close ${title}`}
              >
                <X className="h-4 w-4" style={{ color: "var(--text-soft)" }} />
              </button>
            </div>

            {/* ── Divider ── */}
            <div className="mx-5 h-px" style={{ background: "var(--field-border)" }} />

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 tl-scrollbar-mobile-hidden">
              {children}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
