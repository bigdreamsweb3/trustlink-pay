"use client";

import { LogOut, X } from "lucide-react";

import { WalletIcon } from "@/src/components/app-icons";
import { shortenAddress } from "@/src/lib/address";

type ConnectedWalletModalProps = {
  open: boolean;
  walletAddress: string | null;
  disconnecting?: boolean;
  onClose: () => void;
  onDisconnect: () => void;
};

export function ConnectedWalletModal({
  open,
  walletAddress,
  disconnecting = false,
  onClose,
  onDisconnect,
}: ConnectedWalletModalProps) {
  if (!open || !walletAddress) {
    return null;
  }

  return (
    <div
      className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center"
      onClick={onClose}
    >
      <div
        className="tl-modal w-full rounded-t-[28px] px-5 pb-6 pt-5 md:max-w-[430px] md:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connected wallet"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">
              Wallet
            </h2>
            <p className="tl-text-muted text-sm">
              Connected Web3 account for signing TrustLink actions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tl-field-btn grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--surface-soft)]"
            aria-label="Close wallet details"
          >
            <X size={16} className="text-current" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="tl-panel-header tl-field rounded-[22px] px-4 py-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="tl-icon-surface grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text)]">
                <WalletIcon size={18} className="text-current" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text)]">
                  Connected wallet
                </div>
                <div className="tl-text-muted text-[0.72rem]">
                  {shortenAddress(walletAddress, 6, 6)}
                </div>
              </div>
            </div>
            <div className="tl-text-muted break-all rounded-[16px] bg-[var(--surface-soft)] px-3 py-2 text-[0.72rem]">
              {walletAddress}
            </div>
          </div>

          <div className="tl-panel-header tl-field rounded-[22px] px-4 py-4">
            <div className="mb-1 text-sm font-semibold text-[var(--text)]">
              Wallet balances
            </div>
            <p className="tl-text-muted text-sm">
              Balance data is shown on dashboard panels that load token accounts for the connected wallet.
            </p>
          </div>

          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(255,90,90,0.28)] bg-[rgba(255,90,90,0.08)] px-4 py-3 text-sm font-semibold text-[rgb(220,55,55)] transition hover:bg-[rgba(255,90,90,0.12)] disabled:cursor-not-allowed disabled:opacity-60 dark:text-[rgb(255,145,145)]"
          >
            <LogOut size={16} className="text-current" />
            <span>{disconnecting ? "Disconnecting..." : "Disconnect wallet"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
