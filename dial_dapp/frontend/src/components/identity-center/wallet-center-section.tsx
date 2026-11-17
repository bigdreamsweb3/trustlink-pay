"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Unplug,
  WalletCards,
} from "lucide-react";

import { OtpModal } from "@/src/components/modals/otp-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiDelete, apiGet, apiPost } from "@/src/lib/api";
import type { ReceiverWallet } from "@/src/lib/types";
import { useWallet } from "@/src/lib/wallet-provider";

export function WalletCenterSection({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const { showToast } = useToast();
  const {
    session,
    walletAddress,
    requestWalletConnection,
    disconnectWallet,
  } = useWallet();
  const [receiverWallets, setReceiverWallets] = useState<ReceiverWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ walletName: "", walletAddress: "" });
  const submittedOtpRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", accessToken)
      .then((result) => {
        setReceiverWallets(result.wallets);
        setError(null);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load payout wallets",
        ),
      )
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(
      () => setOtpCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (
      !otpOpen ||
      !accessToken ||
      busy ||
      otp.length !== 6 ||
      submittedOtpRef.current === otp
    ) {
      return;
    }
    submittedOtpRef.current = otp;
    void finalizeWalletAdd();
  }, [accessToken, busy, otp, otpOpen]);

  async function startWalletVerification(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!accessToken) return;
    if (!form.walletName.trim() || !form.walletAddress.trim()) {
      setError("Enter a wallet name and address.");
      return;
    }

    setOtpBusy(true);
    setError(null);
    try {
      await apiPost(
        "/api/receiver-wallets/start",
        {},
        accessToken,
      );
      setOtp("");
      submittedOtpRef.current = null;
      setOtpCooldown(60);
      setOtpOpen(true);
      showToast("Verification code sent.");
    } catch (verificationError) {
      const message =
        verificationError instanceof Error
          ? verificationError.message
          : "Could not send verification code";
      setError(message);
      showToast(message);
    } finally {
      setOtpBusy(false);
    }
  }

  async function finalizeWalletAdd() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ wallet: ReceiverWallet }>(
        "/api/receiver-wallets",
        {
          walletName: form.walletName.trim(),
          walletAddress: form.walletAddress.trim(),
          otp,
        },
        accessToken,
      );
      setReceiverWallets((current) => [...current, result.wallet]);
      setForm({ walletName: "", walletAddress: "" });
      setOtp("");
      setOtpOpen(false);
      setAddOpen(false);
      showToast("Payout wallet added.");
    } catch (saveError) {
      setOtpOpen(false);
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not save payout wallet";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteWallet(walletId: string) {
    if (!accessToken) return;
    setDeletingId(walletId);
    setError(null);
    try {
      await apiDelete(`/api/receiver-wallets/${walletId}`, accessToken);
      setReceiverWallets((current) =>
        current.filter((wallet) => wallet.id !== walletId),
      );
      showToast("Payout wallet removed.");
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Could not remove payout wallet";
      setError(message);
      showToast(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-[0.76rem] text-danger">
          {error}
        </div>
      ) : null}

      <div className="tl-panel rounded-[28px] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[1rem] font-semibold text-[var(--text)]">
              Connected payment wallet
            </h3>
            <p className="mt-1 text-[0.74rem] leading-5 text-[var(--text-soft)]">
              This wallet signs sender authorizations. Connecting it does not
              change your TIN identity or payout routes.
            </p>
          </div>
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              walletAddress ? "bg-accent" : "bg-[var(--text-faint)]"
            }`}
          />
        </div>

        <div className="tl-field mt-4 flex items-center gap-3 rounded-[20px] px-4 py-4">
          <span className="tl-icon-surface grid h-11 w-11 shrink-0 place-items-center rounded-[15px]">
            <WalletCards className="h-5 w-5 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.82rem] font-semibold text-[var(--text)]">
              {session?.walletName ?? "No wallet connected"}
            </span>
            <span className="mt-1 block truncate text-[0.68rem] text-[var(--text-faint)]">
              {walletAddress
                ? walletAddress
                : "Connect securely through Reown to authorize TrustLink payments."}
            </span>
          </span>
          {walletAddress ? (
            <button
              type="button"
              onClick={() => void disconnectWallet()}
              className="tl-button-secondary inline-flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[0.68rem] font-medium"
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={requestWalletConnection}
              className="tl-button-primary rounded-[14px] px-3 py-2 text-[0.68rem] font-semibold"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="tl-panel rounded-[28px] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAddOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-[1rem] font-semibold text-[var(--text)]">
              Payout wallets
            </span>
            <span className="mt-1 block text-[0.74rem] text-[var(--text-soft)]">
              Verified destinations available during manual claim flows.
            </span>
          </span>
          <span className="tl-button-secondary grid h-9 w-9 shrink-0 place-items-center rounded-full">
            {addOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </span>
        </button>

        {addOpen ? (
          <form
            onSubmit={startWalletVerification}
            className="mt-4 space-y-3 border-t border-[var(--field-border)] pt-4"
          >
            <label className="tl-field block rounded-[18px] px-4 py-3">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Wallet name
              </span>
              <input
                value={form.walletName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    walletName: event.target.value,
                  }))
                }
                placeholder="Primary payout"
                className="mt-1.5 block w-full bg-transparent text-[0.8rem] font-medium text-[var(--text)] outline-none"
              />
            </label>
            <label className="tl-field block rounded-[18px] px-4 py-3">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Solana address
              </span>
              <input
                value={form.walletAddress}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    walletAddress: event.target.value,
                  }))
                }
                placeholder="Destination public key"
                className="mt-1.5 block w-full bg-transparent text-[0.8rem] font-medium text-[var(--text)] outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={otpBusy}
              className="tl-button-primary w-full rounded-[18px] px-4 py-3 text-[0.78rem] font-semibold disabled:opacity-50"
            >
              {otpBusy ? "Sending verification..." : "Verify and add wallet"}
            </button>
          </form>
        ) : null}

        <div className="mt-4 space-y-2.5">
          {loading ? (
            <SectionLoader label="Loading payout wallets..." />
          ) : receiverWallets.length > 0 ? (
            receiverWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="tl-field flex items-center gap-3 rounded-[18px] px-4 py-3.5"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.78rem] font-semibold text-[var(--text)]">
                    {wallet.wallet_name}
                  </span>
                  <span className="mt-0.5 block text-[0.66rem] text-[var(--text-faint)]">
                    {shortenAddress(wallet.wallet_address)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void deleteWallet(wallet.id)}
                  disabled={deletingId === wallet.id}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-danger transition-colors hover:bg-[#ff7f7f]/8 disabled:opacity-40"
                  aria-label={`Remove ${wallet.wallet_name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--field-border)] px-4 py-6 text-center">
              <WalletCards className="mx-auto h-5 w-5 text-[var(--text-faint)]" />
              <p className="mt-2 text-[0.76rem] font-medium text-[var(--text)]">
                No payout wallet saved
              </p>
              <p className="mt-1 text-[0.66rem] text-[var(--text-faint)]">
                Add one only if you need manual payout routing.
              </p>
            </div>
          )}
        </div>
      </div>

      <OtpModal
        open={otpOpen}
        title="Verify payout wallet"
        description="Enter the 6-digit code sent to your verified WhatsApp number."
        value={otp}
        onChange={(value) => {
          submittedOtpRef.current = null;
          setOtp(value.replace(/\D/g, "").slice(0, 6));
        }}
        onClose={() => !busy && setOtpOpen(false)}
        onResend={() => void startWalletVerification()}
        resendDisabled={otpBusy}
        countdown={otpCooldown}
        busy={busy}
      />
    </section>
  );
}
