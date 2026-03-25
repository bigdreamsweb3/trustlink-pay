"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/wallet-picker-modal";
import { apiPatch } from "@/src/lib/api";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getConnectedWalletSession,
  listAvailableSolanaWallets,
  type ConnectedWalletSession,
  type DetectedWallet
} from "@/src/lib/wallet";
import { setStoredUser } from "@/src/lib/storage";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { UserProfile } from "@/src/lib/types";

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function ProfileExperience() {
  const { hydrated, accessToken, user, setUser, logout } = useAuthenticatedSession("/app/profile");
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    handle: ""
  });

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    setAvailableWallets(listAvailableSolanaWallets());
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      displayName: user.displayName,
      handle: user.handle
    });
  }, [user]);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPatch<{ user: UserProfile }>("/api/profile", form, accessToken);
      setUser(result.user);
      setStoredUser(result.user);
      setNotice("Profile updated.");
      showToast("Profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  }

  async function handleConnectWallet() {
    setError(null);
    const wallets = listAvailableSolanaWallets();
    setAvailableWallets(wallets);

    if (wallets.length === 0) {
      setError("Install or open a Solana wallet on this device to connect a sender wallet.");
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

  if (!hydrated || !user) {
    return null;
  }

  const walletAddress = walletSession?.address ?? null;

  return (
    <AppMobileShell currentTab="profile" title="Profile" subtitle="Keep your identity clean, trusted, and ready for the people receiving your payments." user={user} showBackButton backHref="/app">
      <section className="space-y-5">
        {notice ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Identity</h2>
            <p className="text-sm text-white/48">This is what receivers see when money is coming from you.</p>
          </div>

          <form className="space-y-4" onSubmit={handleProfileSave}>
            <label className="block">
              <span className="mb-2 block text-sm text-white/56">Display name</span>
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Daniel Trust"
                className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-white/56">Handle</span>
              <input
                value={form.handle}
                onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value.toLowerCase() }))}
                placeholder="daniel_trust"
                className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Sender wallet</h2>
            <p className="text-sm text-white/48">Use your connected wallet as the payment source for escrow transfers.</p>
          </div>

          <div className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
            <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Current wallet</div>
            <div className="mt-2 text-base font-semibold text-white">
              {walletAddress ? `${walletSession?.walletName ?? "Wallet"} • ${shortenAddress(walletAddress)}` : "No wallet connected"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {walletAddress ? (
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
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Account</h2>
            <p className="text-sm text-white/48">Sign out from this device when you are done.</p>
          </div>

          <button type="button" onClick={logout} className="w-full rounded-[22px] border border-[#ff7f7f]/16 bg-[#ff7f7f]/8 px-4 py-3 text-sm font-semibold text-[#ffb2b2]">
            Log out
          </button>
        </section>
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
    </AppMobileShell>
  );
}
