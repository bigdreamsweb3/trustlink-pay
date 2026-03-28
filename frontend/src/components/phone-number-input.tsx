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
      ? "border-[#58f2b1]/45 bg-black/20"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-black/20"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-black/20"
          : isOpen
            ? "border-[#58f2b1]/50 bg-[#0b1017] ring-1 ring-[#58f2b1]/20"
            : "border-white/10 bg-black/20 hover:border-white/20";

  const indicatorClass =
    verificationState === "valid"
      ? "border-[#58f2b1]/35 bg-[#58f2b1]/12 text-[#7dffd9]"
      : verificationState === "warning"
        ? "border-[#f3c96b]/35 bg-[#f3c96b]/12 text-[#f3c96b]"
        : verificationState === "invalid"
          ? "border-[#ff7f7f]/35 bg-[#ff7f7f]/12 text-[#ffadad]"
          : "border-white/12 bg-white/8 text-white/55";

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
        <label className="ml-1 text-xs font-medium uppercase tracking-widest text-white/40">
          {label}
        </label>
      ) : null}

      <div className="relative group">
        <div className={`flex h-14 items-stretch rounded-2xl border transition-all duration-300 ${toneClass}`}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="min-w-fit rounded-l-2xl border-r border-white/10 px-4 transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{selectedCountry.flag}</span>
              <span className="whitespace-nowrap text-sm font-semibold text-white">{selectedCountry.dialCode}</span>
              <ChevronDown className={`h-4 w-4 text-white/40 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
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
              className="h-full w-full bg-transparent px-4 text-lg font-medium text-white outline-none placeholder:text-white/20"
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
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1017] shadow-2xl backdrop-blur-xl"
            >
              <div className="border-b border-white/5 p-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search countries..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-transparent bg-white/5 py-2 pl-9 pr-4 text-sm text-white outline-none focus:border-white/10"
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
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/5 ${selectedCountry.iso2 === country.iso2 ? "bg-white/5" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{country.flag}</span>
                        <div>
                          <div className="text-sm font-semibold text-white">{country.name}</div>
                          <div className="text-[10px] text-white/40">{country.iso2}</div>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-white">{country.dialCode}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {verificationLabel && verificationState === "checking" ? (
        <div className="ml-1 text-[0.72rem] text-white/42">
          {verificationLabel}
        </div>
      ) : null}

      {showSummaryCard ? (
        <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
          <div className="flex items-center gap-3">
            {isBusiness ? (
              <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/6">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={displayName ?? "Business WhatsApp profile"} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[0.62rem] font-semibold tracking-[0.12em] text-white/50">BIZ</span>
                )}
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#25D366]/16">
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                </span>
                <div className="truncate text-sm font-semibold text-white">
                  {isBusiness ? displayName ?? "Business profile detected" : "Personal or unknown profile"}
                </div>
              </div>
              <div className="mt-1 text-[0.72rem] text-white/50">
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
                className="px-3 py-1.5 text-[0.72rem] font-semibold text-[#86ffda]"
              >
                Verify on WhatsApp
              </a>
              {onSkipVerification && skipVerificationLabel ? (
                <button
                  type="button"
                  onClick={onSkipVerification}
                  className="text-[0.72rem] font-medium text-white/68 transition hover:text-white"
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
