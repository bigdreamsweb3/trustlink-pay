"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, type ReactNode } from "react";

import { BackIcon, ClaimIcon, HomeIcon, SendIcon, SettingsIcon, WalletIcon } from "@/src/components/app-icons";
import { TrustLinkMark } from "@/src/components/trustlink-mark";
import type { UserProfile } from "@/src/lib/types";
import { useRouter } from "next/navigation";
import { getConnectedWalletAddress, type DetectedWallet } from "@/src/lib/wallet";
import { connectTrustLinkWallet, getWalletConnectionErrorMessage, getWalletsForConnection } from "@/src/lib/wallet-actions";
import { useToast } from "../toast-provider";


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

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [totalPendingUsd, setTotalPendingUsd] = useState<number>(0);

  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  async function handleConnectWallet() {
    setError(null);

    try {
      const wallets = getWalletsForConnection();
      setAvailableWallets(wallets);
      setWalletPickerOpen(true);
    } catch (walletError) {
      const nextError = getWalletConnectionErrorMessage(walletError);
      setError(nextError);
      showToast("No Solana wallet detected on this browser.");
    }
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(backHref);
  }

  return (
    <main className="min-h-screen bg-bg pb-13 md:px-6 md:pt-6 md:pb-6">
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
              onClick={() => router.push("/app/profile")}
              className="tl-field flex items-center gap-3 rounded-[22px] px-3 py-3 text-left transition button"
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

        <div className="mx-auto w-full md:max-w-[430px]">
          <div className="tl-phone-frame min-h-screen overflow-hidden md:min-h-[calc(100vh-3rem)] md:rounded-[34px]">
            <div className="tl-phone-screen tl-grid-overlay relative min-h-screen px-5 pb-8 pt-3 md:min-h-[calc(100vh-3rem)]">

              <div className="min-w-0 mb-6">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
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

                    {/* <div className="flex items-center gap-2">
                      <span className="tl-text-muted text-[0.68rem] uppercase tracking-[0.22em]">TrustLink</span>
                      <span className="tl-text-muted">/</span>
                      <span className="text-[0.8rem] font-semibold tracking-[0.01em] text-accent-deep dark:text-accent">
                        {title}
                      </span>
                    </div> */}
                    <p className="tl-text-soft mt-2 max-w-[17.75rem] text-[0.8rem] leading-5 tracking-[0.01em] opacity-88">
                      {subtitle}
                    </p>

                    <div className="tl-coord-text mt-2.5 flex items-center justify-between gap-2">


                      <div className="flex items-center gap-2">
                        <span>Sector </span>
                        <span className="opacity-45">::</span>
                        <span>{currentTab.toUpperCase()}</span>
                      </div>



                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.76rem] font-medium uppercase tracking-[0.16em] text-text/48 text-nowrap whitespace-nowrap flex justify-end">
                      {walletAddress
                        ? totalPendingUsd > 0
                          ? <div className="flex items-center gap-1.5 whitespace-nowrap text-accent-deep dark:text-accent button"><WalletIcon size={16} className="opacity-90" />  <div className="mt-1 text-end text-sm font-semibold text-muted">{walletAddress ? shortenAddress(walletAddress) : `loading...`}</div></div>
                          : <div className="flex items-center gap-1.5 whitespace-nowrap text-accent-deep dark:text-accent button"><WalletIcon size={16} className="opacity-90" /> <div className="mt-1 text-end text-sm font-semibold text-muted">{walletAddress ? shortenAddress(walletAddress) : `loading...`}</div> </div>
                        : totalPendingUsd > 0
                          ? "Claimable escrow available"
                          : <button type="button" onClick={() => void handleConnectWallet()} className="flex items-center gap-1.5 whitespace-nowrap text-accent-deep dark:text-accent button text-sm py-1 button"><WalletIcon size={16} className="opacity-90" /> Connect</button>}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push("/app/profile")}
                      className="tl-field grid h-12 w-12 place-items-center rounded-full text-left transition hover:bg-surface-soft"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-sm font-bold text-accent-deep dark:text-accent button">
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
        className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-1rem)] max-w-[398px] -translate-x-1/2 grid-cols-5 items-start gap-0.5 rounded-[28px] border border-[var(--dock-border)] bg-[var(--dock)] px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5  shadow-softbox  backdrop-blur-2xl md:hidden"
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
    </main>
  );
}
