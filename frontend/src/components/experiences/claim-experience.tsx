"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronRight, ShieldCheck, Wallet2 } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { GuidedFlowModal } from "@/src/components/modals/guided-flow-modal";
import { PinEntryModal } from "@/src/components/modals/pin-entry-modal";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { SuccessIcon } from "@/src/components/success-icon";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { assertClaimTransactionIntegrity } from "@/src/lib/escrow-validation";
import { formatTokenAmount } from "@/src/lib/formatters";
import { derivePaymentReceiverPublicKey, deriveReceiverPrivateKey, getOrCreatePrivacyKeyBundle, signClaimProof } from "@/src/lib/privacy-keys";
import type { IdentitySecurityState, PaymentRecord } from "@/src/lib/types";
import { signAndSendSerializedSolanaTransaction } from "@/src/lib/wallet";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useWallet } from "@/src/lib/wallet-provider";

type PaymentDetailsResponse = { payment: PaymentRecord; sender: { displayName: string; handle: string; referenceCode: string } };
type ClaimSuccess = { referenceCode: string; walletAddress: string; blockchainSignature: string | null; claimFeeAmount: number | null; netAmount: number | null; tokenSymbol: string | null };
type ClaimFeeEstimate = { feeAmountUi: number; feeAmountUsd: number | null; estimatedNetworkFeeSol: number; estimatedNetworkFeeUsd: number | null; markupAmountUi: number; receiverAmountUi: number; totalAmountUi: number };
type BackupFlowStep = "intro" | "connect" | "success";

function toNumericAmount(v: string | number | null | undefined) { const n = typeof v === "number" ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function looksLikeWalletAddress(v: string) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim()); }

/* ── BackupWalletFlow modal (unchanged logic, polished interactions) ── */
function BackupWalletFlow({ open, step, connectedWallet, mainWallet, backupWalletInput, busy, onClose, onSkip, onContinue, onWalletInputChange, onSave, onUseConnectedWallet, onConnectWallet }: { open: boolean; step: BackupFlowStep; connectedWallet: string | null; mainWallet: string | null; backupWalletInput: string; busy: boolean; onClose: () => void; onSkip: () => void; onContinue: () => void; onWalletInputChange: (v: string) => void; onSave: () => void; onUseConnectedWallet: () => void; onConnectWallet: () => void }) {
  const canBeBackup = Boolean(connectedWallet && mainWallet && connectedWallet !== mainWallet);
  const needsApproval = Boolean(mainWallet && connectedWallet && connectedWallet !== mainWallet);
  const isMain = Boolean(mainWallet && connectedWallet && connectedWallet === mainWallet);
  return (
    <GuidedFlowModal open={open} onClose={busy ? () => undefined : onClose} dismissible={!busy}
      title={step === "intro" ? "Protect your funds" : step === "connect" ? "Connect a backup wallet" : "Backup wallet added"}
      description={step === "intro" ? "Your backup wallet lets you recover if you lose access." : step === "connect" ? "Only used for account recovery." : "Recovery protection active."}
    >
      <AnimatePresence mode="wait">
        {step === "intro" ? (
          <motion.div key="intro" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: "easeOut" }} className="space-y-5">
            <div className="rounded-[22px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-5 py-5">
              <div className="flex items-start gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-[#58f2b1]/14 text-[#7dffd9]"><ShieldCheck className="h-5 w-5" /></div>
                <div>
                  <div className="text-[0.84rem] font-semibold text-text">Stay in control</div>
                  <p className="mt-1 text-[0.78rem] leading-relaxed text-text/60">Your main wallet keeps receiving payments. Backup is emergencies only.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onContinue} className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Continue</button>
              <button type="button" onClick={onSkip} className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Skip</button>
            </div>
          </motion.div>
        ) : null}
        {step === "connect" ? (
          <motion.div key="connect" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: "easeOut" }} className="space-y-4">
            <div className="tl-field rounded-[18px] px-4 py-3.5">
              <div className="flex items-center justify-between"><span className="text-[0.78rem] text-[var(--text-soft)]">Main wallet</span><span className="text-[0.82rem] font-medium text-[var(--text)]">{mainWallet ? shortenAddress(mainWallet) : "Not set"}</span></div>
            </div>
            <div className="tl-field rounded-[18px] px-4 py-3.5">
              <div className="flex items-center justify-between"><span className="text-[0.78rem] text-[var(--text-soft)]">Backup</span><span className="text-[0.82rem] font-medium text-[var(--text)]">{connectedWallet ? shortenAddress(connectedWallet) : "Not connected"}</span></div>
            </div>
            <div className="space-y-2.5">
              <button type="button" onClick={onConnectWallet} className="tl-field w-full rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium text-[var(--text)] text-center transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.98]">Connect wallet</button>
              {canBeBackup ? <button type="button" onClick={onUseConnectedWallet} className="w-full rounded-[18px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-4 py-3.5 text-[0.84rem] font-medium text-[#7dffd9] cursor-pointer active:scale-[0.98] transition-transform">Use connected wallet</button> : null}
              <div className="tl-field rounded-[18px] px-4 py-3.5">
                <label className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Wallet address</label>
                <input value={backupWalletInput} onChange={(e) => onWalletInputChange(e.target.value)} placeholder="Paste backup address" className="mt-1.5 block w-full bg-transparent text-[0.84rem] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
              </div>
            </div>
            <div className="text-[0.72rem] leading-relaxed text-[var(--text-soft)]">{isMain ? "Main wallet connected. Paste backup address or switch wallets." : needsApproval ? "Reconnect main wallet to approve." : "Main wallet will approve this backup."}</div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onSave} disabled={busy} className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] disabled:opacity-60 cursor-pointer active:scale-[0.97] transition-transform">{busy ? "Saving..." : needsApproval ? "Reconnect main" : "Add backup"}</button>
              <button type="button" onClick={onClose} disabled={busy} className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Cancel</button>
            </div>
          </motion.div>
        ) : null}
        {step === "success" ? (
          <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: "easeOut" }} className="space-y-5">
            <div className="rounded-[22px] border border-[#58f2b1]/18 bg-[#58f2b1]/8 px-5 py-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#58f2b1]/14 text-[#7dffd9]"><CheckCircle2 className="h-7 w-7" /></div>
              <p className="mt-4 text-[0.82rem] leading-relaxed text-text/62">Your backup wallet can help recover your account if needed.</p>
            </div>
            <button type="button" onClick={onClose} className="w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Done</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GuidedFlowModal>
  );
}

