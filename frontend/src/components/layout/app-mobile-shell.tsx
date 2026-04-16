"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { BackIcon, ClaimIcon, HomeIcon, SendIcon, SettingsIcon, WalletIcon } from "@/src/components/app-icons";
import { TrustLinkMark } from "@/src/components/trustlink-mark";
import type { UserProfile } from "@/src/lib/types";
import { useRouter } from "next/navigation";

type AppTab = "home" | "send" | "receive" | "claim" | "wallets" | "profile" | "settings";

type AppMobileShellProps = {
  currentTab: AppTab;
  title: string;
  subtitle: string;
  user: UserProfile;
  children: ReactNode;
  blockingOverlay?: ReactNode;
  showBackButton?: boolean;
  backHref?: Route;
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const desktopNavItems: Array<{ key: AppTab; href: Route; label: string; icon: ReactNode }> = [
  { key: "home", href: "/app", label: "Home", icon: <HomeIcon size={19} className="text-current" /> },
  { key: "send", href: "/app/send", label: "Send", icon: <SendIcon size={19} className="text-current" /> },
  { key: "claim", href: "/app/claim", label: "Claim", icon: <ClaimIcon size={19} className="text-current" /> },
  { key: "wallets", href: "/app/wallets", label: "Wallets", icon: <WalletIcon size={19} className="text-current" /> },
  { key: "settings", href: "/app/settings", label: "Settings", icon: <SettingsIcon size={19} className="text-current" /> }
];

const mobileNavItems: Array<{ key: AppTab; href: Route; label: string; icon: ReactNode }> = [
  { key: "home", href: "/app", label: "Home", icon: <HomeIcon size={20} className="text-current" /> },
  { key: "send", href: "/app/send", label: "Send", icon: <SendIcon size={20} className="text-current" /> },
  { key: "claim", href: "/app/claim", label: "Claim", icon: <ClaimIcon size={20} className="text-current" /> },
  { key: "wallets", href: "/app/wallets", label: "Wallets", icon: <WalletIcon size={20} className="text-current" /> },
  { key: "settings", href: "/app/settings", label: "Settings", icon: <SettingsIcon size={20} className="text-current" /> }
];

export function AppMobileShell({
  currentTab,
  title,
  subtitle,
  user,
  children,
  blockingOverlay = null,
  showBackButton = false,
  backHref = "/app"
}: AppMobileShellProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(backHref);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(88,242,177,0.14),transparent_28%),linear-gradient(180deg,#05090d_0%,#091019_100%)] pb-13 md:px-6 md:pt-6 md:pb-6">
      <div className="mx-auto md:grid md:max-w-[1180px] md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        <aside className="hidden md:sticky md:top-6 md:flex md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)] md:flex-col md:justify-between md:self-start md:overflow-hidden md:rounded-[32px] md:border md:border-white/8 md:bg-[#080b10]/92 md:p-5 md:shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
          <div>
            <div className="flex items-center gap-3 px-2">
              <TrustLinkMark />
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.22em] text-white/42">TrustLink</div>
                <div className="text-sm text-white/52">@{user.handle}</div>
              </div>
            </div>

            <nav aria-label="Sidebar navigation" className="mt-10 space-y-2">
              {desktopNavItems.map((item) => {
                const active = item.key === currentTab;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm font-medium transition ${active
                      ? "bg-[#58f2b1]/10 text-[#7dffd9] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      : "text-white/58 hover:bg-white/[0.04] hover:text-white/88"
                      }`}
                  >
                    <span className={`${active ? "text-[#7dffd9]" : "text-white/58"}`}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-col shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/app/profile")}
              className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-white/16 hover:bg-white/[0.05] button"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border border-[#76ffd8]/60 bg-[linear-gradient(135deg,rgba(118,255,216,0.18),rgba(255,255,255,0.06))] text-sm font-bold text-[#bfffe8]">
                {initialsFor(user.displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{user.displayName}</span>
                <span className="block truncate text-[0.76rem] text-white/46">@{user.handle}</span>
              </span>
            </button>
          </div>
        </aside>

        <div className="mx-auto w-full md:max-w-[430px]">
          <div className="min-h-screen overflow-hidden bg-[#080b10] md:min-h-[calc(100vh-3rem)] md:rounded-[34px] md:border md:border-white/8 md:shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
            <div className="relative min-h-screen bg-[radial-gradient(circle_at_16%_12%,rgba(88,242,177,0.1),transparent_22%),radial-gradient(circle_at_84%_10%,rgba(255,255,255,0.08),transparent_20%),linear-gradient(180deg,#0a0d12_0%,#090c11_100%)] px-5 pb-8 pt-3 md:min-h-[calc(100vh-3rem)]">

              <div className="min-w-0 mb-6">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      {showBackButton ? (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-white/58 transition hover:text-white/92"
                          aria-label="Go back"
                        >
                          <BackIcon className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                      ) : null}

                      <TrustLinkMark />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[0.68rem] uppercase tracking-[0.22em] text-white/38">TrustLink</span>
                      <span className="text-white/20">/</span>
                      <span className="text-[0.8rem] font-semibold tracking-[0.01em] text-[#86ffda]">
                        {title}
                      </span>
                    </div>

                    <p className="mt-2 max-w-[18.5rem] text-[0.88rem] leading-5.5 tracking-[-0.01em] text-white/56">{subtitle}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => router.push("/app/profile")}
                      className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-left shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition hover:border-white/16 hover:bg-white/[0.05]"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full border border-[#76ffd8]/60 bg-[linear-gradient(135deg,rgba(118,255,216,0.18),rgba(255,255,255,0.06))] text-sm font-bold text-[#bfffe8] button">
                        {initialsFor(user.displayName)}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {children}
            </div>
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary navigation"
        className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-1rem)] max-w-[398px] -translate-x-1/2 grid-cols-5 items-start gap-0.5 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,13,18,0.94)_0%,rgba(5,8,12,0.99)_100%)] px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl md:hidden"
      >
        {mobileNavItems.map((item) => {
          const active = item.key === currentTab;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`grid justify-items-center gap-0 rounded-[20px] px-1 py-1.5 text-center transition button ${active
                ? "bg-white/[0.04] text-[#86ffda] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                : "text-white/46 hover:bg-white/[0.02] hover:text-white/78"
                }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full transition ${active
                  ? "translate-y-[-1px] text-[#86ffda]"
                  : "opacity-80 text-current"
                  }`}
              >
                {item.icon}
              </span>
              <span className={`text-[0.68rem] font-medium tracking-[-0.01em] ${active ? "text-white" : "text-white/54"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {blockingOverlay}
    </main>
  );
}
