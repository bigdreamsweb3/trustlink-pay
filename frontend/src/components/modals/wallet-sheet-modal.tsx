"use client";

import { useState } from "react";
import { Copy, LogOut, Wallet } from "lucide-react";

import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useToast } from "@/src/components/toast-provider";
import type { ConnectedWalletSession, WalletEnvironment } from "@/src/lib/wallet";

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

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
      {session ? (
        <section className="tl-panel rounded-[26px] p-4">
          <div className="flex items-start gap-3">
            <div className="tl-icon-surface grid h-12 w-12 shrink-0 place-items-center rounded-[16px]">
              <Wallet className="h-5 w-5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[0.92rem] font-semibold text-[var(--text)]">
                Connected wallet
              </div>
              <div className="tl-text-soft mt-1 text-[0.8rem] leading-5">
                {shortenAddress(session.address)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-3.5">
            <div className="tl-text-muted text-[0.66rem] uppercase tracking-[0.18em]">
              Address
            </div>
            <div className="mt-1.5 break-all text-[0.86rem] font-medium leading-5 text-[var(--text)]">
              {session.address}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleCopyAddress(session.address)}
              className="tl-field button grid h-11 w-11 place-items-center rounded-full transition hover:bg-[var(--surface-soft)]"
              aria-label="Copy wallet address"
            >
              <Copy className="h-4.5 w-4.5 text-[var(--text-soft)]" />
            </button>

            <button
              type="button"
              onClick={() => void onDisconnect()}
              className="button grid h-11 w-11 place-items-center rounded-full border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 transition hover:bg-[#ff7f7f]/12"
              aria-label="Disconnect wallet"
            >
              <LogOut className="h-4.5 w-4.5 text-[#ffb1b1]" />
            </button>
          </div>
        </section>
      ) : (
        <section className="tl-panel rounded-[26px] p-4">
          <div className="flex items-start gap-3">
            <div className="tl-icon-surface grid h-12 w-12 shrink-0 place-items-center rounded-[16px]">
              <Wallet className="h-5 w-5 text-[var(--accent-deep)] dark:text-[var(--accent)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[0.92rem] font-semibold text-[var(--text)]">
                No wallet connected
              </div>
              <div className="tl-text-soft mt-1 text-[0.8rem] leading-5">
                {environment.helpMessage}
              </div>
            </div>
          </div>
        </section>
      )}
    </AppSidePanel>
  );
}
