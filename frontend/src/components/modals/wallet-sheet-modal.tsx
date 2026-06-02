"use client";

import { useEffect, useState, useMemo } from "react";
import { LogOut, Wallet } from "lucide-react";
import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiPost } from "@/src/lib/api";
import { formatPaymentUsd } from "@/src/lib/payment-display";
import type { WalletTokenOption } from "@/src/lib/types";
import type { ConnectedWalletSession, WalletEnvironment } from "@/src/lib/wallet";

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
  const [walletTokens, setWalletTokens] = useState<WalletTokenOption[]>([]);
  const [walletTokenLoading, setWalletTokenLoading] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    if (!open || !session?.address) return;
    
    const ctrl = new AbortController();
    async function load() {
      setWalletTokenLoading(true);
      try {
        const r = await apiPost<{ tokens: WalletTokenOption[] }>(
          "/api/wallet/tokens",
          { walletAddress: session!.address },
          undefined,
          { cache: "default", ttlMs: 20_000 }
        );
        if (!ctrl.signal.aborted) setWalletTokens(r.tokens.filter((t) => t.supported));
      } catch {
        if (!ctrl.signal.aborted) setWalletTokens([]);
      } finally {
        if (!ctrl.signal.aborted) setWalletTokenLoading(false);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [open, session?.address]);

  const supportedBalanceUsd = useMemo(
    () => walletTokens.reduce((s, t) => s + (t.balanceUsd ?? 0), 0),
    [walletTokens]
  );

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
      kicker="Wallet Details"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">
        {session ? (
          <>
            {/* ── Address pill ── */}
            <div className="flex items-center justify-between mt-4 mb-2">
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
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.95]"
                style={{ border: "1px solid var(--field-border)" }}
              >
                <span className="text-[0.68rem] font-medium" style={{ color: "var(--text)" }}>{shortenAddress(session.address)}</span>
              </button>
            </div>

            {/* ── Wallet Tokens (Dashboard Design) ── */}
            <div className="tl-field mt-4 rounded-[18px] px-4 py-4">
              <div className="mb-4">
                <div className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-[var(--text-faint)]">Total Balance</div>
                <div className="mt-1 text-[1.4rem] font-bold tracking-tight text-[var(--text)]">
                  {walletTokenLoading ? "..." : formatPaymentUsd(supportedBalanceUsd)}
                </div>
              </div>

              {walletTokenLoading ? (
                <div className="space-y-3 py-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                        <div className="h-3 w-14 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                      </div>
                      <div className="h-3.5 w-16 animate-pulse rounded-full bg-[var(--surface-soft)]" />
                    </div>
                  ))}
                </div>
              ) : walletTokens.length === 0 ? (
                <div className="py-4 text-center text-[0.78rem] text-[var(--muted)] border-t border-[var(--field-border)]">
                  No supported tokens found
                </div>
              ) : (
                <div className="border-t border-[var(--field-border)] pt-2 mt-2">
                  {walletTokens.map((token) => (
                    <div key={token.symbol} className="flex items-center justify-between py-2.5 first:pt-2 last:pb-0">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] text-[0.56rem] font-bold text-accent">
                          {token.symbol.slice(0, 3)}
                        </div>
                        <span className="tl-body-sm font-medium text-[var(--text)]">{token.symbol}</span>
                      </div>
                      <span className="tl-body-sm font-semibold text-[var(--text)]">
                        {formatPaymentUsd(token.balanceUsd ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Spacer ── */}
            <div className="flex-1" />

            {/* ── Disconnect ── */}
            <div className="pt-6 pb-2">
              <button
                type="button"
                onClick={() => void onDisconnect()}
                className="flex w-full items-center justify-center gap-2 rounded-[16px] px-4 py-3.5 text-[0.82rem] font-semibold transition-colors cursor-pointer active:scale-[0.98]"
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid rgba(240, 128, 128, 0.15)",
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
                className="flex w-full items-center justify-center rounded-[16px] px-4 py-3.5 text-[0.82rem] font-semibold transition-colors cursor-pointer active:scale-[0.98]"
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
