"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type ReactNode } from "react";

import { BackIcon, ClaimIcon, HomeIcon, SendIcon, SettingsIcon, WalletIcon } from "@/src/components/app-icons";
import { ProfileSheetModal } from "@/src/components/modals/profile-sheet-modal";
import { SettingsSheetModal } from "@/src/components/modals/settings-sheet-modal";
import { WalletSheetModal } from "@/src/components/modals/wallet-sheet-modal";
import { TrustLinkMark } from "@/src/components/trustlink-mark";
import { shortenAddress } from "@/src/lib/address";
import { useAppPanel } from "@/src/lib/app-panel-provider";
import type { UserProfile } from "@/src/lib/types";
import { useRouter } from "next/navigation";
import { useWallet } from "@/src/lib/wallet-provider";
import ExpandableMetaRow from "../ui/ExpandableMetaRow";

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
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const sidebarNavItems: Array<{ key: AppTab; href: Route; label: string; icon: ReactNode }> = [
  { key: "home", href: "/app", label: "Home", icon: <HomeIcon size={18} className="text-current" /> },
  { key: "send", href: "/app/send", label: "Send", icon: <SendIcon size={18} className="text-current" /> },
  { key: "claim", href: "/app/claim", label: "Claim", icon: <ClaimIcon size={18} className="text-current" /> },
  { key: "wallets", href: "/app/wallets", label: "Wallets", icon: <WalletIcon size={18} className="text-current" /> },
  { key: "settings", href: "/app/settings", label: "Settings", icon: <SettingsIcon size={18} className="text-current" /> },
];

const mobileNavItems: Array<{ key: AppTab; href: Route; label: string; icon: ReactNode }> = [
  { key: "home", href: "/app", label: "Home", icon: <HomeIcon size={18} className="text-current" /> },
  { key: "send", href: "/app/send", label: "Send", icon: <SendIcon size={18} className="text-current" /> },
  { key: "claim", href: "/app/claim", label: "Claim", icon: <ClaimIcon size={18} className="text-current" /> },
  { key: "wallets", href: "/app/wallets", label: "Wallets", icon: <WalletIcon size={18} className="text-current" /> },
  { key: "settings", href: "/app/settings", label: "Settings", icon: <SettingsIcon size={18} className="text-current" /> },
];