/* ═══════════ CLAIM EXPERIENCE ═══════════ */
export function ClaimExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession(`/claim/${paymentId}`);
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const { showToast } = useToast();
  const [payment, setPayment] = useState<PaymentDetailsResponse | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
  const [identitySecurity, setIdentitySecurity] = useState<IdentitySecurityState | null>(null);
  const [dismissRecoveryPrompt, setDismissRecoveryPrompt] = useState(false);
  const [claimFeeEstimate, setClaimFeeEstimate] = useState<ClaimFeeEstimate | null>(null);
  const [claimFeeBusy, setClaimFeeBusy] = useState(false);
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const [backupFlowOpen, setBackupFlowOpen] = useState(false);
  const [backupFlowStep, setBackupFlowStep] = useState<BackupFlowStep>("intro");
  const [backupWalletInput, setBackupWalletInput] = useState("");
  const [backupFlowBusy, setBackupFlowBusy] = useState(false);
  const lastSubmittedPinRef = useRef<string | null>(null);
  const activeWalletAddress = walletAddress ?? null;

  /* ── All effects & handlers identical to original ── */
  useEffect(() => { if (!accessToken || !activeWalletAddress || identitySecurity || !user) return; void apiPost("/api/identity/keys", { ...getOrCreatePrivacyKeyBundle(), settlementWalletPublicKey: activeWalletAddress }, accessToken).catch(() => undefined); }, [accessToken, activeWalletAddress, identitySecurity, user]);
  useEffect(() => { if (!accessToken || !user) return; void loadClaimData(accessToken); }, [accessToken, user, paymentId]);

  const grossAmount = toNumericAmount(payment?.payment.amount);
  const feeAmount = claimSuccess?.claimFeeAmount ?? claimFeeEstimate?.feeAmountUi ?? toNumericAmount(payment?.payment.claim_fee_amount);
  const netAmount = claimSuccess?.netAmount ?? claimFeeEstimate?.receiverAmountUi ?? Math.max(grossAmount - feeAmount, 0);
  const boundMainWallet = identitySecurity?.mainWallet ?? null;
  const requiresBoundWalletConnection = Boolean(boundMainWallet);
  const isConnectedToRequiredWallet = requiresBoundWalletConnection ? activeWalletAddress === boundMainWallet : Boolean(activeWalletAddress);

  useEffect(() => { if (!pinModalOpen || !activeWalletAddress || pin.length !== 6 || claimBusy || !accessToken) return; if (lastSubmittedPinRef.current === pin) return; lastSubmittedPinRef.current = pin; void handleClaim(); }, [accessToken, activeWalletAddress, claimBusy, pin, pinModalOpen]);
  useEffect(() => { if (!accessToken || !payment || !activeWalletAddress || claimSuccess) return; let cancelled = false; async function load() { setClaimFeeBusy(true); try { const r = await apiPost<{ estimate: ClaimFeeEstimate }>("/api/payment/claim/estimate", { paymentId, ...(activeWalletAddress ? { walletAddress: activeWalletAddress } : {}) }, accessToken ?? undefined); if (!cancelled) setClaimFeeEstimate(r.estimate); } catch { if (!cancelled) setClaimFeeEstimate(null); } finally { if (!cancelled) setClaimFeeBusy(false); } } void load(); return () => { cancelled = true; }; }, [accessToken, activeWalletAddress, claimSuccess, payment, paymentId]);

  async function loadClaimData(token: string) { setLoading(true); try { const [pr, ir] = await Promise.all([apiGet<PaymentDetailsResponse>(`/api/payment/${paymentId}`, token), apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", token)]); setPayment(pr); setIdentitySecurity(ir.identity); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not load payment"); } finally { setLoading(false); } }
  function handleOpenPinConfirmation() { if (!activeWalletAddress) { setError("Connect your wallet first."); requestWalletConnection(); return; } if (boundMainWallet && activeWalletAddress !== boundMainWallet) { setError(`Connect ${shortenAddress(boundMainWallet)} to continue.`); requestWalletConnection(); return; } setError(null); setStatus(null); setPin(""); lastSubmittedPinRef.current = null; setPinModalOpen(true); }

  async function handleClaim() { if (!accessToken || !activeWalletAddress || !payment) { setError("Connect wallet first."); return; } setClaimBusy(true); setError(null); try { const isSecurePayment = payment.payment.payment_mode !== "invite"; const bundle = getOrCreatePrivacyKeyBundle(); let phoneIdentityPublicKey: string | null = null; let derivedPaymentReceiver: string | undefined; let privacySpendSignature: string | undefined; let receiverPrivateKey: string | undefined; if (isSecurePayment) { if (!payment.payment.phone_identity_pubkey || !payment.payment.payment_receiver_pubkey || !payment.payment.ephemeral_pubkey) throw new Error("Privacy routing data missing"); phoneIdentityPublicKey = payment.payment.phone_identity_pubkey; const paymentReceiverPublicKey = payment.payment.payment_receiver_pubkey; const ephemeralPublicKey = payment.payment.ephemeral_pubkey; if (bundle.phoneIdentityPublicKey !== payment.payment.phone_identity_pubkey) throw new Error("Wrong device privacy keys"); derivedPaymentReceiver = await derivePaymentReceiverPublicKey({ privacyViewPrivateKey: bundle.privacyViewPrivateKey, privacySpendPublicKey: bundle.privacySpendPublicKey, ephemeralPublicKey }); if (derivedPaymentReceiver !== paymentReceiverPublicKey) throw new Error("Routing verification failed"); privacySpendSignature = signClaimProof({ privacySpendPrivateKey: bundle.privacySpendPrivateKey, paymentId, phoneIdentityPublicKey, paymentReceiverPublicKey, ephemeralPublicKey, settlementWalletPublicKey: activeWalletAddress }); receiverPrivateKey = await deriveReceiverPrivateKey({ privacyViewPrivateKey: bundle.privacyViewPrivateKey, privacySpendPrivateKey: bundle.privacySpendPrivateKey, ephemeralPublicKey }); } const prepared = await apiPost<{ serializedTransaction: string | null; rpcUrl: string | null; programId: string | null; preview: { escrowAccount: string; escrowVaultAddress: string; settlementWallet: string; settlementTokenAccount: string; paymentReceiverPublicKey: string | null; amount: number; tokenMintAddress: string } | null; claimFeeAmount: string | null; requiresClientSignature: boolean }>("/api/payment/accept", { paymentId, pin, walletAddress: activeWalletAddress, ...(derivedPaymentReceiver ? { derivedPaymentReceiverPublicKey: derivedPaymentReceiver } : {}), ...(privacySpendSignature ? { privacySpendSignature } : {}) }, accessToken); if (!prepared.serializedTransaction || !prepared.rpcUrl || !prepared.programId || !prepared.preview || !session) throw new Error("Transaction could not be prepared"); const expectedProgramId = prepared.programId; const blockchainSignature = await signAndSendSerializedSolanaTransaction({ walletId: session.walletId, rpcUrl: prepared.rpcUrl, serializedTransaction: prepared.serializedTransaction, ...(receiverPrivateKey ? { partialSignerSecretKeys: [receiverPrivateKey] } : {}), inspectTransaction: isSecurePayment && phoneIdentityPublicKey && derivedPaymentReceiver ? async (transaction) => { await assertClaimTransactionIntegrity({ rpcUrl: prepared.rpcUrl!, transaction, paymentId, escrowAccount: payment.payment.escrow_account ?? prepared.preview!.escrowAccount, escrowVaultAddress: payment.payment.escrow_vault_address ?? prepared.preview!.escrowVaultAddress, settlementWallet: activeWalletAddress, settlementTokenAccount: prepared.preview!.settlementTokenAccount, phoneIdentityPublicKey, paymentReceiverPublicKey: derivedPaymentReceiver, tokenMintAddress: payment.payment.token_mint_address ?? prepared.preview!.tokenMintAddress, expectedProgramId, expectedAmountUi: grossAmount }); } : undefined }); const result = await apiPost<{ referenceCode: string; walletAddress: string; claimFeeAmount: string | null; netAmount: number | null; tokenSymbol: string | null; blockchainSignature: string | null }>("/api/payment/accept", { paymentId, pin, walletAddress: activeWalletAddress, ...(derivedPaymentReceiver ? { derivedPaymentReceiverPublicKey: derivedPaymentReceiver } : {}), ...(privacySpendSignature ? { privacySpendSignature } : {}), blockchainSignature }, accessToken); setStatus(`Reference ${result.referenceCode} received.`); setClaimSuccess({ ...result, claimFeeAmount: result.claimFeeAmount != null ? Number(result.claimFeeAmount) : null }); setPinModalOpen(false); showToast("Payment received."); } catch (e) { setError(e instanceof Error ? e.message : "Could not receive payment"); } finally { setClaimBusy(false); } }

  function openBackupFlow() { setBackupFlowStep("intro"); setBackupFlowOpen(true); }
  function closeBackupFlow() { if (backupFlowBusy) return; setBackupFlowOpen(false); setBackupFlowStep("intro"); }
  async function handleAddBackupWallet() { if (!accessToken || !identitySecurity) { setError("Receive a payment first."); return; } const trimmed = backupWalletInput.trim(); if (!looksLikeWalletAddress(trimmed)) { setError("Enter a valid address."); return; } if (trimmed === identitySecurity.mainWallet) { setError("Must differ from main wallet."); return; } if (!walletAddress || walletAddress !== identitySecurity.mainWallet || !session) { requestWalletConnection(); setError("Reconnect main wallet."); return; } setBackupFlowBusy(true); setError(null); try { const prepared = await apiPost<{ serializedTransaction: string; rpcUrl: string }>("/api/identity/add-recovery-wallet", { walletAddress: trimmed, allowUpdate: Boolean(identitySecurity.recoveryWallet) }, accessToken); await signAndSendSerializedSolanaTransaction({ walletId: session.walletId, rpcUrl: prepared.rpcUrl, serializedTransaction: prepared.serializedTransaction }); const refreshed = await apiGet<{ identity: IdentitySecurityState | null }>("/api/identity", accessToken); setIdentitySecurity(refreshed.identity); setBackupFlowStep("success"); setDismissRecoveryPrompt(true); showToast("Backup wallet added."); } catch (e) { const msg = e instanceof Error ? e.message : "Could not add backup"; setError(msg); showToast(msg); } finally { setBackupFlowBusy(false); } }

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell currentTab="home" title="Receive payment" subtitle="Connect wallet, confirm PIN, receive instantly." user={user} showBackButton backHref="/app/claim"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">
        {status && !claimSuccess ? <div className="tl-badge rounded-[18px] px-4 py-3 text-[0.82rem]">{status}</div> : null}
        {error ? <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">{error}</div> : null}

        {loading ? (
          <div className="tl-field rounded-[22px] px-5 py-8"><SectionLoader size="md" label="Loading payment..." /></div>
        ) : claimSuccess && payment ? (
          /* ═══ SUCCESS ═══ */
          <div className="space-y-5">
            <div className="text-center py-2">
              <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.34, ease: "easeOut" }} className="flex justify-center"><SuccessIcon className="h-14 w-14" /></motion.div>
              <div className="mt-4 tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Payment received</div>
              <h2 className="mt-2 text-[1.6rem] font-bold tracking-tight text-[var(--text)]">{formatTokenAmount(netAmount)} {payment.payment.token_symbol}</h2>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-[var(--text-soft)] max-w-[300px] mx-auto">Funds secured to your wallet. Add a backup wallet for protection.</p>
            </div>
            <div className="space-y-2">
              {[
                { label: "Reference", value: claimSuccess.referenceCode },
                { label: "From", value: payment.sender.displayName },
                { label: "Received", value: `${formatTokenAmount(netAmount)} ${payment.payment.token_symbol}`, accent: true },
                { label: "Fee", value: `${formatTokenAmount(feeAmount)} ${payment.payment.token_symbol}` },
                { label: "Wallet", value: shortenAddress(claimSuccess.walletAddress) },
                ...(claimSuccess.blockchainSignature ? [{ label: "Transaction", value: shortenAddress(claimSuccess.blockchainSignature) }] : []),
              ].map((row) => (
                <div key={row.label} className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">{row.label}</span>
                  <span className={`text-[0.82rem] font-medium ${"accent" in row && row.accent ? "text-[#7dffd9]" : "text-[var(--text)]"}`}>{row.value}</span>
                </div>
              ))}
            </div>
            {!identitySecurity?.recoveryWallet && !dismissRecoveryPrompt ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, delay: 0.08, ease: "easeOut" }} className="space-y-2.5">
                <button type="button" onClick={openBackupFlow} className="w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Add Backup Wallet</button>
                <button type="button" onClick={() => setDismissRecoveryPrompt(true)} className="tl-button-secondary w-full rounded-[18px] px-4 py-3.5 text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Not now</button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link href="/app" className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-medium cursor-pointer active:scale-[0.97] transition-transform">Back home</Link>
                <Link href="/app/settings" className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center text-[0.84rem] font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Security</Link>
              </div>
            )}
          </div>
        ) : payment ? (
          /* ═══ CLAIM FORM ═══ */
          <div className="space-y-5">
            {/* Amount hero */}
            <div className="text-center py-1">
              <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Incoming payment</div>
              <h2 className="mt-2 text-[1.6rem] font-bold tracking-tight text-[var(--text)]">{formatTokenAmount(netAmount)} {payment.payment.token_symbol}</h2>
              <p className="mt-1 text-[0.74rem] text-[var(--text-soft)]">From {payment.sender.displayName} (@{payment.sender.handle})</p>
            </div>

            {/* Fee breakdown */}
            <div>
              <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Breakdown</div>
              <div className="space-y-2">
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Sent amount</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{formatTokenAmount(grossAmount)} {payment.payment.token_symbol}</span>
                </div>
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[0.78rem] text-[var(--text-soft)]">
                    Fee
                    <button type="button" onClick={() => setFeeInfoOpen((c) => !c)} className="grid h-4 w-4 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.58rem] font-semibold text-[var(--text-soft)] cursor-pointer">i</button>
                  </span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{formatTokenAmount(feeAmount)} {payment.payment.token_symbol}</span>
                </div>
                {claimFeeEstimate?.estimatedNetworkFeeSol != null ? (
                  <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                    <span className="text-[0.78rem] text-[var(--text-soft)]">Network cost</span>
                    <span className="text-[0.82rem] font-medium text-[var(--text)]">{claimFeeEstimate.estimatedNetworkFeeSol.toFixed(6)} SOL</span>
                  </div>
                ) : null}
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3 border-t border-[var(--surface-soft)]">
                  <span className="text-[0.78rem] font-medium text-[var(--text)]">To wallet</span>
                  <span className="text-[0.84rem] font-semibold text-[#7dffd9]">{formatTokenAmount(netAmount)} {payment.payment.token_symbol}</span>
                </div>
              </div>
              <AnimatePresence>
                {feeInfoOpen ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: "easeOut" }} className="mt-2 rounded-[14px] border border-[#58f2b1]/14 bg-[#58f2b1]/8 px-4 py-3 text-[0.74rem] leading-relaxed text-text/68">
                    TrustLink covers gas even when receiver has no SOL. Fee = network cost + margin.
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Wallet + Reference */}
            <div>
              <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Wallet</div>
              <div className="space-y-2">
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">{boundMainWallet ? "Required" : "Connected"}</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{boundMainWallet ? shortenAddress(boundMainWallet) : activeWalletAddress ? shortenAddress(activeWalletAddress) : "None"}</span>
                </div>
                <button type="button" onClick={requestWalletConnection} className="tl-field group w-full flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]">
                  <span className="text-[0.84rem] font-medium text-[var(--text)]">{activeWalletAddress ? "Switch wallet" : "Connect wallet"}</span>
                  <ChevronRight className="h-4 w-4 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                </button>
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Reference</span>
                  <span className="text-[0.82rem] font-medium text-[var(--text)]">{payment.sender.referenceCode}</span>
                </div>
                <div className="tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                  <span className="text-[0.78rem] text-[var(--text-soft)]">Status</span>
                  <span className="text-[0.82rem] font-medium uppercase text-[var(--text)]">{payment.payment.status}</span>
                </div>
              </div>
              {claimFeeBusy ? <div className="mt-2 text-[0.68rem] text-[var(--text-soft)]">Refreshing estimate...</div> : null}
            </div>

            {/* CTA */}
            <button type="button" onClick={isConnectedToRequiredWallet ? handleOpenPinConfirmation : requestWalletConnection} disabled={claimBusy}
              className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] shadow-softbox disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
            >
              <span>{claimBusy ? "Checking PIN..." : isConnectedToRequiredWallet ? "Continue" : boundMainWallet ? "Connect main wallet" : "Connect wallet"}</span>
              {!claimBusy ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        ) : (
          <div className="tl-field rounded-[18px] px-4 py-5 text-center text-[0.82rem] tl-text-muted">Payment details unavailable.</div>
        )}
      </section>

      <BackupWalletFlow open={backupFlowOpen} step={backupFlowStep} connectedWallet={walletAddress} mainWallet={identitySecurity?.mainWallet ?? null} backupWalletInput={backupWalletInput} busy={backupFlowBusy} onClose={closeBackupFlow} onSkip={() => { setDismissRecoveryPrompt(true); closeBackupFlow(); }} onContinue={() => setBackupFlowStep("connect")} onWalletInputChange={setBackupWalletInput} onSave={() => void handleAddBackupWallet()} onUseConnectedWallet={() => setBackupWalletInput(walletAddress ?? "")} onConnectWallet={requestWalletConnection} />
      <PinEntryModal open={pinModalOpen} title="Confirm with PIN" description={payment ? `Enter PIN to receive ${formatTokenAmount(netAmount)} ${payment.payment.token_symbol}.` : "Enter your PIN."} value={pin} onChange={(v) => { lastSubmittedPinRef.current = null; setPin(v.replace(/[^\d]/g, "").slice(0, 6)); }} onClose={() => !claimBusy && setPinModalOpen(false)} busy={claimBusy} />
    </AppMobileShell>
  );
}
