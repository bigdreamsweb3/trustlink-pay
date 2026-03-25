"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { BackIcon, HomeIcon, ProfileIcon, ReceiveIcon, SendIcon } from "@/src/components/app-icons";
import { TrustLinkMark } from "@/src/components/trustlink-mark";
import type { UserProfile } from "@/src/lib/types";
import { useRouter } from "next/navigation";

type AppTab = "home" | "send" | "receive" | "profile";

type AppMobileShellProps = {
  currentTab: AppTab;
  title: string;
  subtitle: string;
  user: UserProfile;
  children: ReactNode;
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

const navItems: Array<{ key: AppTab; href: Route; label: string; icon: ReactNode }> = [
  { key: "home", href: "/app", label: "Home", icon: <HomeIcon className="h-[1.05rem] w-[1.05rem]" /> },
  { key: "send", href: "/app/send", label: "Send", icon: <SendIcon className="h-[1.05rem] w-[1.05rem]" /> },
  { key: "receive", href: "/app/receive", label: "Receive", icon: <ReceiveIcon className="h-[1.05rem] w-[1.05rem]" /> },
  { key: "profile", href: "/app/profile", label: "Profile", icon: <ProfileIcon className="h-[1.05rem] w-[1.05rem]" /> }
];

export function AppMobileShell({ currentTab, title, subtitle, user, children, showBackButton = false, backHref = "/app" }: AppMobileShellProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(backHref);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(88,242,177,0.14),transparent_28%),linear-gradient(180deg,#05090d_0%,#091019_100%)] pb-28 md:px-6 md:py-6 md:pb-6">
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
              {navItems.map((item) => {
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

          <button
            type="button"
            onClick={() => router.push("/app/profile")}
            className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-white/16 hover:bg-white/[0.05]"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#76ffd8]/60 bg-[linear-gradient(135deg,rgba(118,255,216,0.18),rgba(255,255,255,0.06))] text-sm font-bold text-[#bfffe8]">
              {initialsFor(user.displayName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{user.displayName}</span>
              <span className="block truncate text-[0.76rem] text-white/46">@{user.handle}</span>
            </span>
          </button>
        </aside>

        <div className="mx-auto w-full md:max-w-[430px]">
          <div className="min-h-screen overflow-hidden bg-[#080b10] md:min-h-[calc(100vh-3rem)] md:rounded-[34px] md:border md:border-white/8 md:shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
            <div className="relative min-h-screen bg-[radial-gradient(circle_at_16%_12%,rgba(88,242,177,0.1),transparent_22%),radial-gradient(circle_at_84%_10%,rgba(255,255,255,0.08),transparent_20%),linear-gradient(180deg,#0a0d12_0%,#090c11_100%)] px-5 pb-8 pt-6 md:min-h-[calc(100vh-3rem)]">

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

                    <p className="mt-2.5 max-w-[19rem] text-[0.92rem] leading-6 text-white/50">{subtitle}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/app/profile")}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-left shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition hover:border-white/16 hover:bg-white/[0.05]"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-[#76ffd8]/60 bg-[linear-gradient(135deg,rgba(118,255,216,0.18),rgba(255,255,255,0.06))] text-sm font-bold text-[#bfffe8]">
                      {initialsFor(user.displayName)}
                    </span>
                  </button>
                </div>
              </div>

              {children}
            </div>
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 right-0 z-40 mx-auto grid w-full max-w-[430px] grid-cols-4 gap-1 rounded-t-[26px] border-t border-white/10 bg-black/70 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl md:hidden"
      >
        {navItems.map((item) => {
          const active = item.key === currentTab;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`grid justify-items-center gap-1 rounded-[18px] px-2 py-2 text-center transition ${active
                ? "bg-white/10 text-[#7dffd9] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-white/55 hover:bg-white/5 hover:text-white/88"
                }`}
            >
              <span className={`grid place-items-center ${active ? "text-[#7dffd9]" : ""}`}>{item.icon}</span>
              <span className="text-[0.72rem] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
