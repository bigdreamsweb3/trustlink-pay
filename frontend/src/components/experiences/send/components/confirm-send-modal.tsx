import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import type { RecipientLookupResult, WalletTokenOption } from "@/src/lib/types";
import { formatUsd, type SendCostEstimate } from "@/src/components/experiences/send/shared/send-cost";
import type { SendFormState } from "@/src/components/experiences/send/lib/recipient-resolution";

type ConfirmSendModalProps = {
  open: boolean;
  recipientPreview: RecipientLookupResult | null;
  selectedToken: WalletTokenOption | null;
  form: SendFormState;
  estimateBusy: boolean;
  estimateError: string | null;
  sendCostEstimate: SendCostEstimate | null;
  confirmSendDisabled: boolean;
  busy: boolean;
  onClose: () => void;
  onRetryEstimate: () => void;
  onConfirmSend: () => void;
};

export function ConfirmSendModal({
  open,
  recipientPreview,
  selectedToken,
  form,
  estimateBusy,
  estimateError,
  sendCostEstimate,
  confirmSendDisabled,
  busy,
  onClose,
  onRetryEstimate,
  onConfirmSend,
}: ConfirmSendModalProps) {
  if (!open || !recipientPreview?.verified || !selectedToken) return null;

  return (
    <div className="fixed inset-0 z-999 grid place-items-end tl-overlay md:place-items-center" onClick={onClose}>
      <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5">
          <h2 className="tl-h3 font-semibold tracking-[-0.04em] text-text">Authorize transfer</h2>
          <p className="mt-1  text-text-soft">You will sign a TSN authorization message. Your wallet will not broadcast a Solana transaction.</p>
        </div>

        <div className="space-y-2.5">
          <div className="tl-panel tl-field rounded-[18px] px-4 py-3.5">
            <div className="tl-meta-sm uppercase tracking-[0.18em] text-text-soft">Sending to</div>
            <div className="mt-1.5 text-[0.92rem] font-semibold text-text">
              {recipientPreview.recipient.displayName}
              {"handle" in recipientPreview.recipient && recipientPreview.recipient.handle ? ` (@${recipientPreview.recipient.handle})` : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required" ? " (Not on TrustLink)" : ""}
            </div>
            {recipientPreview.recipient.whatsappProfileName && recipientPreview.recipient.whatsappProfileName !== recipientPreview.recipient.displayName ? (
              <div className="mt-1 text-[0.76rem] text-text-soft">WhatsApp: {recipientPreview.recipient.whatsappProfileName}</div>
            ) : null}
          </div>

          <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3.5">
            <span className=" font-medium text-text">{form.amount} {selectedToken.symbol}</span>
            <span className="text-[0.78rem] text-text-soft">{form.receiverPhone}</span>
          </div>

          {estimateBusy ? (
            <div className="tl-panel tl-field rounded-[18px] px-4 py-5">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                <div>
                  <div className=" font-semibold text-text">Calculating payment quote</div>
                  <div className="mt-1 text-[0.72rem] leading-relaxed text-text-soft">Fetching TSN sender fee and current Solana network fee.</div>
                </div>
              </div>
            </div>
          ) : estimateError ? (
            <div className="rounded-[18px] border border-[var(--danger)]/20 bg-danger-soft px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                <div>
                  <div className=" font-semibold text-[var(--danger)]">Quote unavailable</div>
                  <div className="mt-1 text-[0.72rem] leading-relaxed text-[var(--danger)]/80">{estimateError}</div>
                  <button
                    type="button"
                    onClick={onRetryEstimate}
                    className="mt-3 inline-flex items-center gap-2 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--field)] px-3 py-2 text-[0.72rem] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--surface-soft)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry quote
                  </button>
                </div>
              </div>
            </div>
          ) : sendCostEstimate ? (
            <>
              <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
                <span className="text-[0.78rem] text-text-soft">Sender fee</span>
                <span className="text-right">
                  <span className="block  font-medium text-text">{sendCostEstimate.senderFeeAmountUi.toFixed(6)} {selectedToken.symbol}</span>
                  {formatUsd(sendCostEstimate.senderFeeAmountUsd) ? <span className="block text-[0.68rem] text-text-faint">{formatUsd(sendCostEstimate.senderFeeAmountUsd)}</span> : null}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="tl-panel tl-field rounded-[14px] px-3 py-2.5">
                  <div className="text-[0.68rem] text-text-soft">Solana network fee</div>
                  <div className="mt-1  font-semibold text-text">{sendCostEstimate.networkFeeSol.toFixed(6)} SOL</div>
                  {formatUsd(sendCostEstimate.networkFeeUsd) ? <div className="mt-0.5 text-[0.66rem] text-text-faint">{formatUsd(sendCostEstimate.networkFeeUsd)}</div> : null}
                </div>
                <div className="tl-panel tl-field rounded-[14px] px-3 py-2.5">
                  <div className="text-[0.68rem] text-text-soft">Total required</div>
                  <div className="mt-1  font-semibold text-text">{sendCostEstimate.totalTokenRequiredUi.toFixed(6)} {selectedToken.symbol}</div>
                </div>
              </div>
              {sendCostEstimate.settlementAssessment ? (
                <div
                  className={`rounded-[14px] border px-3 py-2 text-[0.72rem] ${sendCostEstimate.settlementAssessment.likelihood === "likely_claimable"
                    ? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-accent"
                    : sendCostEstimate.settlementAssessment.likelihood === "risky_claim_amount"
                      ? "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]"
                      : "border-[var(--danger)]/35 bg-[var(--danger-soft)] text-[var(--danger)]"
                    }`}
                >
                  {sendCostEstimate.settlementAssessment.likelihood === "likely_claimable"
                    ? "✅ Likely claimable"
                    : sendCostEstimate.settlementAssessment.likelihood === "risky_claim_amount"
                      ? "⚠️ Risky claim amount"
                      : "❌ Economically non-claimable"}
                  <div className="mt-1 tl-meta-sm opacity-90">
                    {sendCostEstimate.settlementAssessment.reason} Minimum suggested send: {sendCostEstimate.settlementAssessment.minimumTransferUi.toFixed(4)} {selectedToken.symbol}.
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="tl-button-secondary rounded-[18px] px-4 py-3.5  font-medium cursor-pointer active:scale-[0.97] transition-transform tl-body-sm">Cancel</button>
          <button type="button" onClick={onConfirmSend} disabled={confirmSendDisabled} className="rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3.5  font-semibold text-[#04110a] shadow-softbox disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform tl-body-sm text-nowrap">{busy ? "Queuing..." : estimateBusy ? "Calculating..." : "Co-sign sponsored send"}</button>
        </div>
      </div>
    </div>
  );
}
