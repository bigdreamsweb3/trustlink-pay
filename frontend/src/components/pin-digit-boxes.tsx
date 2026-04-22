"use client";

export function PinDigitBoxes({ pin, size = "md" }: { pin: string; size?: "md" | "lg" }) {
  const heightClass = size === "lg" ? "h-14" : "h-12";

  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, index) => {
        const isFilled = Boolean(pin[index]);
        const isActive = index === Math.min(pin.length, 5);

        return (
          <div
            key={index}
            className={`grid ${heightClass} place-items-center rounded-[18px] border text-lg font-semibold transition ${
              isFilled
                ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)] dark:text-text"
                : isActive
                  ? "border-[var(--accent-border)] bg-[var(--surface-soft)] text-[var(--text-soft)]"
                  : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)]"
            }`}
          >
            {isFilled ? "â€¢" : ""}
          </div>
        );
      })}
    </div>
  );
}
