"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

import { BackIcon, ClaimIcon, HomeIcon, SendIcon, SettingsIcon, WalletIcon } from "@/src/components/app-icons";
import { ProfileSheetModal } from "@/src/components/modals/profile-sheet-modal";
import { SettingsSheetModal } from "@/src/components/modals/settings-sheet-modal";
import { WalletSheetModal } from "@/src/components/modals/wallet-sheet-modal";
import { TrustLinkMark } from "@/src/components/trustlink-mark";
import { useAppPanel } from "@/src/lib/app-panel-provider";
import type { UserProfile } from "@/src/lib/types";
import { useRouter } from "next/navigation";
import { useWallet } from "@/src/lib/wallet-provider";

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

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

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
  const { activePanel, openPanel, closePanel } = useAppPanel();
  const {
    walletAddress,
    session,
    environment,
    disconnectWallet,
    requestWalletConnection,
  } = useWallet();
  const walletPanelOpen = activePanel === "wallet";
  const settingsPanelOpen = activePanel === "settings";
  const profilePanelOpen = activePanel === "profile";
  const desktopPanelOpen = walletPanelOpen || settingsPanelOpen || profilePanelOpen;
  const [mobileHeaderScrolled, setMobileHeaderScrolled] = useState(false);
  const frameScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleWindowScroll() {
      setMobileHeaderScrolled(window.scrollY > 8);
    }

    handleWindowScroll();
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, []);

  function handleShellScroll(event: UIEvent<HTMLDivElement>) {
    setMobileHeaderScrolled(event.currentTarget.scrollTop > 8);
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(backHref);
  }

  function handleWalletButtonPress() {
    if (walletAddress) {
      openPanel("wallet");
      return;
    }

    requestWalletConnection();
  }

  return (
    <main className="min-h-screen bg-bg pb-0 md:px-6 md:pt-6 md:pb-6">
      <div className="mx-auto md:grid md:max-w-[1180px] md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        <aside className="tl-sidebar hidden md:sticky md:top-6 md:flex md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)] md:flex-col md:justify-between md:self-start md:overflow-hidden md:rounded-[32px] md:p-5">
          <div>
            <div className="flex items-center gap-3 px-2">
              <TrustLinkMark />
              <div>
                <div className="tl-text-muted text-[0.68rem] uppercase tracking-[0.22em]">TrustLink</div>
                <div className="tl-text-soft text-sm">@{user.handle}</div>
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
                      ? "tl-badge  shadow-softbox "
                      : "tl-text-soft hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                      }`}
                  >
                    <span className={`${active ? "text-[var(--accent-deep)] dark:text-[var(--accent)]" : "tl-text-soft"}`}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-col shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => openPanel("profile")}
              className="tl-field-btn flex items-center gap-3 rounded-[22px] px-3 py-3 text-left transition button"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-sm font-bold text-accent-deep dark:text-accent">
                {initialsFor(user.displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text">{user.displayName}</span>
                <span className="tl-text-muted block truncate text-[0.76rem]">@{user.handle}</span>
              </span>
            </button>
          </div>
        </aside>

        <div className="mx-auto w-full md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)] md:overflow-x-auto">

          <div
            className={`md:grid md:w-fit md:min-w-full md:items-start md:justify-center ${desktopPanelOpen
              ? "md:grid-cols-[minmax(390px,430px)_360px] md:gap-6"
              : "md:grid-cols-[minmax(390px,430px)] md:gap-0"
              }`}
          >
            <div
              ref={frameScrollRef}
              onScroll={handleShellScroll}
              className="min-w-0 md:w-[min(100%,430px)] md:min-w-[390px] tl-scrollbar-mobile-hidden md:overflow-y-auto md:min-h-[calc(100vh-3rem)] md:rounded-[34px] md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)] min-h-screen overflow-x-clip md:overflow-x-hidden"
            >
              <div
                className="tl-phone-frame"
              >
                <div className="tl-phone-screen tl-grid-overlay relative min-h-screen px-5 pb-8 pt-0 md:min-h-[calc(97vh-3rem)]">
                  {/* MOBILE HEADER */}
                  <div
                    className={`sticky top-0 z-[100] -mx-5 h-14 w-[calc(100%+2.5rem)] px-5 pt-1 transition-all duration-300 ease-out grid grid-cols-1 items-center ${mobileHeaderScrolled
                      ? "bg-[var(--phone-shell)] shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                      : "bg-transparent backdrop-blur-0"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4 my-auto">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {showBackButton ? (
                            <button
                              type="button"
                              onClick={handleBack}
                              className="tl-text-soft inline-flex items-center gap-1.5 text-[0.8rem] font-medium transition hover:text-[var(--text)]"
                              aria-label="Go back"
                            >
                              <BackIcon className="h-4 w-4" />
                              <span>Back</span>
                            </button>
                          ) : null}

                          <TrustLinkMark />
                        </div>
                        <h1 className="sr-only">
                          {title}
                        </h1>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={handleWalletButtonPress}
                          className="tl-field-btn flex h-10 items-center gap-1.5 rounded-full px-3 transition hover:bg-surface-soft button"
                          aria-label={walletAddress ? "Manage wallet connection" : "Connect wallet"}
                        >
                          <WalletIcon size={15} className="text-current" />
                          <span className="tl-coord-text !text-[0.56rem] leading-none">
                            {walletAddress ? shortenAddress(walletAddress) : "Connect"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openPanel("settings")}
                          className="tl-field-btn grid h-10 w-10 place-items-center rounded-full transition hover:bg-surface-soft button"
                          aria-label="Open settings"
                        >
                          <span className="grid h-5 w-5 place-items-center">
                            <SettingsIcon size={16} className="text-current" />
                          </span>
                        </button>

                        {/* PROFILE BUTTON */}
                        {/* <button
                          type="button"
                          onClick={() => openPanel("profile")}
                          className="tl-field-btn grid h-10 w-10 place-items-center rounded-full text-left transition hover:bg-surface-soft button"
                          aria-label="Open profile"
                        >
                          <span className="grid h-10 w-10 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-[0.72rem] font-bold text-accent-deep dark:text-accent">
                            {initialsFor(user.displayName)}
                          </span>
                        </button> */}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 mb-6">

                    <div className="tl-coord-text mt-3 flex w-full items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="opacity-58">Sector</span>
                        <span className="opacity-40">//</span>
                        <span className="truncate">{currentTab.toUpperCase()}</span>
                      </div>

                      <div className="flex min-w-0 items-center justify-end gap-1.5 text-right">
                        <span className="truncate">@{user.handle}</span>
                      </div>
                    </div>

                    <p className="tl-text-soft mt-2 max-w-[17.75rem] text-[0.8rem] leading-5 tracking-[0.01em] opacity-88">
                      {subtitle}
                    </p>
                  </div>
                  <div className="min-w-0 mb-20"> {children}</div>

                </div>
              </div>
            </div>

            {desktopPanelOpen ? (
              <div className="h-full flex flex-row items-start">
                <div className="relative hidden md:sticky md:top-3 md:block md:h-[calc(94vh-3rem)] md:w-[360px] md:min-w-[340px] md:self-start">

                  <WalletSheetModal
                    open={walletPanelOpen}
                    session={session}
                    environment={environment}
                    desktopInline
                    onClose={closePanel}
                    onDisconnect={() => {
                      void disconnectWallet();
                    }}
                  />
                  <SettingsSheetModal
                    open={settingsPanelOpen}
                    user={user}
                    desktopInline
                    onClose={closePanel}
                  />
                  <ProfileSheetModal
                    open={profilePanelOpen}
                    user={user}
                    desktopInline
                    onClose={closePanel}
                  />
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>

      <nav
        aria-label="Primary navigation"
        className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-1rem)] max-w-[398px] -translate-x-1/2 grid-cols-5 items-start gap-0.5 rounded-[28px] border border-[var(--dock-border)] bg-[var(--dock)] px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5  shadow-softbox  backdrop-blur-2xl md:hidden max-h-21"
      >
        {mobileNavItems.map((item) => {
          const active = item.key === currentTab;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`grid justify-items-center gap-0 rounded-[20px] px-1 py-1.5 text-center transition button ${active
                ? "tl-badge  shadow-softbox "
                : "tl-text-muted hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full transition ${active
                  ? "translate-y-[-1px] text-[var(--accent-deep)] dark:text-[#86ffda]"
                  : "opacity-80 text-current"
                  }`}
              >
                {item.icon}
              </span>
              <span className={`text-[0.68rem] font-medium tracking-[-0.01em] ${active ? "text-[var(--text)]" : "tl-text-muted"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {blockingOverlay}
      <WalletSheetModal
        open={walletPanelOpen}
        session={session}
        environment={environment}
        onClose={closePanel}
        onDisconnect={() => {
          void disconnectWallet();
        }}
      />
      <SettingsSheetModal
        open={settingsPanelOpen}
        user={user}
        onClose={closePanel}
      />
      <ProfileSheetModal
        open={profilePanelOpen}
        user={user}
        onClose={closePanel}
      />
    </main>
  );
}
