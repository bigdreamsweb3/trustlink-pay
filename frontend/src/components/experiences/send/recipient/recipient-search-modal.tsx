"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, X } from "lucide-react";

import { RecipientOptionButton } from "./recipient-option-button";
import { searchSendRecipientOptions } from "./recipient-options";
import type { SendRecipientOption } from "./types";

export function RecipientSearchModal({
  open,
  options,
  onClose,
  onSelect,
}: {
  open: boolean;
  options: SendRecipientOption[];
  onClose: () => void;
  onSelect: (option: SendRecipientOption) => void;
}) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const filteredOptions = useMemo(
    () => searchSendRecipientOptions(options, query),
    [options, query],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.setTimeout(() => searchInput.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipient-search-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="tl-panel flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[26px] border border-[var(--border)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
          <div>
            <h2 id="recipient-search-title" className="text-base font-bold text-text">
              Find a recipient
            </h2>
            <p className="mt-1 text-[0.72rem] text-[var(--text-soft)]">
              Search saved contacts and people you have paid before.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-soft)]"
            aria-label="Close recipient search"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-[var(--border)] p-4">
          <label className="tl-field flex items-center gap-2 rounded-[14px] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone number, TIN, or handle"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-[var(--text-faint)]"
            />
          </label>
        </div>

        <div className="min-h-[220px] flex-1 space-y-2 overflow-y-auto p-4">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <RecipientOptionButton
                key={option.id}
                option={option}
                onSelect={(selected) => {
                  onSelect(selected);
                  onClose();
                }}
              />
            ))
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--text-faint)]">
                <Users className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-text">No recipient found</p>
              <p className="mt-1 text-[0.72rem] text-[var(--text-soft)]">
                Enter their phone number or 10-digit TIN in the send form.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
