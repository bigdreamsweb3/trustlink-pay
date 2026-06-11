import { SectionLoader } from "@/src/components/section-loader";
import type { WalletTokenOption } from "@/src/lib/types";
import { formatTokenBalance } from "@/src/components/experiences/send/lib/send-formatters";

type TokenPickerModalProps = {
  open: boolean;
  tokenBusy: boolean;
  tokens: WalletTokenOption[];
  selectedMintAddress: string;
  onClose: () => void;
  onSelectToken: (token: WalletTokenOption) => void;
};

export function TokenPickerModal({ open, tokenBusy, tokens, selectedMintAddress, onClose, onSelectToken }: TokenPickerModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-999 grid place-items-end tl-overlay md:place-items-center" onClick={onClose}>
      <div className="tl-modal w-full rounded-t-[28px] px-6 pb-8 pt-6 md:max-w-[430px] md:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5">
          <h2 className="tl-h3 font-semibold tracking-[-0.04em] text-text">Choose token</h2>
          <p className="mt-1  text-text-soft">Supported tokens from your wallet.</p>
        </div>
        <div className="space-y-2.5">
          {tokenBusy ? (
            <div className="tl-panel tl-field rounded-[18px] px-4 py-5"><SectionLoader size="md" label="Loading tokens..." /></div>
          ) : tokens.map((token) => {
            const active = token.mintAddress === selectedMintAddress;
            return (
              <button key={token.mintAddress} type="button"
                onClick={() => onSelectToken(token)}
                className={`tl-panel tl-field flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors cursor-pointer active:scale-[0.99] ${active ? "border-[var(--accent-deep)]/30 bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-soft)]"}`}
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[0.9rem]">{token.logo}</span>
                  <span>
                    <span className="block  font-semibold leading-tight text-text">{token.symbol}</span>
                    <span className="tl-text-soft block mt-0.5 tl-meta-sm leading-tight">{token.name}</span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="block  font-semibold leading-tight text-text">{formatTokenBalance(token.balance, token.symbol)}</span>
                  <span className="tl-text-soft block mt-0.5 tl-meta-sm leading-tight">Available</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
