import { RecipientOptionButton } from "./recipient-option-button";
import type { SendRecipientOption } from "./types";

export function RecipientSuggestions({
  options,
  onSelect,
}: {
  options: SendRecipientOption[];
  onSelect: (option: SendRecipientOption) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="mt-2 space-y-2" aria-label="Matching recipients">
      <p className="px-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        Matching recipients
      </p>
      {options.map((option) => (
        <RecipientOptionButton
          key={option.id}
          option={option}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
