"use client";

import type { DetectedWallet } from "@/src/lib/wallet";

function walletBadge(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WalletPickerModal({
  open,
  wallets,
  connectingWalletId,
  emptyStateMessage,
  onClose,
  onSelect
}: {
  open: boolean;
  wallets: DetectedWallet[];
  connectingWalletId: string | null;
  emptyStateMessage?: string;
  onClose: () => void;
  onSelect: (walletId: string) => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center" onClick={onClose}>
      <div
        className="tl-modal w-full rounded-t-[28px] px-5 pb-6 pt-5 md:max-w-[430px] md:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Choose wallet</h2>
          <p className="tl-text-muted text-sm">Connect any installed Solana wallet on this device.</p>
        </div>

        {wallets.length === 0 ? (
          <div className="tl-field rounded-[22px] px-4 py-4 text-sm tl-text-soft">
            {emptyStateMessage ?? "No Solana wallet was detected in this browser. Install or open a Solana wallet app, then try again."}
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map((wallet) => {
              const busy = connectingWalletId === wallet.id;

              return (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => onSelect(wallet.id)}
                  disabled={Boolean(connectingWalletId)}
                  className="tl-field flex w-full items-center justify-between rounded-[22px] px-4 py-4 text-left transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="tl-icon-surface grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-[var(--text)]">
                      {walletBadge(wallet.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text)]">{wallet.name}</span>
                      <span className="tl-text-muted block text-[0.72rem]">Installed on this browser</span>
                    </span>
                  </span>
                  <span className="tl-text-muted text-xs font-medium">{busy ? "Connecting..." : "Connect"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
