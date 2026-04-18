"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search } from "lucide-react";

import {
  COUNTRY_OPTIONS,
  detectCountryFromLocale,
  getCountryByIso2,
  splitPhoneNumber,
  type CountryOption
} from "@/src/lib/phone-countries";
import { loadPreferredCountryIso2 } from "@/src/lib/phone-preferences";
import { WhatsAppIcon } from "@/src/components/whatsapp-icon";

type PhoneNumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string, country: CountryOption) => void;
  placeholder?: string;
  maxLocalDigits?: number;
  verificationState?: "idle" | "checking" | "valid" | "warning" | "invalid";
  verificationLabel?: string | null;
  verificationDetails?: {
    displayName: string | null;
    profilePic: string | null;
    exists: boolean;
    isBusiness: boolean;
    url: string;
  } | null;
  onSkipVerification?: (() => void) | null;
  skipVerificationLabel?: string | null;
  showVerificationActions?: boolean;
};

export function PhoneNumberInput({
  label,
  value,
  onChange,
  placeholder = "903 700 0000",
  maxLocalDigits,
  verificationState = "idle",
  verificationLabel = null,
  verificationDetails = null,
  onSkipVerification = null,
  skipVerificationLabel = "Skip",
  showVerificationActions = true,
}: PhoneNumberInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRY_OPTIONS[0]);
  const [localNumber, setLocalNumber] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const initialized = useRef(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const defaultCountry = useMemo(() => {
    const preferred = getCountryByIso2(loadPreferredCountryIso2());
    return preferred ?? detectCountryFromLocale();
  }, []);

  const filteredCountries = useMemo(() => {
    return COUNTRY_OPTIONS.filter((country) =>
      country.name?.toLowerCase().includes(search.toLowerCase()) ||
      country.dialCode?.includes(search) ||
      country.iso2?.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  useEffect(() => {
    const parsed = splitPhoneNumber(value);

    if (value && parsed.country) {
      setSelectedCountry(parsed.country);
      setLocalNumber(parsed.localNumber);
      initialized.current = true;
      return;
    }

    if (!value && !initialized.current) {
      setSelectedCountry(defaultCountry);
      setLocalNumber("");
      onChange(defaultCountry.dialCode, defaultCountry);
      initialized.current = true;
      return;
    }

    if (!value) {
      setSelectedCountry(defaultCountry);
      setLocalNumber("");
      return;
    }

    setSelectedCountry(defaultCountry);
    setLocalNumber(parsed.localNumber);
  }, [defaultCountry, onChange, value]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      window.addEventListener("mousedown", handleOutsideClick);
    }

    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  function handlePhoneChange(phoneNumber: string) {
    const normalizedNumber = phoneNumber.replace(/[^\d]/g, "");
    const nextNumber = typeof maxLocalDigits === "number" ? normalizedNumber.slice(0, maxLocalDigits) : normalizedNumber;
    setLocalNumber(nextNumber);
    onChange(`${selectedCountry.dialCode}${nextNumber}`, selectedCountry);
  }

  function handleCountryChange(country: CountryOption) {
    setSelectedCountry(country);
    onChange(`${country.dialCode}${localNumber}`, country);
  }

  const toneClass =
    verificationState === "valid"
      ? "border-[var(--accent-border)] bg-[var(--field)]"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-[var(--field)]"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-[var(--field)]"
          : isOpen
            ? "border-[var(--accent-border)] bg-[var(--surface)] ring-1 ring-[var(--accent-soft)]"
            : "border-[var(--field-border)] bg-[var(--field)] hover:border-[var(--accent-border)]";

  const indicatorClass =
    verificationState === "valid"
      ? "border-[#58f2b1]/35 bg-[#58f2b1]/12 text-[#7dffd9]"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-[#f3c96b]/12 text-[#f3c96b]"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-[#ff7f7f]/12 text-[#ffadad]"
          : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-soft)]";

  const indicatorText =
    verificationState === "valid" ? "✓" : verificationState === "warning" ? "!" : verificationState === "invalid" ? "x" : "...";

  const showSummaryCard = verificationDetails && verificationState !== "checking";
  const isBusiness = Boolean(verificationDetails?.isBusiness);
  const displayName = verificationDetails?.displayName?.trim() || null;
  const avatarSrc =
    isBusiness && verificationDetails?.profilePic
      ? `/backend/api/whatsapp/avatar?url=${encodeURIComponent(verificationDetails.profilePic)}`
      : null;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="tl-text-muted ml-1 text-xs font-medium uppercase tracking-widest">
          {label}
        </label>
      ) : null}

      <div className="relative group">
        <div className={`flex h-14 items-stretch rounded-2xl border transition-all duration-300 ${toneClass}`}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="min-w-fit rounded-l-2xl border-r border-[var(--field-border)] px-4 transition-colors hover:bg-[var(--surface-soft)]"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{selectedCountry.flag}</span>
              <span className="whitespace-nowrap text-sm font-semibold text-[var(--text)]">{selectedCountry.dialCode}</span>
              <ChevronDown className={`tl-text-muted h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </button>

          <div className="flex-1">
            <input
              type="tel"
              value={localNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder={placeholder}
              inputMode="tel"
              maxLength={typeof maxLocalDigits === "number" ? maxLocalDigits : undefined}
              className="h-full w-full bg-transparent px-4 text-lg font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          {verificationState !== "idle" ? (
            <div className="flex items-center pr-4">
              <span className={`grid h-7 min-w-7 place-items-center rounded-full border px-2 text-[0.68rem] font-semibold ${indicatorClass}`} title={verificationLabel ?? undefined}>
                {indicatorText}
              </span>
            </div>
          ) : null}
        </div>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="tl-modal absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl shadow-softbox -2xl"
            >
              <div className="border-b border-[var(--field-border)] p-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search countries..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="tl-field w-full rounded-xl py-2 pl-9 pr-4 text-sm text-[var(--text)] outline-none"
                  />
                </div>
              </div>

              <div className="custom-scrollbar max-h-64 overflow-y-auto">
                {filteredCountries.map((country) => (
                  <button
                    key={country.iso2}
                    type="button"
                    onClick={() => {
                      handleCountryChange(country);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] ${selectedCountry.iso2 === country.iso2 ? "bg-[var(--accent-soft)]" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{country.flag}</span>
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{country.name}</div>
                          <div className="tl-text-muted text-[10px]">{country.iso2}</div>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-[var(--text)]">{country.dialCode}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {verificationLabel && verificationState === "checking" ? (
        <div className="tl-text-muted ml-1 text-[0.72rem]">
          {verificationLabel}
        </div>
      ) : null}

      {showSummaryCard ? (
        <div className="tl-field rounded-[20px] px-4 py-3">
          <div className="flex items-center gap-3">
            {isBusiness ? (
              <div className="tl-icon-surface grid h-12 w-12 place-items-center overflow-hidden rounded-full">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={displayName ?? "Business WhatsApp profile"} className="h-full w-full object-cover" />
                ) : (
                  <span className="tl-text-muted text-[0.62rem] font-semibold tracking-[0.12em]">BIZ</span>
                )}
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#25D366]/16">
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                </span>
                <div className="truncate text-sm font-semibold text-[var(--text)]">
                  {isBusiness ? displayName ?? "Business profile detected" : "Personal or unknown profile"}
                </div>
              </div>
              <div className="tl-text-muted mt-1 text-[0.72rem]">
                {isBusiness
                  ? "Business WhatsApp profile"
                  : "This number is not a business number. Please verify if this profile is a real personal WhatsApp account."}
              </div>
            </div>
          </div>

          {!isBusiness && showVerificationActions ? (
            <div className="mt-3 flex items-center justify-end gap-3">
              <a
                href={verificationDetails.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-[0.72rem] font-semibold text-[var(--accent-deep)] dark:text-[#86ffda]"
              >
                Verify on WhatsApp
              </a>
              {onSkipVerification && skipVerificationLabel ? (
                <button
                  type="button"
                  onClick={onSkipVerification}
                  className="tl-text-soft text-[0.72rem] font-medium transition hover:text-[var(--text)]"
                >
                  {skipVerificationLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
