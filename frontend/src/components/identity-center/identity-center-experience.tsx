"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  IdCard,
  LockKeyhole,
  UserRound,
  WalletCards,
} from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { IdentityOverviewSection } from "@/src/components/identity-center/identity-overview-section";
import { ProfileSection } from "@/src/components/identity-center/profile-section";
import { SecurityCenterSection } from "@/src/components/identity-center/security-center-section";
import { WalletCenterSection } from "@/src/components/identity-center/wallet-center-section";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

type IdentitySection = "overview" | "profile" | "wallets" | "security";

const sections: Array<{
  id: IdentitySection;
  label: string;
  description: string;
  icon: typeof IdCard;
}> = [
  {
    id: "overview",
    label: "Identity",
    description: "TIN, verification and linked identities",
    icon: IdCard,
  },
  {
    id: "profile",
    label: "Profile",
    description: "Display name and TrustLink handle",
    icon: UserRound,
  },
  {
    id: "wallets",
    label: "Wallets",
    description: "Payment and payout wallets",
    icon: WalletCards,
  },
  {
    id: "security",
    label: "Security",
    description: "PIN, recovery and account protection",
    icon: LockKeyhole,
  },
];

function normalizeSection(value: string | null): IdentitySection {
  return sections.some((section) => section.id === value)
    ? (value as IdentitySection)
    : "overview";
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function IdentityCenterExperience() {
  const searchParams = useSearchParams();
  const activeSection = normalizeSection(searchParams.get("section"));
  const {
    hydrated,
    accessToken,
    user,
    setUser,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession("/app/identity");

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell
      currentTab="identity"
      title="Identity Center"
      subtitle="Your TrustLink identity, verification, wallets and account protection live here."
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
      <section className="mx-auto w-full max-w-[980px] space-y-5">
        <div className="tl-panel overflow-hidden rounded-[28px]">
          <div className="relative overflow-hidden border-b border-[var(--field-border)] bg-accent-gradient px-5 py-5 sm:px-6">
            <div className="absolute right-[-8%] top-[-45%] h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent-border bg-[var(--accent-soft)] text-[0.76rem] font-bold text-accent-deep dark:text-accent">
                {initialsFor(user.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--text)]">
                    {user.displayName}
                  </h2>
                  {user.phoneVerifiedAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[0.62rem] font-medium text-accent">
                      <BadgeCheck className="h-3 w-3" />
                      WhatsApp verified
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[0.76rem] text-[var(--text-soft)]">
                  @{user.handle}
                  {user.tin ? ` · TIN ${user.tin}` : " · TIN not created"}
                </p>
              </div>
            </div>
          </div>

          <nav
            aria-label="Identity Center sections"
            className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <Link
                  key={section.id}
                  href={`/app/identity?section=${section.id}`}
                  className={`rounded-[18px] border px-3 py-3 transition-colors ${
                    active
                      ? "border-accent-border bg-accent-soft"
                      : "border-transparent hover:border-[var(--field-border)] hover:bg-[var(--surface-soft)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${
                        active
                          ? "text-accent"
                          : "text-[var(--text-faint)]"
                      }`}
                    />
                    <span className="text-[0.78rem] font-semibold text-[var(--text)]">
                      {section.label}
                    </span>
                  </span>
                  <span className="mt-1.5 hidden text-[0.62rem] leading-4 text-[var(--text-faint)] sm:block">
                    {section.description}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {activeSection === "overview" ? (
          <IdentityOverviewSection
            accessToken={accessToken}
            user={user}
            setUser={setUser}
          />
        ) : null}
        {activeSection === "profile" ? (
          <ProfileSection
            accessToken={accessToken}
            user={user}
            setUser={setUser}
          />
        ) : null}
        {activeSection === "wallets" ? (
          <WalletCenterSection accessToken={accessToken} />
        ) : null}
        {activeSection === "security" ? (
          <SecurityCenterSection
            accessToken={accessToken}
            user={user}
            setUser={setUser}
            onLogout={logout}
          />
        ) : null}
      </section>
    </AppMobileShell>
  );
}
