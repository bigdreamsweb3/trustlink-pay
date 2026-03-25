"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { PlusIcon, WalletIcon } from "@/src/components/app-icons";
import { PinGateModal } from "@/src/components/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet, apiPost } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { PaymentRecord, ReceiverWallet } from "@/src/lib/types";

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function ReceiveExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/receive");
  const { showToast } = useToast();
  const [wallets, setWallets] = useState<ReceiverWallet[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [totalPendingUsd, setTotalPendingUsd] = useState(0);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    walletName: "",
    walletAddress: ""
  });
  const visiblePendingPayments = pendingPayments.slice(0, 2);
  const hiddenPendingCount = Math.max(0, pendingPayments.length - visiblePendingPayments.length);
  const pendingClaimTotal = useMemo(() => totalPendingUsd, [totalPendingUsd]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadReceiveData(accessToken);
  }, [accessToken, user]);

  async function loadReceiveData(token: string) {
    setLoading(true);

    try {
      const [walletResult, pendingResult] = await Promise.all([
        apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", token),
        apiGet<{ payments: PaymentRecord[]; totalPendingUsd: number }>("/api/payment/pending", token)
      ]);

      setWallets(walletResult.wallets);
      setPendingPayments(pendingResult.payments);
      setTotalPendingUsd(pendingResult.totalPendingUsd);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load receive screen");
    } finally {
      setLoading(false);
    }
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
      setWallets((current) => [...current, result.wallet]);
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

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="receive"
      title="Receive"
      subtitle="Keep claim wallets ready and release incoming transfers into a destination you trust."
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Pending claims</h2>
              <p className="text-sm text-white/48">Incoming transfers waiting for your OTP confirmation.</p>
            </div>
            {!loading && pendingPayments.length > 0 ? (
              <div className="rounded-[18px] border border-[#58f2b1]/14 bg-[#58f2b1]/7 px-3 py-2 text-right">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[#7dffd9]/70">Unclaimed</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {formatUsd(pendingClaimTotal)}
                </div>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-5">
              <SectionLoader label="Loading claims..." />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/46">No pending claims right now.</div>
          ) : (
            <div className="space-y-3">
              {visiblePendingPayments.map((payment) => (
                <Link key={payment.id} href={`/app/activity/${payment.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4 transition hover:border-white/12 hover:bg-black/35">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="truncate text-sm text-white/54">
                      {payment.sender_display_name_snapshot} - {payment.reference_code}
                    </div>
                    <div className="mt-1 text-[0.72rem] text-white/34">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-white/82">Open</span>
                </Link>
              ))}

              {hiddenPendingCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setPendingModalOpen(true)}
                  className="w-full rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/76 transition hover:bg-white/[0.05]"
                >
                  View {hiddenPendingCount} more pending {hiddenPendingCount === 1 ? "claim" : "claims"}
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Receiver wallets</h2>
              <p className="text-sm text-white/48">Store up to three trusted payout destinations for fast claim decisions.</p>
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
        ) : wallets.length > 0 ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Saved wallets</h2>
              <p className="text-sm text-white/48">Claim destinations already prepared for release.</p>
            </div>

            <div className="space-y-3">
              {wallets.map((wallet) => (
                <article key={wallet.id} className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{wallet.wallet_name}</div>
                      <div className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-white/34">Solana payout wallet</div>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/78">
                      <WalletIcon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-white/[0.03] px-3 py-3">
                    <span className="text-sm text-white/66">{shortenAddress(wallet.wallet_address)}</span>
                    <span className="text-[0.72rem] text-white/34">{formatShortDate(wallet.created_at)}</span>
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
              <p className="mt-2 text-sm leading-6 text-white/46">Add a payout wallet now so your next claim can finish in one OTP flow.</p>
            </div>
          </section>
        )}
      </section>

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

              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Receiver wallet</div>
                <p className="mt-2 text-sm leading-6 text-white/56">This wallet becomes one of your approved destinations for future claims. Keep names human and obvious.</p>
              </div>

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

      {pendingModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setPendingModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">All pending claims</h2>
                <p className="text-sm text-white/48">Open any payment below to review the full details and continue the OTP release flow.</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingModalOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/72"
              >
                Close
              </button>
            </div>

            <div className="mb-4 rounded-[18px] border border-[#58f2b1]/14 bg-[#58f2b1]/7 px-3 py-3">
              <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[#7dffd9]/70">Total unclaimed</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {formatUsd(pendingClaimTotal)}
              </div>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {pendingPayments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/app/activity/${payment.id}`}
                  onClick={() => setPendingModalOpen(false)}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4 transition hover:border-white/12 hover:bg-black/35"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatTokenAmount(payment.amount)} {payment.token_symbol}
                    </div>
                    <div className="truncate text-sm text-white/54">
                      {payment.sender_display_name_snapshot} - {payment.reference_code}
                    </div>
                    <div className="mt-1 text-[0.72rem] text-white/34">{formatShortDate(payment.created_at)}</div>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] font-medium text-white/82">Open</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}



