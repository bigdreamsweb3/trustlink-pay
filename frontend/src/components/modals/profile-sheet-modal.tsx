"use client";

import Link from "next/link";
import { ChevronRight, Shield, UserRound, Wallet } from "lucide-react";

import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import type { UserProfile } from "@/src/lib/types";

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileSheetModal({
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
  return (
    <AppSidePanel
      open={open}
      title="Identity"
      kicker="Profile"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <section className="tl-panel rounded-[26px] p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-[0.82rem] font-bold text-accent-deep dark:text-accent">
            {initialsFor(user.displayName)}
          </div>

          <div className="min-w-0">
            <div className="truncate text-[0.96rem] font-semibold text-[var(--text)]">{user.displayName}</div>
            <div className="tl-text-soft mt-1 text-[0.78rem]">@{user.handle}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[20px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-3.5">
          <div className="tl-text-muted text-[0.66rem] uppercase tracking-[0.18em]">Phone</div>
          <div className="mt-1.5 text-[0.86rem] font-medium text-[var(--text)]">{user.phoneNumber}</div>
        </div>
      </section>

      <section className="tl-panel mt-4 rounded-[26px] p-4">
        <div className="tl-text-muted text-[0.66rem] uppercase tracking-[0.18em]">Sections</div>
        <div className="mt-3 space-y-2">
          <Link
            href="/app/profile"
            className="tl-field button flex items-center justify-between rounded-[18px] px-4 py-3 transition hover:bg-[var(--surface-soft)]"
          >
            <span className="flex items-center gap-3">
              <span className="tl-icon-surface grid h-10 w-10 place-items-center rounded-[14px]">
                <UserRound className="h-4 w-4 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              </span>
              <span>
                <span className="block text-[0.84rem] font-semibold text-[var(--text)]">Full profile</span>
                <span className="tl-text-soft block text-[0.72rem]">Display name, handle, and sender identity</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)]" />
          </Link>

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
                <span className="block text-[0.84rem] font-semibold text-[var(--text)]">Settings</span>
                <span className="tl-text-soft block text-[0.72rem]">Theme, security, and account controls</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-faint)]" />
          </Link>
        </div>
      </section>
    </AppSidePanel>
  );
}
