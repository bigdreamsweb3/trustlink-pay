"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PlusIcon, TrashIcon, WalletIcon } from "@/src/components/app-icons";
import { OtpModal } from "@/src/components/modals/otp-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import { apiDelete, apiGet, apiPost } from "@/src/lib/api";
import {
  getConnectedWalletSession,
  type ConnectedWalletSession,
  type DetectedWallet,
} from "@/src/lib/wallet";
import {
  connectTrustLinkWallet,
  disconnectTrustLinkWallet,
  getWalletConnectionErrorMessage,
  getWalletDisconnectionErrorMessage,
  getWalletsForConnection,
} from "@/src/lib/wallet-actions";
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
    minute: "2-digit",
  }).format(new Date(value));
}

export function WalletsExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } =
    useAuthenticatedSession("/app/wallets");
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [receiverWallets, setReceiverWallets] = useState<ReceiverWallet[]>([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [walletOtp, setWalletOtp] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    walletName: "",
    walletAddress: "",
  });
  const lastSubmittedOtpRef = useRef<string | null>(null);

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    try {
      setAvailableWallets(getWalletsForConnection());
    } catch {
      setAvailableWallets([]);
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadWallets(accessToken);
  }, [accessToken, user]);

  useEffect(() => {
    if (otpCooldown === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setOtpCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (!otpModalOpen || !accessToken || busy || walletOtp.length !== 6) {
      return;
    }

    if (lastSubmittedOtpRef.current === walletOtp) {
      return;
    }

    lastSubmittedOtpRef.current = walletOtp;
    void finalizeWalletAdd();
  }, [accessToken, busy, walletOtp, otpModalOpen]);

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

  async function handleWalletSelect(walletId: string) {
    setConnectingWalletId(walletId);
    setError(null);

    try {
      const session = await connectTrustLinkWallet(walletId);
      setWalletSession(session);
      setWalletPickerOpen(false);
      setNotice(`${session.walletName} connected.`);
      showToast(`${session.walletName} connected successfully.`);
    } catch (connectError) {
      setError(getWalletConnectionErrorMessage(connectError));
    } finally {
      setConnectingWalletId(null);
    }
  }

  async function handleDisconnectWallet() {
    try {
      await disconnectTrustLinkWallet();
      setWalletSession(null);
      setNotice("Wallet disconnected.");
      showToast("Wallet disconnected.");
    } catch (disconnectError) {
      setError(getWalletDisconnectionErrorMessage(disconnectError));
    }
  }

  async function handleStartWalletOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setOtpBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiPost<{ expiresAt: string | null }>("/api/receiver-wallets/start", {}, accessToken);
      setWalletOtp("");
      setOtpCooldown(60);
      setOtpModalOpen(true);
      lastSubmittedOtpRef.current = null;
      showToast("Verification code sent for wallet add.");
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Could not send wallet verification code");
    } finally {
      setOtpBusy(false);
    }
  }

  async function finalizeWalletAdd() {
    if (!accessToken) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPost<{ wallet: ReceiverWallet }>(
        "/api/receiver-wallets",
        {
          ...form,
          otp: walletOtp,
        },
        accessToken,
      );
      setReceiverWallets((current) => [...current, result.wallet]);
      setForm({ walletName: "", walletAddress: "" });
      setWalletModalOpen(false);
      setOtpModalOpen(false);
      setWalletOtp("");
      setNotice("Receiver wallet saved.");
      showToast("Receiver wallet added.");
    } catch (saveError) {
      setOtpModalOpen(false);
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
        {notice ? <div className="tl-badge rounded-[22px] px-4 py-3 text-sm">{notice}</div> : null}
        {error ? <div className="tl-button-danger rounded-[22px] px-4 py-3 text-sm">{error}</div> : null}

        <section className="tl-panel rounded-[28px] p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Sender wallet</h2>
            <p className="tl-text-muted text-sm">This is the wallet TrustLink uses as the payment source when you send into escrow.</p>
          </div>

          <div className="tl-field rounded-[22px] px-4 py-4">
            <div className="tl-text-muted text-[0.72rem] uppercase tracking-[0.18em]">Current wallet</div>
            <div className="mt-2 text-base font-semibold text-[var(--text)]">
              {senderWalletAddress ? `${walletSession?.walletName ?? "Wallet"} - ${shortenAddress(senderWalletAddress)}` : "No wallet connected"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {senderWalletAddress ? (
              <button type="button" onClick={() => void handleDisconnectWallet()} className="tl-button-secondary rounded-[20px] px-4 py-3 text-sm font-medium">
                Disconnect
              </button>
            ) : (
              <button type="button" onClick={() => void handleConnectWallet()} className="tl-button-primary rounded-[20px] px-4 py-3 text-sm font-semibold">
                Connect wallet
              </button>
            )}
            <div className="tl-field rounded-[20px] px-4 py-3 text-sm tl-text-muted">
              Solana wallets only
            </div>
          </div>
        </section>

        <section className="tl-panel rounded-[28px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">Receiver wallets</h2>
              <p className="tl-text-muted text-sm">Manage the payout wallets used during claim flow.</p>
            </div>
            <button
              type="button"
              aria-label="Add receiver wallet"
              onClick={() => setWalletModalOpen(true)}
              className="tl-button-primary grid h-11 w-11 shrink-0 place-items-center rounded-full"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </section>

        {loading ? (
          <section className="tl-panel p-4">
            <SectionLoader label="Loading wallets..." />
          </section>
        ) : receiverWallets.length > 0 ? (
          <section className="tl-panel p-4">
            <div className="space-y-3">
              {receiverWallets.map((wallet) => (
                <article key={wallet.id} className="tl-field px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{wallet.wallet_name}</div>
                      <div className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-text/34">Receiver payout wallet</div>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-pop-bg text-text/78">
                      <WalletIcon className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-white/[0.03] px-3 py-3">
                    <span className="text-sm text-text/66">{shortenAddress(wallet.wallet_address)}</span>
                    <span className="text-[0.72rem] text-text/34">{formatShortDate(wallet.created_at)}</span>
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
          <section className="tl-panel p-4">
            <div className="tl-field px-4 py-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pop-bg text-text/74">
                <WalletIcon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-semibold text-text">No receiver wallet saved yet</div>
              <p className="mt-2 text-sm leading-6 text-text/46">Add a payout wallet here so future claims are easier to review and release.</p>
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
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setWalletModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-pop-bg px-5 pb-6 pt-5   shadow-softbox  md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Add receiver wallet</h2>
              <p className="text-sm text-text/48">Give the wallet a clear name so claim decisions stay easy and safe.</p>
            </div>

            <form className="space-y-4" onSubmit={handleStartWalletOtp}>
              <label className="block">
                <span className="mb-2 block text-sm text-text/56">Wallet name</span>
                <input
                  value={form.walletName}
                  onChange={(event) => setForm((current) => ({ ...current, walletName: event.target.value }))}
                  placeholder="Primary Solana"
                  className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-text outline-none transition focus:border-[#58f2b1]/35"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-text/56">Wallet address</span>
                <input
                  value={form.walletAddress}
                  onChange={(event) => setForm((current) => ({ ...current, walletAddress: event.target.value }))}
                  placeholder="Destination public key"
                  className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-text outline-none transition focus:border-[#58f2b1]/35"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(false)}
                  className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/72"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpBusy}
                  className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]   shadow-softbox  disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpBusy ? "Sending code..." : "Verify with OTP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <OtpModal
        open={otpModalOpen}
        title="Verify wallet with OTP"
        description="Enter the 6-digit code sent to your verified WhatsApp number to save this payout wallet."
        value={walletOtp}
        onChange={(nextValue) => {
          lastSubmittedOtpRef.current = null;
          setWalletOtp(nextValue.replace(/[^\d]/g, "").slice(0, 6));
        }}
        onClose={() => !busy && setOtpModalOpen(false)}
        onResend={() => void handleStartWalletOtp({ preventDefault() { } } as FormEvent<HTMLFormElement>)}
        resendLabel={otpBusy ? "Sending..." : "Resend OTP"}
        resendDisabled={otpBusy}
        countdown={otpCooldown}
        busy={busy}
      />
    </AppMobileShell>
  );
}
