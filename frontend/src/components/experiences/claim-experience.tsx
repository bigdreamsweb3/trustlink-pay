"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinEntryModal } from "@/src/components/modals/pin-entry-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { SuccessIcon } from "@/src/components/success-icon";
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
  blockchainSignature: string | null;
  claimFeeAmount: number | null;
  netAmount: number | null;
  tokenSymbol: string | null;
};

type ClaimFeeEstimate = {
  feeAmountUi: number;
  feeAmountUsd: number | null;
  estimatedNetworkFeeSol: number;
  estimatedNetworkFeeUsd: number | null;
  markupAmountUi: number;
  receiverAmountUi: number;
  totalAmountUi: number;
};

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(balance);
}

function toNumericAmount(value: string | number | null | undefined) {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function ClaimExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } =
    useAuthenticatedSession(`/claim/${paymentId}`);
  const { showToast } = useToast();
  const [payment, setPayment] = useState<PaymentDetailsResponse | null>(null);
  const [wallets, setWallets] = useState<ReceiverWallet[]>([]);
  const [walletBalances, setWalletBalances] = useState<Record<string, WalletTokenOption | null>>({});
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
  const [claimFeeEstimate, setClaimFeeEstimate] = useState<ClaimFeeEstimate | null>(null);
  const [claimFeeBusy, setClaimFeeBusy] = useState(false);
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const lastSubmittedPinRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadClaimData(accessToken);
  }, [accessToken, user, paymentId]);

  useEffect(() => {
    if (!pinModalOpen || !selectedWalletId || pin.length !== 6 || claimBusy || !accessToken) {
      return;
    }

    if (lastSubmittedPinRef.current === pin) {
      return;
    }

    lastSubmittedPinRef.current = pin;
    void handleClaim();
  }, [accessToken, claimBusy, pin, pinModalOpen, selectedWalletId]);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [selectedWalletId, wallets],
  );
  const selectedWalletBalance = selectedWallet ? walletBalances[selectedWallet.id] : null;
  const grossAmount = toNumericAmount(payment?.payment.amount);
  const feeAmount =
    claimSuccess?.claimFeeAmount ??
    claimFeeEstimate?.feeAmountUi ??
    toNumericAmount(payment?.payment.claim_fee_amount);
  const netAmount = claimSuccess?.netAmount ?? claimFeeEstimate?.receiverAmountUi ?? Math.max(grossAmount - feeAmount, 0);

  useEffect(() => {
    if (!accessToken || !payment || !selectedWalletId || claimSuccess || payment.payment.status !== "pending") {
      return;
    }

    let cancelled = false;

    async function loadClaimEstimate() {
      setClaimFeeBusy(true);

      try {
        const result = await apiPost<{
          estimate: ClaimFeeEstimate;
        }>(
          "/api/payment/claim/estimate",
          {
            paymentId,
            receiverWalletId: selectedWalletId,
          },
          accessToken ?? undefined,
        );

        if (!cancelled) {
          setClaimFeeEstimate(result.estimate);
        }
      } catch {
        if (!cancelled) {
          setClaimFeeEstimate(null);
        }
      } finally {
        if (!cancelled) {
          setClaimFeeBusy(false);
        }
      }
    }

    void loadClaimEstimate();

    return () => {
      cancelled = true;
    };
  }, [accessToken, claimSuccess, payment, paymentId, selectedWalletId]);

  async function loadClaimData(token: string) {
    setLoading(true);

    try {
      const [paymentResult, walletResult] = await Promise.all([
        apiGet<PaymentDetailsResponse>(`/api/payment/${paymentId}`, token),
        apiGet<{ wallets: ReceiverWallet[] }>("/api/receiver-wallets", token),
      ]);

      setPayment(paymentResult);
      setWallets(walletResult.wallets);
      setSelectedWalletId(walletResult.wallets[0]?.id ?? "");

      const balances = await Promise.all(
        walletResult.wallets.map(async (wallet) => {
          try {
            const result = await apiPost<{ tokens: WalletTokenOption[] }>(
              "/api/wallet/tokens",
              { walletAddress: wallet.wallet_address },
              token,
            );
            const walletToken =
              result.tokens.find((tokenOption) => tokenOption.symbol === paymentResult.payment.token_symbol) ?? null;
            return [wallet.id, walletToken] as const;
          } catch {
            return [wallet.id, null] as const;
          }
        }),
      );

      setWalletBalances(Object.fromEntries(balances));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load claim details");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenPinConfirmation() {
    if (!selectedWalletId) {
      setError("Select a receiver wallet before confirming claim.");
      return;
    }

    setError(null);
    setStatus(null);
    setPin("");
    lastSubmittedPinRef.current = null;
    setPinModalOpen(true);
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
        claimFeeAmount: string | null;
        netAmount: number | null;
        tokenSymbol: string | null;
        blockchainSignature: string | null;
      }>(
        "/api/payment/accept",
        {
          paymentId,
          pin,
          receiverWalletId: selectedWalletId,
        },
        accessToken,
      );

      setStatus(`Reference ${result.referenceCode} claimed successfully to ${result.walletAddress}.`);
      setClaimSuccess({
        ...result,
        claimFeeAmount: result.claimFeeAmount != null ? Number(result.claimFeeAmount) : null,
      });
      setPinModalOpen(false);
      showToast("Payment claimed successfully.");
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not complete claim");
    } finally {
      setClaimBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Claim"
      subtitle="Choose your payout wallet, confirm with your PIN, and TrustLink releases the escrow immediately."
      user={user}
      showBackButton
      backHref="/app/claim"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {status && !claimSuccess ? (
          <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
            <SectionLoader size="md" label="Loading claim details..." />
          </section>
        ) : claimSuccess && payment ? (
          <section className="rounded-[28px] border border-white/8 bg-pop-bg p-5">
            <SuccessIcon className="h-14 w-14" />
            <div className="mt-5 text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Claim successful</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-text">
              {formatTokenAmount(netAmount)} {payment.payment.token_symbol} released
            </h2>
            <p className="mt-2 text-sm leading-6 text-text/56">
              Funds from {payment.sender.displayName} were released successfully to your selected wallet.
            </p>

            <div className="mt-5 space-y-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Reference</span>
                <span className="font-medium text-text">{claimSuccess.referenceCode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Sender</span>
                <span className="font-medium text-text">{payment.sender.displayName}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">TrustLink fee</span>
                <span className="font-medium text-text">
                  {formatTokenAmount(feeAmount)} {payment.payment.token_symbol}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text/46">Wallet</span>
                <span className="font-medium text-text">{shortenAddress(claimSuccess.walletAddress)}</span>
              </div>
              {claimSuccess.blockchainSignature ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Claim tx</span>
                  <span className="font-medium text-text">{shortenAddress(claimSuccess.blockchainSignature)}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                href="/app"
                className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-medium text-text/78"
              >
                Back home
              </Link>
              <button
                type="button"
                onClick={() => (window.history.length > 1 ? history.back() : window.location.assign("/app"))}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
              >
                Close
              </button>
            </div>
          </section>
        ) : payment ? (
          <>
            <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Incoming payment</div>
              <div className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-text">
                {formatTokenAmount(netAmount)} {payment.payment.token_symbol}
              </div>
              <div className="mt-2 text-sm text-text/58">
                This is the net amount that will be released to your wallet after the TrustLink fee is deducted.
              </div>
              <div className="mt-4 space-y-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Sent amount</span>
                  <span className="font-medium text-text">
                    {formatTokenAmount(grossAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 text-text/46">
                    TrustLink fee
                    <button
                      type="button"
                      onClick={() => setFeeInfoOpen((current) => !current)}
                      className="grid h-5 w-5 place-items-center rounded-full border border-white/10 text-[0.68rem] font-semibold text-text/58 transition hover:border-white/20 hover:text-text"
                      aria-label="Why is a TrustLink fee charged?"
                    >
                      i
                    </button>
                  </span>
                  <span className="font-medium text-text">
                    {formatTokenAmount(feeAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
                {!claimSuccess && claimFeeEstimate?.estimatedNetworkFeeSol != null ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Est. Solana cost</span>
                    <span className="font-medium text-text">
                      {claimFeeEstimate.estimatedNetworkFeeSol.toFixed(6)} SOL
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-sm">
                  <span className="text-text/72">Amount to wallet</span>
                  <span className="font-semibold text-[#7dffd9]">
                    {formatTokenAmount(netAmount)} {payment.payment.token_symbol}
                  </span>
                </div>
              </div>
              {feeInfoOpen ? (
                <div className="mt-3 rounded-[20px] border border-[#58f2b1]/14 bg-[#58f2b1]/8 px-4 py-3 text-sm leading-6 text-text/68">
                  TrustLink calculates this from the current Solana claim cost for your selected wallet, then adds the configured TrustLink margin. That keeps claiming possible even when the receiver has no SOL for gas.
                </div>
              ) : null}
              <div className="mt-4 text-sm text-text/58">
                From {payment.sender.displayName} (@{payment.sender.handle})
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/6 bg-black/20 px-3 py-3 text-sm text-text/54">
                <span>Reference {payment.sender.referenceCode}</span>
                <span className="uppercase text-text/36">{payment.payment.status}</span>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Receiver wallet</h2>
                  <p className="text-sm text-text/48">This wallet gets the release once your TrustLink PIN is confirmed.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(true)}
                  disabled={wallets.length === 0}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-text/78 disabled:opacity-40"
                >
                  Choose
                </button>
              </div>

              {wallets.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-text/48">
                  No receiver wallet saved yet. Add one in{" "}
                  <Link href="/app/wallets" className="text-[#7dffd9] underline underline-offset-4">
                    Wallets
                  </Link>{" "}
                  before claiming.
                </div>
              ) : selectedWallet ? (
                <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{selectedWallet.wallet_name}</div>
                      <div className="mt-1 text-sm text-text/52">{shortenAddress(selectedWallet.wallet_address)}</div>
                    </div>
                    <div className="text-right text-[0.72rem] text-text/40">
                      {selectedWalletBalance
                        ? `${formatTokenBalance(selectedWalletBalance.balance, selectedWalletBalance.symbol)} ${selectedWalletBalance.symbol}`
                        : `${payment.payment.token_symbol} preview unavailable`}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">Final step</div>
                <p className="mt-2 text-sm leading-6 text-text/58">
                  After you tap continue, entering your 6-digit PIN is the final confirmation. TrustLink releases {formatTokenAmount(netAmount)} {payment.payment.token_symbol} to your selected wallet automatically.
                </p>
                {claimFeeBusy ? (
                  <div className="mt-3 text-xs text-text/42">Refreshing claim fee estimate...</div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleOpenPinConfirmation}
                disabled={claimBusy || !selectedWalletId}
                className="mt-4 w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]  shadow-softbox  disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimBusy ? "Checking PIN..." : "Continue with PIN"}
              </button>
            </section>
          </>
        ) : (
          <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4 text-sm text-text/48">
            Claim details are unavailable right now.
          </section>
        )}
      </section>

      {walletModalOpen ? (
        <div className="fixed inset-0 z-999 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setWalletModalOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-pop-bg px-5 pb-6 pt-5 shadow-softbox  md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Select receiver wallet</h2>
              <p className="text-sm text-text/48">Choose the destination wallet that should receive this release.</p>
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
                    className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${active ? "border-[#58f2b1]/30 bg-[#58f2b1]/8" : "border-white/8 bg-black/20"
                      }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text">{wallet.wallet_name}</span>
                      <span className="mt-1 block text-sm text-text/52">{shortenAddress(wallet.wallet_address)}</span>
                    </span>
                    <span className="text-right text-[0.72rem] text-text/44">
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

      <PinEntryModal
        open={pinModalOpen}
        title="Confirm claim with PIN"
        description={
          payment
            ? `Enter your TrustLink PIN to release ${formatTokenAmount(netAmount)} ${payment.payment.token_symbol} to your selected wallet.`
            : "Enter your TrustLink PIN to release this escrow."
        }
        value={pin}
        onChange={(nextValue) => {
          lastSubmittedPinRef.current = null;
          setPin(nextValue.replace(/[^\d]/g, "").slice(0, 6));
        }}
        onClose={() => !claimBusy && setPinModalOpen(false)}
        busy={claimBusy}
      />
    </AppMobileShell>
  );
}