export function AppMobileShell({
  currentTab, title, subtitle, user, children, blockingOverlay = null, showBackButton = false, backHref = "/app"
}: AppMobileShellProps) {
  const router = useRouter();
  const { activePanel, openPanel, closePanel } = useAppPanel();
  const { walletAddress, session, environment, disconnectWallet, requestWalletConnection } = useWallet();
  const walletPanelOpen = activePanel === "wallet";
  const settingsPanelOpen = activePanel === "settings";
  const profilePanelOpen = activePanel === "profile";
  const desktopPanelOpen = walletPanelOpen || settingsPanelOpen || profilePanelOpen;
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => { function h() { setHeaderScrolled(window.scrollY > 8); } h(); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  function handleBack() { if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; } router.push(backHref); }
  function handleWalletButtonPress() { if (walletAddress) { openPanel("wallet"); return; } requestWalletConnection(); }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto flex h-full max-w-[1400px]">

        {/* ═══ DESKTOP SIDEBAR ═══ */}
        <aside className="tl-sidebar hidden md:sticky md:top-0 md:flex md:h-screen md:w-[240px] md:shrink-0 md:flex-col md:justify-between md:border-r md:border-[var(--field-border)] md:px-4 md:py-6">
          <div>
            <div className="flex items-center gap-3 px-2 mb-8">
              <TrustLinkMark />
              <div className="min-w-0">
                <div className="tl-text-muted text-[0.6rem] uppercase tracking-[0.22em] leading-none">TrustLink</div>
                <div className="tl-text-soft mt-0.5 truncate text-[0.78rem] leading-tight">@{user.handle}</div>
              </div>
            </div>
            <nav aria-label="Sidebar navigation" className="space-y-1">
              {sidebarNavItems.map((item) => {
                const active = item.key === currentTab;
                return (
                  <Link key={item.key} href={item.href}
                    className={`group relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[0.84rem] font-medium transition-all duration-200 ${active ? "tl-badge shadow-softbox" : "tl-text-soft hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"}`}
                  >
                    {active ? <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" /> : null}
                    <span className={`transition-colors ${active ? "text-[var(--accent-deep)] dark:text-[var(--accent)]" : "tl-text-soft group-hover:text-[var(--text-soft)]"}`}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <button type="button" onClick={() => openPanel("profile")} className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.98]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] text-[0.6rem] font-bold text-accent-deep dark:text-accent">{initialsFor(user.displayName)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.82rem] font-semibold leading-tight text-text">{user.displayName}</span>
              <span className="tl-text-muted block truncate text-[0.66rem] leading-tight mt-0.5">@{user.handle}</span>
            </span>
          </button>
        </aside>

        {/* ═══ MAIN CONTENT ═══ */}
        <div className="flex min-w-0 flex-1 flex-col">

          {/* Desktop top bar */}
          <header className={`hidden md:flex items-center justify-between gap-4 px-6 py-4 sticky top-0 z-50 transition-all duration-200 ${headerScrolled ? "bg-bg/90 backdrop-blur-lg border-b border-[var(--field-border)]" : "bg-transparent"}`}>
            <div className="flex items-center gap-3">
              {showBackButton ? (
                <button type="button" onClick={handleBack} className="tl-text-soft inline-flex items-center gap-1.5 text-[0.82rem] font-medium transition hover:text-[var(--text)] cursor-pointer active:scale-[0.97]">
                  <BackIcon className="h-4 w-4" />
                  <span>Back</span>
                </button>
              ) : null}
              <h1 className="text-[1rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleWalletButtonPress} className="tl-field-btn flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-[0.76rem] transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.97]" aria-label={walletAddress ? "Manage wallet" : "Connect wallet"}>
                <WalletIcon size={14} className="text-current" />
                <span className="font-medium">{walletAddress ? shortenAddress(walletAddress) : "Connect"}</span>
              </button>
              <button type="button" onClick={() => openPanel("settings")} className="tl-field-btn grid h-9 w-9 place-items-center rounded-[12px] transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.97]" aria-label="Settings">
                <SettingsIcon size={15} className="text-current" />
              </button>
            </div>
          </header>

          {/* Mobile top bar */}
          <header className={`md:hidden sticky top-0 z-50 flex items-center justify-between gap-3 px-4 h-12 transition-all duration-200 ${headerScrolled ? "bg-bg/90 backdrop-blur-lg border-b border-[var(--field-border)]" : "bg-transparent"}`}>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {showBackButton ? (
                <button type="button" onClick={handleBack} className="tl-text-soft inline-flex items-center gap-1 text-[0.74rem] font-medium transition hover:text-[var(--text)] cursor-pointer active:scale-[0.95]" aria-label="Go back">
                  <BackIcon className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
              ) : null}
              <TrustLinkMark />
              {!showBackButton ? <div className="tl-text-muted text-[0.6rem] uppercase tracking-[0.22em] leading-none">TrustLink</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={handleWalletButtonPress} className="tl-field-btn flex h-8 items-center gap-1 rounded-full px-2.5 transition-colors hover:bg-surface-soft cursor-pointer active:scale-[0.96]">
                <WalletIcon size={13} className="text-current" />
                <span className="tl-coord-text !text-[0.52rem] leading-none">{walletAddress ? shortenAddress(walletAddress) : "Connect"}</span>
              </button>
              <button type="button" onClick={() => openPanel("settings")} className="tl-field-btn grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-surface-soft cursor-pointer active:scale-[0.96]" aria-label="Settings">
                <SettingsIcon size={14} className="text-current" />
              </button>
            </div>
          </header>

          {/* Page content area */}
          <div className="flex min-w-0 flex-1">
            <div className="min-w-0 flex-1 px-4 pb-24 md:px-6 md:pb-8">
              {/* Mobile breadcrumb */}
              <div className="md:hidden min-w-0 mb-4">
                <div className="tl-coord-text mt-2">
                  <div className="flex w-full items-center justify-between gap-2 text-[0.66rem] leading-4 tracking-[0.01em]">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="opacity-45">Sector</span>
                      <span className="opacity-25">›</span>
                      <span className="text-accent font-medium">{currentTab.toUpperCase()}</span>
                    </div>
                    <ExpandableMetaRow currentTab={currentTab} subtitle={subtitle} />
                  </div>
                </div>
              </div>

              {/* Desktop subtitle */}
              <div className="hidden md:block mb-6">
                <p className="text-[0.82rem] text-[var(--text-soft)] max-w-[500px]">{subtitle}</p>
              </div>

              {children}
            </div>

            {/* Desktop inline side panel */}
            {desktopPanelOpen ? (
              <div className="hidden md:block">
                <WalletSheetModal open={walletPanelOpen} session={session} environment={environment} desktopInline onClose={closePanel} onDisconnect={() => { void disconnectWallet(); }} />
                <SettingsSheetModal open={settingsPanelOpen} user={user} desktopInline onClose={closePanel} />
                <ProfileSheetModal open={profilePanelOpen} user={user} desktopInline onClose={closePanel} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ═══ MOBILE BOTTOM DOCK ═══ */}
      <nav aria-label="Primary navigation" className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-1rem)] max-w-[398px] -translate-x-1/2 grid-cols-5 items-start gap-0 rounded-[24px] border border-[var(--dock-border)] bg-[var(--dock)] px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 shadow-softbox backdrop-blur-2xl md:hidden">
        {mobileNavItems.map((item) => {
          const active = item.key === currentTab;
          return (
            <Link key={item.key} href={item.href}
              className={`grid justify-items-center gap-0.5 rounded-[16px] px-1 py-1.5 text-center transition-all duration-200 cursor-pointer ${active ? "tl-badge shadow-softbox" : "tl-text-muted hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"}`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full transition-transform duration-200 ${active ? "translate-y-[-1px] text-[var(--accent-deep)] dark:text-[#86ffda]" : "opacity-80 text-current"}`}>{item.icon}</span>
              <span className={`text-[0.58rem] font-medium tracking-[-0.01em] leading-tight ${active ? "text-[var(--text)]" : "tl-text-muted"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile overlay modals */}
      {blockingOverlay}
      <WalletSheetModal open={walletPanelOpen} session={session} environment={environment} onClose={closePanel} onDisconnect={() => { void disconnectWallet(); }} />
      <SettingsSheetModal open={settingsPanelOpen} user={user} onClose={closePanel} />
      <ProfileSheetModal open={profilePanelOpen} user={user} onClose={closePanel} />
    </main>
  );
}
