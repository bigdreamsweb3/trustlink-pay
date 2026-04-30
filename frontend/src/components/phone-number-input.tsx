"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search } from "lucide-react";

import { SectionLoader } from "@/src/components/section-loader";

import type { CountryOption } from "@/src/lib/phone-countries";
import { COUNTRY_OPTIONS, formatPhoneInput } from "@/src/lib/phone-countries";
import type { RecipientLookupResult } from "@/src/lib/types";
import { WhatsAppIcon } from "./whatsapp-icon";

type PhoneVerificationDetails = {
  displayName: string | null;
  profilePic: string | null;
  exists: boolean;
  isBusiness: boolean;
  url: string;
  resolvedPhoneNumber?: string | null;
  detectedCountry?: CountryOption | null;
};

type PhoneNumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  verificationState?: "idle" | "checking" | "valid" | "warning" | "invalid";
  verificationLabel?: string | null;
  verificationDetails?: PhoneVerificationDetails | null;
  recipientPreview?: RecipientLookupResult | null;
  lookupBusy?: boolean;
  lookupError?: string | null;
  onSkipVerification?: (() => void) | null;
  skipVerificationLabel?: string | null;
  showVerificationActions?: boolean;
  showCountryFallback?: boolean;
  fallbackMessage?: string | null;
  selectedCountry?: CountryOption | null;
  suggestedCountries?: CountryOption[];
  onCountrySelect?: ((country: CountryOption) => void) | null;
};

function buildCountryList(suggestedCountries: CountryOption[]) {
  const seen = new Set<string>();
  const ordered = [...suggestedCountries, ...COUNTRY_OPTIONS];
  return ordered.filter((country) => {
    if (seen.has(country.iso2)) return false;
    seen.add(country.iso2);
    return true;
  });
}

