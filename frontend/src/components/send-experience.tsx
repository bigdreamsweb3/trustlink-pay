"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { PhoneNumberInput } from "@/src/components/phone-number-input";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { WalletPickerModal } from "@/src/components/wallet-picker-modal";
import { apiGet, apiPost } from "@/src/lib/api";
import type { CountryOption } from "@/src/lib/phone-countries";
import { rememberCountryUsage } from "@/src/lib/phone-preferences";
import type { RecipientLookupResult, WalletTokenOption } from "@/src/lib/types";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getConnectedWalletSession,
  listAvailableSolanaWallets,
  sendSolanaPayment,
  type ConnectedWalletSession,
  type DetectedWallet
} from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(balance);
}

export function SendExperience() {
  const { hydrated, user } = useAuthenticatedSession("/app/send");
  const { showToast } = useToast();
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [receiverCountry, setReceiverCountry] = useState<CountryOption | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [recipientPreview, setRecipientPreview] = useState<RecipientLookupResult | null>(null);
  const [supportedTokens, setSupportedTokens] = useState<WalletTokenOption[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<{
    paymentId: string;
    status: string;
    referenceCode: string;
    senderDisplayName: string;
    senderHandle: string;
    escrowAccount: string | null;
    blockchainSignature: string;
    depositAddress: string | null;
    receiverPhone: string;
    recipientName: string;
    amount: string;
    token: string;
  } | null>(null);
  const [form, setForm] = useState({
    receiverPhone: "",
    amount: "",
    token: ""
  });

  const canLookupRecipient = useMemo(() => /^\+[1-9]\d{7,14}$/.test(form.receiverPhone), [form.receiverPhone]);
  const sendableTokens = useMemo(() => supportedTokens.filter((token) => token.supported), [supportedTokens]);
  const selectedToken = sendableTokens.find((token) => token.symbol === form.token) ?? null;
  const walletAddress = walletSession?.address ?? null;

  useEffect(() => {
    setWalletSession(getConnectedWalletSession());
    setAvailableWallets(listAvailableSolanaWallets());
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setSupportedTokens([]);
      setForm((current) => ({ ...current, token: "" }));
      return;
    }

    const controller = new AbortController();

    async function loadTokens() {
      setTokenBusy(true);

      try {
        const result = await apiPost<{ tokens: WalletTokenOption[] }>("/api/wallet/tokens", {
          walletAddress
        });

        if (controller.signal.aborted) {
          return;
        }

        setSupportedTokens(result.tokens);
        setForm((current) => ({
          ...current,
          token:
            result.tokens.find((token) => token.supported && token.symbol === current.token)?.symbol ??
            result.tokens.find((token) => token.supported)?.symbol ??
            ""
        }));
      } catch (tokenError) {
        if (!controller.signal.aborted) {
          setSupportedTokens([]);
          setError(tokenError instanceof Error ? tokenError.message : "Could not load supported tokens");
        }
      } finally {
        if (!controller.signal.aborted) {
          setTokenBusy(false);
        }
      }
    }

    void loadTokens();

    return () => controller.abort();
  }, [walletAddress]);

  useEffect(() => {
    if (!canLookupRecipient) {
      setRecipientPreview(null);
      setLookupError(null);
      setPreviewBusy(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      setLookupError(null);

      try {
        const result = await apiPost<RecipientLookupResult>("/api/recipient/lookup", {
          phoneNumber: form.receiverPhone
        });
        setRecipientPreview(result);
      } catch (lookupRequestError) {
        const message = lookupRequestError instanceof Error ? lookupRequestError.message : "Could not verify recipient";
        setLookupError(message);
        setRecipientPreview(null);
      } finally {
        setPreviewBusy(false);
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [canLookupRecipient, form.receiverPhone]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !walletAddress) {
      setError("Connect a sender wallet before creating a payment.");
      return;
    }

    if (!recipientPreview || !recipientPreview.verified) {
      setError("Verify the recipient before sending.");
      showToast("Verify the recipient before sending.");
      return;
    }

    if (!selectedToken) {
      setError("Choose a supported token before sending.");
      showToast("Choose a supported token before sending.");
      return;
    }

    setConfirmOpen(true);
  }

  async function handleConfirmSend() {
    if (!user || !walletAddress || !selectedToken) {
      setError("Connect a sender wallet and choose a supported token before sending.");
      return;
    }

    if (!recipientPreview?.verified) {
      setError("Verify the recipient before sending.");
      return;
    }

    const recipientName = recipientPreview.recipient.displayName;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const depositSignature =
        selectedToken.symbol === "SOL" && walletSession
          ? await sendRealSolTransfer({
            walletId: walletSession.walletId,
            fromAddress: walletAddress,
            amount: Number(form.amount),
          })
          : undefined;

      const result = await apiPost<{
        paymentId: string;
        status: string;
        referenceCode: string;
        senderDisplayName: string;
        senderHandle: string;
        escrowAccount: string | null;
        blockchainSignature: string;
        depositAddress: string | null;
      }>("/api/payment/create", {
        phoneNumber: form.receiverPhone,
        senderPhoneNumber: user.phoneNumber,
        amount: Number(form.amount),
        token: selectedToken.symbol,
        senderWallet: walletAddress,
        depositSignature,
      });

      if (receiverCountry) {
        rememberCountryUsage(receiverCountry.iso2);
      }

      setNotice(`Payment queued. Reference ${result.referenceCode}.`);
      setSendSuccess({
        ...result,
        receiverPhone: form.receiverPhone,
        recipientName,
        amount: form.amount,
        token: selectedToken.symbol
      });
      setForm((current) => ({ ...current, receiverPhone: "", amount: "2.5" }));
      setRecipientPreview(null);
      setConfirmOpen(false);
      showToast(`Payment sent. Reference ${result.referenceCode}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create payment");
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  async function sendRealSolTransfer(params: {
    walletId: string;
    fromAddress: string;
    amount: number;
  }) {
    if (selectedToken?.symbol !== "SOL") {
      throw new Error("Real on-chain sending currently supports SOL only on devnet");
    }

    const depositTarget = await apiGet<{
      address: string;
      rpcUrl: string;
      chain: string;
      network: string;
    }>("/api/wallet/deposit-target");

    setNotice(`Approve the ${selectedToken.symbol} transfer in ${walletSession?.walletName ?? "your wallet"}...`);

    return sendSolanaPayment({
      walletId: params.walletId,
      fromAddress: params.fromAddress,
      toAddress: depositTarget.address,
      amountSol: params.amount,
      rpcUrl: depositTarget.rpcUrl,
    });
  }

  return (
    <AppMobileShell currentTab="send" title="Send" subtitle="Confirm the person, choose a supported token, then move funds into escrow." user={user} showBackButton backHref="/app">
      <section className="space-y-5">
        {notice ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        {sendSuccess ? (
          <section className="rounded-[28px] border border-white/8 bg-white/5 p-5">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/12 text-[#7dffd9]">✓</div>
            <div className="mt-5 text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Transfer sent</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
              {sendSuccess.amount} {sendSuccess.token} queued
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/56">
              TrustLink sent the transfer details to {sendSuccess.recipientName} on WhatsApp and moved the payment into escrow for claim.
            </p>

            <div className="mt-5 space-y-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Recipient</span>
                <span className="font-medium text-right text-white">{sendSuccess.recipientName}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">WhatsApp</span>
                <span className="font-medium text-white">{sendSuccess.receiverPhone}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Reference</span>
                <span className="font-medium text-white">{sendSuccess.referenceCode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Status</span>
                <span className="font-medium capitalize text-white">{sendSuccess.status}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/46">Escrow tx</span>
                <span className="font-medium text-white">{shortenAddress(sendSuccess.blockchainSignature)}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href="/app" className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-medium text-white/78">
                Back home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSendSuccess(null);
                  setNotice(null);
                }}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a]"
              >
                Send another
              </button>
            </div>
          </section>
        ) : (
          <div className="rounded-[28px] border border-white/8 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/42">Sender wallet</div>
                <div className="mt-1 text-base font-semibold text-white">
                  {walletAddress ? `${walletSession?.walletName ?? "Wallet"} • ${shortenAddress(walletAddress)}` : "Not connected"}
                </div>
              </div>
              {walletAddress ? (
                <button type="button" onClick={() => void handleDisconnectWallet()} className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/78">
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={() => void handleConnectWallet()} className="rounded-full bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-3 py-2 text-xs font-semibold text-[#04110a]">
                  Connect
                </button>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <PhoneNumberInput
                label="Receiver WhatsApp number"
                value={form.receiverPhone}
                onChange={(value, country) => {
                  setForm((current) => ({ ...current, receiverPhone: value }));
                  setReceiverCountry(country);
                  setConfirmOpen(false);
                }}
              />

              {previewBusy ? (
                <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                  <SectionLoader label="Verifying recipient..." />
                </div>
              ) : lookupError ? (
                <div className="rounded-[20px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ffadad]">
                  {lookupError}
                </div>
              ) : recipientPreview ? (
                <div
                  className={`rounded-[20px] border px-4 py-3 ${recipientPreview.verified ? "border-[#58f2b1]/18 bg-[#58f2b1]/7" : "border-[#ff7f7f]/18 bg-[#ff7f7f]/8"
                    }`}
                >
                  {recipientPreview.status === "registered" ? (
                    <>
                      <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#7dffd9]/72">Recipient</div>
                      <div className="mt-1 text-sm font-semibold text-white">{recipientPreview.recipient.displayName}</div>
                      <div className="mt-1 text-sm text-white/56">@{recipientPreview.recipient.handle}</div>
                    </>
                  ) : recipientPreview.status === "whatsapp_only" ? (
                    <>
                      <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#f3c96b]">Recipient</div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {recipientPreview.recipient.displayName} (Not registered on TrustLink)
                      </div>
                      <div className="mt-1 text-sm text-white/56">{recipientPreview.warning}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[#ffadad]">Recipient</div>
                      <div className="mt-1 text-sm font-semibold text-white">{recipientPreview.message}</div>
                    </>
                  )}
                </div>
              ) : null}

              {/* 2. Unified Amount & Token Box */}
              <div className="flex items-stretch rounded-[24px] border border-white/8 bg-black/20 transition-all focus-within:border-[#58f2b1]/40">
                <div className="flex flex-1 flex-col px-4 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Amount</span>
                  <input
                    type="number"
                    step="any"
                    value={form.amount}
                    onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-transparent text-lg font-semibold text-white outline-none"
                  />
                </div>
                <div className="my-3 w-[1px] bg-white/10" />
                <button
                  type="button"
                  onClick={() => setTokenPickerOpen(true)}
                  className="flex w-[130px] items-center justify-between px-4 py-3 hover:bg-white/[0.02]"
                >
                  {selectedToken ? (
                    <div className="flex flex-col text-left overflow-hidden">
                      <span className="text-sm font-bold text-white">{selectedToken.symbol}</span>
                      <span className="text-[10px] text-white/40 truncate">{formatTokenBalance(selectedToken.balance, selectedToken.symbol)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-white/40">Token</span>
                  )}
                  <span className="text-[10px] text-white/30">▼</span>
                </button>
              </div>
              <div className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">Flow</div>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  TrustLink verifies the recipient first, then sends the transfer into escrow while the receiver claims
                  with OTP on WhatsApp.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy || !walletAddress || !recipientPreview?.verified || !selectedToken}
                className="w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review payment
              </button>
            </form>
          </div>
        )}
      </section>

      {tokenPickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setTokenPickerOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Choose token</h2>
              <p className="text-sm text-white/48">Supported TrustLink tokens from your connected wallet.</p>
            </div>

            <div className="space-y-3">
              {tokenBusy ? (
                <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <SectionLoader size="md" label="Loading supported tokens..." />
                </div>
              ) : (
                sendableTokens.map((token) => {
                  const active = token.symbol === form.token;

                  return (
                    <button
                      key={token.symbol}
                      type="button"
                      onClick={() => {
                        setForm((current) => ({ ...current, token: token.symbol }));
                        setTokenPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${active ? "border-[#58f2b1]/30 bg-[#58f2b1]/8" : "border-white/8 bg-black/20"
                        }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-lg text-white">
                          {token.logo}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">{token.symbol}</span>
                          <span className="block text-[0.72rem] text-white/46">{token.name}</span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-white">
                          {formatTokenBalance(token.balance, token.symbol)}
                        </span>
                        <span className="block text-[0.72rem] text-white/40">Available</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen && recipientPreview?.verified && selectedToken ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-md md:place-items-center" onClick={() => setConfirmOpen(false)}>
          <div
            className="w-full rounded-t-[28px] border border-white/10 bg-[#0b1017] px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:max-w-[430px] md:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Confirm transfer</h2>
              <p className="text-sm text-white/48">Please verify the recipient before funds move into escrow.</p>
            </div>

            <div className="space-y-3 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40">You are sending to</div>
                <div className="mt-1 text-base font-semibold text-white">
                  {recipientPreview.recipient.displayName}
                  {"handle" in recipientPreview.recipient && recipientPreview.recipient.handle
                    ? ` (@${recipientPreview.recipient.handle})`
                    : recipientPreview.status === "whatsapp_only"
                      ? " (Not registered on TrustLink)"
                      : ""}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                <span className="text-sm text-white/56">
                  {form.amount} {selectedToken.symbol}
                </span>
                <span className="text-sm text-white/44">{form.receiverPhone}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/72"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSend()}
                disabled={busy}
                className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Sending..." : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
