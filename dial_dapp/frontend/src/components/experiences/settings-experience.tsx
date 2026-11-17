"use client";

import Link from "next/link";
import {
  BellRing,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
  MoonStar,
  SunMedium,
} from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useTheme } from "@/src/lib/theme";

export function SettingsExperience() {
  const {
    hydrated,
    user,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession("/app/settings");
  const { theme, setTheme } = useTheme();

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell
      currentTab="settings"
      title="Preferences"
      subtitle="Control how TrustLink Pay looks and communicates. Identity, wallets and security live in Identity Center."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal
            pendingAuth={pendingAuth}
            user={user}
            onAuthenticated={completePendingAuth}
            onSignOut={logout}
          />
        ) : null
      }
    >
      <section className="mx-auto w-full max-w-[720px] space-y-5">
        <div className="tl-panel rounded-[28px] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-[1rem] font-semibold text-[var(--text)]">
              App preferences
            </h2>
            <p className="mt-1 text-[0.76rem] leading-5 text-[var(--text-soft)]">
              Settings here affect this TrustLink Pay experience, not your
              protocol identity.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5">
              <span className="min-w-0">
                <span className="block text-[0.8rem] font-semibold text-[var(--text)]">
                  Appearance
                </span>
                <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                  Choose the interface theme for this device.
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1 rounded-[12px] bg-[var(--surface-soft)] p-1">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  aria-pressed={theme === "light"}
                  className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[0.7rem] font-semibold transition ${
                    theme === "light"
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
                  aria-pressed={theme === "dark"}
                  className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[0.7rem] font-semibold transition ${
                    theme === "dark"
                      ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                      : "text-[var(--text-soft)]"
                  }`}
                >
                  <MoonStar className="h-3.5 w-3.5" />
                  Dark
                </button>
              </div>
            </div>

            <div className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <CircleDollarSign className="h-4 w-4 shrink-0 text-accent" />
                <span>
                  <span className="block text-[0.8rem] font-semibold text-[var(--text)]">
                    Display currency
                  </span>
                  <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                    Token values and summaries
                  </span>
                </span>
              </span>
              <span className="rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--text-soft)]">
                USD
              </span>
            </div>

            <div className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <BellRing className="h-4 w-4 shrink-0 text-accent" />
                <span>
                  <span className="block text-[0.8rem] font-semibold text-[var(--text)]">
                    WhatsApp payment updates
                  </span>
                  <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                    Delivery and settlement notifications
                  </span>
                </span>
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                  user.whatsappOptedIn
                    ? "border-accent-border bg-accent-soft text-accent"
                    : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)]"
                }`}
              >
                {user.whatsappOptedIn ? "Enabled" : "Not enabled"}
              </span>
            </div>
          </div>
        </div>

        <Link
          href="/app/identity?section=security"
          className="tl-panel group flex items-center justify-between gap-4 rounded-[22px] p-4 transition hover:border-accent-border"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent">
              <LockKeyhole className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[0.82rem] font-semibold text-[var(--text)]">
                Identity and security
              </span>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-[var(--text-soft)]">
                Manage your TIN, profile, wallets, PIN and recovery in Identity
                Center.
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>
    </AppMobileShell>
  );
}
