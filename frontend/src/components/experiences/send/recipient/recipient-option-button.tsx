import { ChevronRight, Clock3, Contact } from "lucide-react";

import type { SendRecipientOption } from "./types";

export function RecipientOptionButton({
  option,
  onSelect,
}: {
  option: SendRecipientOption;
  onSelect: (option: SendRecipientOption) => void;
}) {
  const SourceIcon = option.source === "contact" ? Contact : Clock3;

  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className="tl-panel tl-field group flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition-all hover:border-[var(--accent-deep)]/40 hover:bg-[var(--surface-soft)] active:scale-[0.99]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-soft)]">
        <SourceIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.78rem] font-semibold text-text">
          {option.displayName}
        </span>
        <span className="tl-text-muted block truncate text-[0.66rem]">
          {option.tin ? `TIN ${option.tin}` : option.phoneNumber}
          {option.trustlinkHandle ? ` · @${option.trustlinkHandle}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2.5 py-1.5 text-[0.62rem] font-semibold text-accent transition-transform group-hover:translate-x-0.5">
        Select
        <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  );
}
