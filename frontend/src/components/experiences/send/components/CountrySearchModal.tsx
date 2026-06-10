"use client";

import { Search, X } from "lucide-react";
import type { CountryOption } from "@/src/lib/phone-countries";

type CountrySearchModalProps = {
  open: boolean;
  query: string;
  countries: CountryOption[];
  activeCountry: CountryOption | null;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelectCountry: (country: CountryOption) => void;
};

export function CountrySearchModal({
  open,
  query,
  countries,
  activeCountry,
  onQueryChange,
  onClose,
  onSelectCountry,
}: CountrySearchModalProps) {
  if (!open) return null;

  return (
    <div className="tl-overlay fixed inset-0 z-999 grid place-items-end md:place-items-center" onClick={onClose}>
      <div className="tl-modal flex w-full max-h-[85vh] flex-col rounded-t-[28px] md:max-w-[430px] md:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <div className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--text)]">Select Country</h2>
              <p className="mt-0.5 text-[0.76rem] text-[var(--text-faint)]">Choose the recipient country code</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-soft)] text-[var(--text-faint)] transition-colors hover:text-[var(--text)] cursor-pointer active:scale-[0.93]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by name or code..."
              autoFocus
              className="w-full rounded-[14px] border border-[var(--field-border)] bg-[var(--field)] py-2.5 pl-10 pr-4  text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-border)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 tl-scrollbar-mobile-hidden">
          <div className="space-y-0.5">
            {countries.map((country) => {
              const isActive = country.iso2 === activeCountry?.iso2;
              return (
                <button
                  key={country.iso2}
                  type="button"
                  onClick={() => onSelectCountry(country)}
                  className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-colors cursor-pointer active:scale-[0.99] ${isActive ? "bg-[var(--accent-soft)] border border-[var(--accent-border)]" : "hover:bg-[var(--surface-soft)]"}`}
                >
                  <span className="text-[1.1rem] leading-none">{country.flag}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block  font-medium text-text truncate">{country.name}</span>
                  </span>
                  <span className="shrink-0 text-[0.76rem] font-medium text-text-faint">{country.dialCode}</span>
                </button>
              );
            })}
            {countries.length === 0 ? (
              <div className="py-8 text-center  tl-text-muted">No countries match {query}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
