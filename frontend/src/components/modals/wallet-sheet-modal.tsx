"use client";

import { useState } from "react";
import { Copy, LogOut, Wallet } from "lucide-react";

import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import type { ConnectedWalletSession, WalletEnvironment } from "@/src/lib/wallet";

/* ── Mock data — replace with real data later ── */
type TokenEntry = { symbol: string; name: string; balance: string; usd: string; icon: string };

const MOCK_STABLECOINS: TokenEntry[] = [
  { symbol: "USDC", name: "USD Coin", balance: "142.50", usd: "$142.50", icon: "💲" },
  { symbol: "USDT", name: "Tether", balance: "0.00", usd: "$0.00", icon: "💲" },
  { symbol: "DAI", name: "Dai", balance: "25.80", usd: "$25.80", icon: "💲" },
];

const MOCK_CREATOR_COINS: TokenEntry[] = [
  { symbol: "BAGS", name: "Bags FM", balance: "1,200", usd: "$36.00", icon: "🎒" },
  { symbol: "VIBE", name: "VibeDAO", balance: "500", usd: "$12.50", icon: "🎵" },
];
/* ── End mock data ── */

type WalletTab = "stablecoins" | "creator";

export function WalletSheetModal({
  open,
  session,
  environment,
  onClose,
  onDisconnect,
  desktopInline = false,
}: {
  open: boolean;
  session: ConnectedWalletSession | null;
  environment: WalletEnvironment;
  onClose: () => void;
  onDisconnect: () => void | Promise<void>;
  desktopInline?: boolean;
}) {
  const { showToast } = useToast();
  const [copyBusy, setCopyBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<WalletTab>("stablecoins");

  const tokens = activeTab === "stablecoins" ? MOCK_STABLECOINS : MOCK_CREATOR_COINS;
  const totalUsd = activeTab === "stablecoins" ? "$168.30" : "$48.50";

  async function handleCopyAddress(address: string) {
    if (copyBusy || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    setCopyBusy(true);

    try {
      await navigator.clipboard.writeText(address);
      showToast("Wallet address copied.");
    } finally {
      window.setTimeout(() => {
        setCopyBusy(false);
      }, 600);
    }
  }

  return (
    <AppSidePanel
      open={open}
      title={session ? session.walletName : "Wallet connection"}
      kicker="Wallet"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">

        {session ? (
          <>
            {/* ── Wallet Header ── */}
            {/* <div className="flex items-center gap-3.5">
              <div className="tl-icon-surface grid h-12 w-12 shrink-0 place-items-center rounded-[16px]">
                <Wallet className="h-5 w-5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.95rem] font-semibold text-[var(--text)]">{session.walletName}</span>
                  <button
                    type="button"
                    onClick={() => void handleCopyAddress(session.address)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-soft)] transition-colors hover:text-[var(--text)] cursor-pointer active:scale-[0.9]"
                    aria-label="Copy wallet address"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="tl-text-soft mt-0.5 text-[0.76rem]">{shortenAddress(session.address)}</div>
              </div>
              <div className="flex items-center gap-1.5 rounded-[12px] bg-[var(--surface-soft)] px-2.5 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ae8c0]" />
                <span className="text-[0.68rem] font-medium text-[var(--text-soft)]">Active</span>
              </div>
            </div> */}

            {/* ── Balance Card ── */}
            <div className="tl-field mt-5 rounded-[22px] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
                  Total Balance
                </div>
                <div className="text-[0.68rem] font-medium text-[var(--text-soft)]">
                  {tokens.length} tokens
                </div>
              </div>
              <div className="mt-3 text-[1.5rem] font-bold tracking-tight text-[var(--text)]">
                {totalUsd}
              </div>
              <div className="mt-2 h-1 w-10 rounded-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" />
            </div>

            {/* ── Tab Switcher ── */}
            <div className="mt-5 flex items-center gap-1 rounded-[14px] bg-[var(--surface-soft)] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("stablecoins")}
                className={`flex-1 rounded-[11px] px-3 py-2.5 text-center text-[0.76rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.97] ${activeTab === "stablecoins"
                  ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-soft)]"
                  }`}
              >
                Stablecoins
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("creator")}
                className={`flex-1 rounded-[11px] px-3 py-2.5 text-center text-[0.76rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.97] ${activeTab === "creator"
                  ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-soft)]"
                  }`}
              >
                Creator Coins
              </button>
            </div>

            {/* ── Token List ── */}
            <div className="mt-4 space-y-2">
              {tokens.map((token) => (
                <div
                  key={token.symbol}
                  className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.82rem]">
                      {token.icon}
                    </span>
                    <span>
                      <span className="block text-[0.84rem] font-semibold leading-tight text-[var(--text)]">{token.symbol}</span>
                      <span className="tl-text-soft block mt-0.5 text-[0.68rem] leading-tight">{token.name}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[0.84rem] font-semibold leading-tight text-[var(--text)]">{token.balance}</span>
                    <span className="tl-text-soft block mt-0.5 text-[0.68rem] leading-tight">{token.usd}</span>
                  </span>
                </div>
              ))}

              {tokens.length === 0 ? (
                <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">
                  No tokens found.
                </div>
              ) : null}
            </div>

            {/* ── Spacer ── */}
            <div className="flex-1" />

            {/* ── Disconnect ── */}
            <div className="pt-6 pb-2">
              <button
                type="button"
                onClick={() => void onDisconnect()}
                className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3.5 text-[0.84rem] font-semibold text-[#ffb1b1] transition-colors hover:bg-[#ff7f7f]/14 cursor-pointer active:scale-[0.98]"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── No Wallet ── */}
            <div className="flex items-center gap-3.5">
              <div className="tl-icon-surface grid h-12 w-12 shrink-0 place-items-center rounded-[16px]">
                <Wallet className="h-5 w-5 text-[var(--text-soft)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[0.95rem] font-semibold text-[var(--text)]">No wallet connected</div>
                <div className="tl-text-soft mt-0.5 text-[0.76rem] leading-relaxed">{environment.helpMessage}</div>
              </div>
            </div>

            <div className="flex-1" />

            <div className="pt-6 pb-2">
              <button
                type="button"
                onClick={onClose}
                className="tl-button-secondary w-full rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-semibold transition-colors cursor-pointer hover:opacity-90 active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </AppSidePanel>
  );
}