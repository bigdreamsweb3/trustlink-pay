"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { apiGet, apiPost } from "@/src/lib/api";
import { formatTokenAmount } from "@/src/lib/formatters";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { PaymentRecord, ReceiverWallet, WalletTokenOption } from "@/src/lib/types";

type PaymentDetailsResponse = {
  payment: PaymentRecord;
  sender: {
    displayName: string;
    handle: string;
    referenceCode: string;
  };
};

type ClaimSuccess = {
  referenceCode: string;
  walletAddress: string;
};

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(balance);
}

export function ClaimExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user } = useAuthenticatedSession(`/claim/${paymentId}`);
  const { showToast } = useToast();
  const [payment, setPayment] = useState<PaymentDetailsResponse | null>(null);
  const [wallets, setWallets] = useState<ReceiverWallet[]>([]);
  const [walletBalances, setWalletBalances] = useState<Record<string, WalletTokenOption | null>>({});
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpBusy, setOtpBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
  const lastSubmittedOtpRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadClaimData(accessToken);
  }, [accessToken, user, paymentId]);

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
    if (!otpRequested || !selectedWalletId || otp.length !== 6 || claimBusy || !accessToken) {
      return;
    }

    if (lastSubmittedOtpRef.current === otp) {
      return;
    }

    lastSubmittedOtpRef.current = otp;
    void handleClaim();
  }, [accessToken, claimBusy, otp, otpRequested, selectedWalletId]);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [selectedWalletId, wallets]
  );
  const selectedWalletBalance = selectedWallet ? walletBalances[selectedWallet.id] : null;

  async function loadClaimData(token: string) {
    setLoading(true);

    try {
      const [paymentResult, walletResult] = await Promise.all([
        apiGet<PaymentDetailsResponse>(`/api/payment/${paymentId}`, token),
        apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", token)
      ]);

      setPayment(paymentResult);
      setWallets(walletResult.wallets);
      setSelectedWalletId(walletResult.wallets[0]?.id ?? "");

      const balances = await Promise.all(
        walletResult.wallets.map(async (wallet) => {
          try {
            const result = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", {
              walletAddress: wallet.wallet_address
            }, token);
            const walletToken = result.tokens.find((tokenOption) => tokenOption.symbol === paymentResult.payment.token_symbol) ?? null;
            return [wallet.id, walletToken] as const;
          } catch {
            return [wallet.id, null] as const;
          }
        })
      );

      setWalletBalances(Object.fromEntries(balances));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load claim details");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!accessToken || !selectedWalletId) {
      setError("Select a receiver wallet before requesting claim OTP.");
      return;
    }

    setOtpBusy(true);
    setError(null);
    setStatus(null);

    try {
      const result = await apiPost<{
        referenceCode: string;
        senderDisplayName: string;
        senderHandle: string;
      }>("/api/payment/claim/start", { paymentId }, accessToken);

      setOtpRequested(true);
      setOtpModalOpen(true);
      setOtpCooldown(60);
      setOtp("");
      lastSubmittedOtpRef.current = null;
      setStatus(`OTP sent. Enter it to release ${result.referenceCode} from ${result.senderDisplayName}.`);
      showToast("Claim verification code sent.");
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not send claim OTP");
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleClaim() {
    if (!accessToken || !selectedWalletId) {
      setError("Select a receiver wallet before confirming claim.");
      return;
    }

    setClaimBusy(true);
    setError(null);

    try {
      const result = await apiPost<{
        referenceCode: string;
        walletAddress: string;
      }>("/api/payment/accept", {
        paymentId,
        otp,
        receiverWalletId: selectedWalletId
      }, accessToken);

      setStatus(`Reference ${result.referenceCode} claimed successfully to ${result.walletAddress}.`);
      setClaimSuccess(result);
      setOtpModalOpen(false);
      showToast("Payment claimed successfully.");
    } catch (acceptError) {
      lastSubmittedOtpRef.current = null;
      setError(acceptError instanceof Error ? acceptError.message : "Could not complete claim");
    } finally {
      setClaimBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell currentTab="receive" title="Claim" subtitle="Choose your payout wallet, send the OTP, then your claim completes as soon as the code is confirmed." user={user} showBackButton backHref="/app/receive">
      <section className="space-y-5">
        {status ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{status}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        {loading ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <SectionLoader size="md" label="Loading claim details..." />
          </section>
        ) : claimSuccess && payment ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-5">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/12 text-[#7dffd9]">✓</div>
            <div className="mt-5 text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Claim successful</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
              {formatTokenAmount(payment.payment.amount)} {payment.payment.token_symbol} released
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/56">
              Funds from {payment.sender.displayName} were released successfully to your selected wallet.
            </p>

            <div className="mt-5 space-y-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Reference</span>
                <span className="font-medium text-white">{claimSuccess.referenceCode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Sender</span>
                <span className="font-medium text-white">{payment.sender.displayName}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Wallet</span>
                <span className="font-medium text-white">{shortenAddress(claimSuccess.walletAddress)}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href="/app" className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-medium text-white/78">
                Back home
              </Link>
              <button
                type="button"
                onClick={() => window.history.length > 1 ? history.back() : window.location.assign("/app")}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
              >
                Close
              </button>
            </div>
          </section>
        ) : payment ? (
          <>
            <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Incoming payment</div>
              <div className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
                {formatTokenAmount(payment.payment.amount)} {payment.payment.token_symbol}
              </div>
              <div className="mt-2 text-sm text-white/58">
                From {payment.sender.displayName} (@{payment.sender.handle})
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/54">
                <span>Reference {payment.sender.referenceCode}</span>
                <span className="uppercase text-white/36">{payment.payment.status}</span>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Receiver wallet</h2>
                  <p className="text-sm text-white/48">This wallet gets the release once your WhatsApp OTP is confirmed.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(true)}
                  disabled={wallets.length === 0}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/78 disabled:opacity-40"
                >
                  Choose
                </button>
              </div>

              {wallets.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/48">
                  No receiver wallet saved yet. Add one in{" "}
                  <Link href="/app/receive" className="text-[#7dffd9] underline underline-offset-4">
                    Receive
                  </Link>{" "}
                  before claiming.
                </div>
              ) : selectedWallet ? (
                <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{selectedWallet.wallet_name}</div>
                      <div className="mt-1 text-sm text-white/52">{shortenAddress(selectedWallet.wallet_address)}</div>
                    </div>
                    <div className="text-right text-[0.72rem] text-white/40">
                      {selectedWalletBalance
                        ? `${formatTokenBalance(selectedWalletBalance.balance, selectedWalletBalance.symbol)} ${selectedWalletBalance.symbol}`
                        : `${payment.payment.token_symbol} preview unavailable`}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Final step</div>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  After you tap send OTP, entering the 6-digit code is the final confirmation. TrustLink releases the escrow automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={otpBusy || claimBusy || !selectedWalletId || otpCooldown > 0}
                className="mt-4 w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {otpBusy ? "Sending OTP..." : otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : "Send OTP to claim"}
              </button>
            </section>
          </>
        ) : (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-4 text-sm text-white/48">
            Claim details are unavailable right now.
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
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Select receiver wallet</h2>
              <p className="text-sm text-white/48">Choose the destination wallet that should receive this release.</p>
            </div>

            <div className="space-y-3">
              {wallets.map((wallet) => {
                const active = wallet.id === selectedWalletId;
                const balancePreview = walletBalances[wallet.id];

                return (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => {
                      setSelectedWalletId(wallet.id);
                      setWalletModalOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
                      active ? "border-[#58f2b1]/30 bg-[#58f2b1]/8" : "border-white/8 bg-black/20"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{wallet.wallet_name}</span>
                      <span className="mt-1 block text-sm text-white/52">{shortenAddress(wallet.wallet_address)}</span>
                    </span>
                    <span className="text-right text-[0.72rem] text-white/44">
                      {balancePreview
                        ? `${formatTokenBalance(balancePreview.balance, balancePreview.symbol)} ${balancePreview.symbol}`
                        : `${payment?.payment.token_symbol ?? "Token"} preview unavailable`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {otpModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => !claimBusy && setOtpModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Enter verification code</h2>
              <p className="text-sm text-white/48">This is the final step. As soon as the 6-digit code is complete, TrustLink releases the escrow automatically.</p>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="w-full border-0 bg-transparent text-lg tracking-[0.35em] text-white outline-none placeholder:tracking-normal placeholder:text-white/24"
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-white/46">{otpCooldown > 0 ? `Resend available in ${otpCooldown}s` : "You can request another OTP if needed."}</span>
              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={otpBusy || claimBusy || otpCooldown > 0}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/78 disabled:opacity-40"
              >
                {otpBusy ? "Sending..." : "Resend OTP"}
              </button>
            </div>

            {claimBusy ? (
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <SectionLoader label="Releasing claim..." />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppMobileShell>
  );
}
