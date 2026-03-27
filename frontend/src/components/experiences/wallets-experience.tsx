"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PlusIcon, TrashIcon, WalletIcon } from "@/src/components/app-icons";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import { apiDelete, apiGet, apiPost } from "@/src/lib/api";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getConnectedWalletSession,
  listAvailableSolanaWallets,
  type ConnectedWalletSession,
  type DetectedWallet
} from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { ReceiverWallet } from "@/src/lib/types";

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function WalletsExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/wallets");
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [receiverWallets, setReceiverWallets] = useState<ReceiverWallet[]>([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    walletName: "",
    walletAddress: ""
  });

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    setAvailableWallets(listAvailableSolanaWallets());
  }, []);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadWallets(accessToken);
  }, [accessToken, user]);

  async function loadWallets(token: string) {
    setLoading(true);

    try {
      const result = await apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", token);
      setReceiverWallets(result.wallets);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load wallets");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectWallet() {
    setError(null);
    const wallets = listAvailableSolanaWallets();
    setAvailableWallets(wallets);

    if (wallets.length === 0) {
      const nextError = "Install or open a Solana wallet on this device to connect a sender wallet.";
      setError(nextError);
      showToast("No Solana wallet detected on this browser.");
      return;
    }

    setWalletPickerOpen(true);
  }

  async function handleWalletSelect(walletId: string) {
    setConnectingWalletId(walletId);
    setError(null);

    try {
      const session = await connectSolanaWallet(walletId);
      setWalletSession(session);
      setWalletPickerOpen(false);
      setNotice(`${session.walletName} connected.`);
      showToast(`${session.walletName} connected successfully.`);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect wallet");
    } finally {
      setConnectingWalletId(null);
    }
  }

  async function handleDisconnectWallet() {
    await disconnectSolanaWallet();
    setWalletSession(null);
    setNotice("Wallet disconnected.");
    showToast("Wallet disconnected.");
  }

  async function handleAddWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPost<{ wallet: ReceiverWallet }>("/api/receiver-wallets", form, accessToken);
      setReceiverWallets((current) => [...current, result.wallet]);
      setForm({ walletName: "", walletAddress: "" });
      setWalletModalOpen(false);
      setNotice("Receiver wallet saved.");
      showToast("Receiver wallet added.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save wallet");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWallet(walletId: string) {
    if (!accessToken) {
      return;
    }

    setDeletingWalletId(walletId);
    setError(null);
    setNotice(null);

    try {
      await apiDelete<{ wallet: ReceiverWallet }>(`/api/receiver-wallets/${walletId}`, accessToken);
      setReceiverWallets((current) => current.filter((wallet) => wallet.id !== walletId));
      setNotice("Receiver wallet removed.");
      showToast("Receiver wallet deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete wallet");
    } finally {
      setDeletingWalletId(null);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  const senderWalletAddress = walletSession?.address ?? null;

  return (
    <AppMobileShell
      currentTab="wallets"
      title="Wallets"
      subtitle="Manage the wallet you send from and the payout wallets you use when claiming funds."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {notice ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Sender wallet</h2>
            <p className="text-sm text-white/48">This is the wallet TrustLink uses as the payment source when you send into escrow.</p>
          </div>

          <div className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
            <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Current wallet</div>
            <div className="mt-2 text-base font-semibold text-white">
              {senderWalletAddress ? `${walletSession?.walletName ?? "Wallet"} - ${shortenAddress(senderWalletAddress)}` : "No wallet connected"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {senderWalletAddress ? (
              <button type="button" onClick={() => void handleDisconnectWallet()} className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/78">
                Disconnect
              </button>
            ) : (
              <button type="button" onClick={() => void handleConnectWallet()} className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]">
                Connect wallet
              </button>
            )}
            <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/52">
              Solana wallets only
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Receiver wallets</h2>
              <p className="text-sm text-white/48">Manage the payout wallets used during claim flow.</p>
            </div>
            <button
              type="button"
              aria-label="Add receiver wallet"
              onClick={() => setWalletModalOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] text-[#04110a] shadow-[0_12px_30px_rgba(88,242,177,0.16)]"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <SectionLoader label="Loading wallets..." />
          </section>
        ) : receiverWallets.length > 0 ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <div className="space-y-3">
              {receiverWallets.map((wallet) => (
                <article key={wallet.id} className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{wallet.wallet_name}</div>
                      <div className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-white/34">Receiver payout wallet</div>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/78">
                      <WalletIcon className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-white/[0.03] px-3 py-3">
                    <span className="text-sm text-white/66">{shortenAddress(wallet.wallet_address)}</span>
                    <span className="text-[0.72rem] text-white/34">{formatShortDate(wallet.created_at)}</span>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleDeleteWallet(wallet.id)}
                      disabled={deletingWalletId === wallet.id}
                      className="inline-flex items-center gap-2 rounded-[18px] border border-[#ff7f7f]/16 bg-[#ff7f7f]/8 px-3 py-2 text-xs font-medium text-[#ffb2b2] disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      {deletingWalletId === wallet.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/8 text-white/74">
                <WalletIcon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-semibold text-white">No receiver wallet saved yet</div>
              <p className="mt-2 text-sm leading-6 text-white/46">Add a payout wallet here so future claims are easier to review and release.</p>
            </div>
          </section>
        )}
      </section>

      <WalletPickerModal
        open={walletPickerOpen}
        wallets={availableWallets}
        connectingWalletId={connectingWalletId}
        onClose={() => {
          if (!connectingWalletId) {
            setWalletPickerOpen(false);
          }
        }}
        onSelect={(walletId) => void handleWalletSelect(walletId)}
      />

      {walletModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setWalletModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Add receiver wallet</h2>
              <p className="text-sm text-white/48">Give the wallet a clear name so claim decisions stay easy and safe.</p>
            </div>

            <form className="space-y-4" onSubmit={handleAddWallet}>
              <label className="block">
                <span className="mb-2 block text-sm text-white/56">Wallet name</span>
                <input
                  value={form.walletName}
                  onChange={(event) => setForm((current) => ({ ...current, walletName: event.target.value }))}
                  placeholder="Primary Solana"
                  className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-white/56">Wallet address</span>
                <input
                  value={form.walletAddress}
                  onChange={(event) => setForm((current) => ({ ...current, walletAddress: event.target.value }))}
                  placeholder="Destination public key"
                  className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(false)}
                  className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/72"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Save wallet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
