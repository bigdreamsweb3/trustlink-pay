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
    if (copyBusy || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(address);
      showToast("Wallet address copied.");
    } finally {
      window.setTimeout(() => setCopyBusy(false), 600);
    }
  }

  return (
    <AppSidePanel
      open={open}
      title={session ? session.walletName : "Connect Wallet"}
      kicker="Wallet"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">

        {session ? (
          <>
            {/* ── Address pill ── */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: "var(--accent)" }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
                </span>
                <span className="text-[0.72rem] font-medium" style={{ color: "var(--text-soft)" }}>Connected</span>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyAddress(session.address)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors cursor-pointer active:scale-[0.95]"
                style={{ background: "var(--surface-soft)", border: "1px solid var(--field-border)" }}
              >
                <span className="text-[0.68rem] font-medium" style={{ color: "var(--text-soft)" }}>{shortenAddress(session.address)}</span>
                <Copy className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
              </button>
            </div>

            {/* ── Balance card ── */}
            <div className="mt-4 rounded-[20px] p-4" style={{ background: "var(--field)", border: "1px solid var(--field-border)" }}>
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
                Total Balance
              </div>
              <div className="mt-2 text-[1.5rem] font-bold tracking-tight" style={{ color: "var(--text)" }}>
                {totalUsd}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="h-1 w-10 rounded-full" style={{ background: "var(--accent)" }} />
                <span className="text-[0.62rem] font-medium" style={{ color: "var(--text-faint)" }}>
                  {tokens.length} tokens
                </span>
              </div>
            </div>

            {/* ── Tab switcher ── */}
            <div className="mt-5 flex items-center gap-1 rounded-[14px] p-1" style={{ background: "var(--surface-soft)" }}>
              {(["stablecoins", "creator"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 rounded-[11px] px-3 py-2 text-center text-[0.74rem] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.97]"
                  style={activeTab === tab
                    ? { background: "var(--bg-elevated)", color: "var(--text)", boxShadow: "var(--shadow)" }
                    : { color: "var(--text-soft)" }
                  }
                >
                  {tab === "stablecoins" ? "Stablecoins" : "Creator Coins"}
                </button>
              ))}
            </div>

            {/* ── Token list ── */}
            <div className="mt-4 space-y-1.5">
              {tokens.map((token) => (
                <div
                  key={token.symbol}
                  className="flex items-center justify-between rounded-[16px] px-3.5 py-3 transition-colors hover:bg-[var(--surface-soft)]"
                  style={{ border: "1px solid var(--field-border)", background: "var(--field)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.78rem]"
                      style={{ background: "var(--surface-soft)", border: "1px solid var(--field-border)" }}
                    >
                      {token.icon}
                    </div>
                    <div>
                      <div className="text-[0.82rem] font-semibold leading-tight" style={{ color: "var(--text)" }}>{token.symbol}</div>
                      <div className="mt-0.5 text-[0.66rem] leading-tight" style={{ color: "var(--text-faint)" }}>{token.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.82rem] font-semibold leading-tight" style={{ color: "var(--text)" }}>{token.balance}</div>
                    <div className="mt-0.5 text-[0.66rem] leading-tight" style={{ color: "var(--text-faint)" }}>{token.usd}</div>
                  </div>
                </div>
              ))}

              {tokens.length === 0 ? (
                <div className="rounded-[16px] px-4 py-6 text-center text-[0.78rem]"
                  style={{ background: "var(--field)", border: "1px solid var(--field-border)", color: "var(--muted)" }}
                >
                  No tokens found
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
                className="flex w-full items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[0.82rem] font-semibold transition-colors cursor-pointer active:scale-[0.98]"
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid rgba(240, 128, 128, 0.10)",
                  color: "var(--danger)",
                }}
              >
                <LogOut className="h-4 w-4" />
                Disconnect Wallet
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── No wallet state ── */}
            <div className="flex flex-col items-center justify-center py-10">
              <div
                className="grid h-16 w-16 place-items-center rounded-full"
                style={{ background: "var(--surface-soft)", border: "1px solid var(--field-border)" }}
              >
                <Wallet className="h-7 w-7" style={{ color: "var(--text-faint)" }} />
              </div>
              <h3 className="mt-4 text-[0.95rem] font-semibold" style={{ color: "var(--text)" }}>
                No wallet connected
              </h3>
              <p className="mt-1.5 max-w-[260px] text-center text-[0.78rem] leading-relaxed" style={{ color: "var(--muted)" }}>
                {environment.helpMessage}
              </p>
            </div>

            <div className="flex-1" />

            <div className="pt-4 pb-2">
              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center justify-center rounded-[16px] px-4 py-3 text-[0.82rem] font-semibold transition-colors cursor-pointer active:scale-[0.98]"
                style={{
                  background: "var(--field)",
                  border: "1px solid var(--field-border)",
                  color: "var(--text)",
                }}
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