export function PhoneNumberInput({
  label,
  value,
  onChange,
  placeholder = "Enter phone number",
  verificationState = "idle",
  verificationLabel = null,
  verificationDetails = null,
  recipientPreview = null,
  lookupBusy = false,
  lookupError = null,
  onSkipVerification = null,
  skipVerificationLabel = "Skip",
  showVerificationActions = true,
  showCountryFallback = false,
  fallbackMessage = "We couldn't find this number automatically.",
  selectedCountry = null,
  suggestedCountries = [],
  onCountrySelect = null,
}: PhoneNumberInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const formattedValue = useMemo(() => formatPhoneInput(value), [value]);
  const filteredCountries = useMemo(() => {
    const ordered = buildCountryList(suggestedCountries);
    return ordered.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search) ||
      c.iso2.toLowerCase().includes(search.toLowerCase()),
    );
  }, [search, suggestedCountries]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    if (isOpen) window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const toneClass =
    verificationState === "valid"
      ? "border-[var(--accent-border)] bg-[var(--field)]"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-[var(--field)]"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-[var(--field)]"
          : "tl-field hover:border-[var(--accent-border)]";

  const indicatorClass =
    verificationState === "valid"
      ? "border-[#58f2b1]/35 bg-[#58f2b1]/12 text-[#7dffd9]"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-[#f3c96b]/12 text-[#f3c96b]"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-[#ff7f7f]/12 text-[#ffadad]"
          : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-soft)]";

  const indicatorText =
    verificationState === "valid" ? "OK" : verificationState === "warning" ? "!" : verificationState === "invalid" ? "X" : "...";

  const showSummaryCard = verificationDetails && verificationState !== "checking";
  const showLookupCard = lookupBusy || Boolean(lookupError) || Boolean(recipientPreview) || Boolean(showSummaryCard);
  const isBusiness = Boolean(verificationDetails?.isBusiness);
  const displayName = verificationDetails?.displayName?.trim() || null;
  const avatarSrc =
    isBusiness && verificationDetails?.profilePic
      ? `/backend/api/whatsapp/avatar?url=${encodeURIComponent(verificationDetails.profilePic)}`
      : null;

  useEffect(() => { setAvatarBroken(false); }, [avatarSrc]);

  const trustLinkToneClass =
    recipientPreview?.status === "registered"
      ? "border-[#58f2b1]/18 bg-[#58f2b1]/7"
      : recipientPreview?.status === "whatsapp_only" || recipientPreview?.status === "manual_invite_required"
        ? "border-[#f3c96b]/30 bg-[#f3c96b]/10"
        : recipientPreview?.status === "invalid_whatsapp_number" || lookupError
          ? "border-[#ff7f7f]/18 bg-[#ff7f7f]/8"
          : "border-[var(--field-border)] bg-[var(--field)]";

  function renderWhatsAppCard() {
    if (!showSummaryCard || !verificationDetails) return null;

    return (
      <div className="tl-field relative z-10 rounded-[18px] px-4 py-3.5">
        <div className="flex items-center gap-3.5 w-full">
          {isBusiness ? (
            <div className="tl-icon-surface grid h-11 w-11 min-w-11 shrink-0 place-items-center overflow-hidden rounded-full">
              {avatarSrc && !avatarBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={displayName ?? "WhatsApp profile"}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <span className="tl-text-muted text-[0.58rem] font-semibold tracking-[0.12em]">WA</span>
              )}
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 w-full">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#25D366]/16">
                <WhatsAppIcon className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex w-full items-center justify-between gap-2">
                <div className="truncate text-[0.84rem] font-semibold text-[var(--text)]">
                  {displayName ?? "Personal or unknown"}
                </div>
                {verificationDetails.detectedCountry ? (
                  <div className="tl-text-muted shrink-0 text-[0.68rem]">
                    {verificationDetails.detectedCountry.flag} {verificationDetails.detectedCountry.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="tl-text-muted mt-1 text-[0.68rem] leading-relaxed">
              {isBusiness
                ? "Business WhatsApp profile"
                : "Not a business number. Verify this is a real personal WhatsApp account."}
            </div>
          </div>
        </div>

        {!isBusiness && showVerificationActions ? (
          <div className="mt-3 flex items-center justify-end gap-3">
            <a
              href={verificationDetails.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[12px] bg-[var(--accent-soft)] px-3 py-1.5 text-[0.72rem] font-semibold text-[var(--accent-deep)] dark:text-[#86ffda] transition-colors hover:opacity-80 cursor-pointer"
            >
              Verify on WhatsApp
            </a>
            {onSkipVerification && skipVerificationLabel ? (
              <button
                type="button"
                onClick={onSkipVerification}
                className="tl-text-soft text-[0.72rem] font-medium transition-colors hover:text-[var(--text)] cursor-pointer active:scale-[0.95]"
              >
                {skipVerificationLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label ? (
        <label className="tl-text-muted ml-0.5 block text-[0.62rem] font-medium uppercase tracking-[0.2em]">
          {label}
        </label>
      ) : null}

      <div className="relative group mt-1.5">
        <div className={`flex h-14 items-stretch rounded-[18px] border transition-all duration-200 ${toneClass}`}>
          <div className="flex-1">
            <input
              type="tel"
              value={formattedValue}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              inputMode="tel"
              className="h-full w-full bg-transparent px-4 text-[1rem] font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          {verificationState !== "idle" ? (
            <div className="flex items-center pr-4">
              <span
                className={`grid h-7 min-w-7 place-items-center rounded-full border px-2 text-[0.66rem] font-semibold transition-all duration-200 ${indicatorClass}`}
                title={verificationLabel ?? undefined}
              >
                {indicatorText}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Country Fallback ── */}
        {showCountryFallback ? (
          <div className="mt-2.5 tl-field rounded-[18px] px-4 py-3.5">
            <div className="text-[0.82rem] font-medium leading-tight text-[var(--text)]">
              {fallbackMessage}
            </div>
            <div className="tl-text-muted mt-0.5 text-[0.68rem] leading-relaxed">
              Pick the country to retry verification.
            </div>

            <button
              type="button"
              onClick={() => setIsOpen((c) => !c)}
              className="tl-field mt-3 flex w-full items-center justify-between rounded-[14px] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="text-lg">{selectedCountry?.flag ?? "🌐"}</span>
                <span className="min-w-0">
                  <span className="block text-[0.84rem] font-semibold leading-tight text-[var(--text)]">
                    {selectedCountry ? selectedCountry.name : "Select Country"}
                  </span>
                  <span className="tl-text-muted block text-[0.62rem] leading-tight mt-0.5">
                    {selectedCountry ? selectedCountry.dialCode : "Suggested countries first"}
                  </span>
                </span>
              </span>
              <ChevronDown className={`tl-text-muted h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {isOpen ? (
                <motion.div
                  ref={dropdownRef}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="tl-modal absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-[18px] shadow-softbox"
                >
                  <div className="border-b border-[var(--field-border)] p-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search countries..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="tl-field w-full rounded-[12px] py-2.5 pl-9 pr-4 text-[0.84rem] text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.iso2}
                        type="button"
                        onClick={() => { onCountrySelect?.(country); setIsOpen(false); setSearch(""); }}
                        className={`w-full px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--surface-soft)] active:scale-[0.99] ${selectedCountry?.iso2 === country.iso2 ? "bg-[var(--accent-soft)]" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{country.flag}</span>
                            <div>
                              <div className="text-[0.84rem] font-semibold text-[var(--text)]">{country.name}</div>
                              <div className="tl-text-muted text-[0.6rem]">{country.iso2}</div>
                            </div>
                          </div>
                          <div className="text-[0.84rem] font-medium text-[var(--text)]">{country.dialCode}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {/* ── Checking label ── */}
      {verificationLabel && verificationState === "checking" ? (
        <div className="tl-text-muted ml-0.5 text-[0.68rem]">{verificationLabel}</div>
      ) : null}

      {/* ── Lookup Result Card ── */}
      {showLookupCard ? (
        <div className={`relative z-10 rounded-[18px] border px-4 py-3.5 ${trustLinkToneClass}`}>
          {lookupBusy ? (
            <SectionLoader label="Verifying recipient..." />
          ) : lookupError ? (
            <div className="text-[0.82rem] text-[#ffadad]">{lookupError}</div>
          ) : null}

          {!lookupBusy && !lookupError && recipientPreview ? (
            <div className="space-y-3">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[0.84rem] font-semibold text-[var(--text)]">
                    {recipientPreview.recipient.displayName}
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[0.64rem] font-semibold ${recipientPreview.status === "registered"
                      ? "bg-[#58f2b1]/12 text-[#7dffd9]"
                      : recipientPreview.status === "whatsapp_only" || recipientPreview.status === "manual_invite_required"
                        ? "bg-[#f3c96b]/14 text-[#f3c96b]"
                        : "bg-[#ff7f7f]/14 text-[#ffadad]"
                      }`}
                  >
                    {recipientPreview.status === "registered"
                      ? "On TrustLink"
                      : recipientPreview.status === "invalid_whatsapp_number"
                        ? "Could not verify"
                        : "Not on TrustLink"}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="truncate text-[0.68rem] text-[var(--text-faint)]">{recipientPreview.recipient.phoneNumber}</div>
                  {recipientPreview.recipient.handle ? (
                    <div className="text-[0.7rem] text-[var(--text-faint)]">@{recipientPreview.recipient.handle}</div>
                  ) : null}
                </div>

                {"warning" in recipientPreview ? (
                  <div className={`mt-1.5 text-[0.72rem] leading-relaxed ${recipientPreview.status === "invalid_whatsapp_number" ? "text-[#ffadad]" : "text-[#f3c96b]"}`}>
                    {recipientPreview.warning}
                  </div>
                ) : null}
              </div>

              {showSummaryCard ? (
                <div className="border-t border-[var(--field-border)] pt-3">
                  {renderWhatsAppCard()}
                </div>
              ) : null}
            </div>
          ) : null}

          {!lookupBusy && !lookupError && !recipientPreview && showSummaryCard ? renderWhatsAppCard() : null}
        </div>
      ) : null}
    </div>
  );
}
