"use client";

import Link from "next/link";
import { ChevronRight, Copy, Landmark, MoonStar, Shield, SunMedium, Wallet } from "lucide-react";

import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useTheme } from "@/src/lib/theme";
import { useToast } from "@/src/components/toast-provider";
import type { UserProfile } from "@/src/lib/types";

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SettingsSheetModal({
  open,
  user,
  desktopInline = false,
  onClose,
}: {
  open: boolean;
  user: UserProfile;
  desktopInline?: boolean;
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  async function handleCopyHandle() {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(`@${user.handle}`);
    showToast("Handle copied.");
  }

  return (
    <AppSidePanel
      open={open}
      title="Control center"
      kicker="Settings"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">

        {/* Profile Header */}
        {/* <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-[0.76rem] font-bold text-accent-deep dark:text-accent">
            {initialsFor(user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[0.95rem] font-semibold text-[var(--text)]">{user.displayName}</span>
              <button
                type="button"
                onClick={() => void handleCopyHandle()}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-soft)] transition-colors hover:text-[var(--text)] cursor-pointer active:scale-[0.9]"
                aria-label="Copy handle"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="tl-text-soft mt-0.5 text-[0.76rem]">@{user.handle}</div>
          </div>
        </div> */}

        {/* Stats Card */}
        <div className="tl-field mt-5 rounded-[22px] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">Trust Score</div>
            <Link
              href="/app/profile"
              className="flex items-center gap-1.5 text-[0.76rem] font-semibold text-[var(--accent-deep)] dark:text-[var(--accent)] transition-colors hover:opacity-80 cursor-pointer"
            >
              Profile
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-3 text-[1.5rem] font-bold tracking-tight text-[var(--text)]">0.00</div>
          <div className="mt-2 h-1 w-10 rounded-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" />
        </div>

        {/* Settings Rows */}
        <div className="mt-5 space-y-2.5">

          {/* Theme */}
          <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
            <span className="text-[0.84rem] font-medium text-[var(--text)]">Theme</span>
            <div className="flex items-center gap-1 rounded-[12px] bg-[var(--surface-soft)] p-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[0.74rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.96] ${theme === "light"
                  ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-soft)]"
                  }`}
              >
                <SunMedium className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[0.74rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.96] ${theme === "dark"
                  ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-soft)]"
                  }`}
              >
                <MoonStar className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>

          {/* Currency */}
          <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
            <span className="text-[0.84rem] font-medium text-[var(--text)]">Currency</span>
            <div className="flex items-center gap-1.5 rounded-[12px] bg-[var(--surface-soft)] px-3 py-1.5">
              <Landmark className="h-3.5 w-3.5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              <span className="text-[0.78rem] font-semibold text-[var(--text)]">USD</span>
            </div>
          </div>

          {/* Wallets */}
          <Link
            href="/app/wallets"
            className="tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <Wallet className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              <span className="text-[0.84rem] font-medium text-[var(--text)]">Wallets</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Security */}
          <Link
            href="/app/settings"
            className="tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <Shield className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              <span className="text-[0.84rem] font-medium text-[var(--text)]">Security & PIN</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Action */}
        <div className="pt-6 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="tl-button-secondary w-full rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-semibold transition-colors cursor-pointer hover:opacity-90 active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </AppSidePanel>
  );
}