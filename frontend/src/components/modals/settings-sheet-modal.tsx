"use client";

import Link from "next/link";
import { ChevronRight, Landmark, MoonStar, Shield, SunMedium, UserRound, Wallet } from "lucide-react";

import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useTheme } from "@/src/lib/theme";
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

  return (
    <AppSidePanel
      open={open}
      title="Control center"
      kicker="Settings"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <section className="tl-panel rounded-[26px] p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 min-w-12 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-[0.76rem] font-bold text-accent-deep dark:text-accent">
            {initialsFor(user.displayName)}
          </div>

          <div className="flex items-center justify-between gap-3 w-full">
            <div className="min-w-0">
              <div className="truncate text-[0.92rem] font-semibold text-[var(--text)]">{user.displayName}</div>
              <div className="tl-text-soft mt-1 text-[0.78rem]">@{user.handle}</div>
            </div>


            <Link
              href="/app/profile"
              className="tl-field button flex items-center justify-between rounded-[18px] px-2 py-1.5 transition hover:bg-[var(--surface-soft)]"
            >
              {/* <span className="flex items-center gap-3">
              <span className="tl-icon-surface grid h-10 w-10 place-items-center rounded-[14px]">
                <UserRound className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              </span>
              <span>
                <span className="block text-[0.84rem] font-semibold text-[var(--text)]">Profile</span>
                <span className="tl-text-soft block text-[0.72rem]">Identity and sender details</span>
              </span>
            </span> */}
              <ChevronRight className="h-4 w-4 text-[var(--text-faint)]" />
            </Link>

          </div>
        </div>
      </section>

      <section className="tl-panel mt-4 rounded-[26px] p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
          <div className="text-[0.9rem] font-semibold text-[var(--text)]">Quick settings</div>
        </div>

        <div className="mt-4 rounded-[20px] border tl-field px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="tl-icon-surface grid h-10 w-10 shrink-0 place-items-center rounded-[14px]">
              <Landmark className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
            </span>

            <div className="min-w-0 flex-1">
              <div className=" flex items-center justify-between">

                <div className="text-[0.84rem] font-semibold text-[var(--text)]">Display currency</div>

                <div className="text-sm font-semibold text-[var(--text)]">USD</div>
              </div>
              <div className="tl-text-soft mt-1 text-[0.68rem] leading-3.5">
                Multi-currency balance conversion is planned for a future update.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="tl-text-muted text-[0.66rem] uppercase tracking-[0.18em]">Theme</div>
          <div className="mt-2 flex items-center gap-2 rounded-[20px] bg-[var(--surface-soft)] p-1">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`button flex flex-1 items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[0.82rem] font-semibold transition ${theme === "light" ? "tl-button-primary" : "tl-button-secondary"}`}
            >
              <SunMedium className="h-4 w-4" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`button flex flex-1 items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[0.82rem] font-semibold transition ${theme === "dark" ? "tl-button-primary" : "tl-button-secondary"}`}
            >
              <MoonStar className="h-4 w-4" />
              <span>Dark</span>
            </button>
          </div>
        </div>


      </section>

      <section className="tl-panel mt-4 rounded-[26px] p-4">
        <div className="tl-text-muted text-[0.66rem] uppercase tracking-[0.18em]">Sections</div>
        <div className="mt-3 space-y-2">

          <Link
            href="/app/wallets"
            className="tl-field button flex items-center justify-between rounded-[18px] px-4 py-3 transition hover:bg-[var(--surface-soft)]"
          >
            <span className="flex items-center gap-3">
              <span className="tl-icon-surface grid h-10 w-10 place-items-center rounded-[14px]">
                <Wallet className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              </span>
              <span>
                <span className="block text-[0.84rem] font-semibold text-[var(--text)]">Wallets</span>
                <span className="tl-text-soft block text-[0.72rem]">Connections and payout wallets</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)]" />
          </Link>

          <Link
            href="/app/settings"
            className="tl-field button flex items-center justify-between rounded-[18px] px-4 py-3 transition hover:bg-[var(--surface-soft)]"
          >
            <span className="flex items-center gap-3">
              <span className="tl-icon-surface grid h-10 w-10 place-items-center rounded-[14px]">
                <Shield className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              </span>
              <span>
                <span className="block text-[0.84rem] font-semibold text-[var(--text)]">Full settings</span>
                <span className="tl-text-soft block text-[0.72rem]">Security, PIN, and more setting controls</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)]" />
          </Link>
        </div>
      </section>
    </AppSidePanel>
  );
}
