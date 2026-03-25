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

type PhoneNumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string, country: CountryOption) => void;
  placeholder?: string;
  maxLocalDigits?: number;
};

export function PhoneNumberInput({
  label,
  value,
  onChange,
  placeholder = "903 700 0000",
  maxLocalDigits
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

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-medium uppercase tracking-widest text-white/40 ml-1">
          {label}
        </label>
      )}

      <div className="relative group">
        {/* Main Container */}
        <div
          className={`
            flex items-stretch h-14 rounded-2xl border transition-all duration-300
            ${isOpen ? "border-[#58f2b1]/50 bg-[#0b1017] ring-1 ring-[#58f2b1]/20" : "border-white/10 bg-black/20 hover:border-white/20"}
          `}
        >
          {/* Country Selector Button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-3 px-4 border-r border-white/10 hover:bg-white/5 transition-colors rounded-l-2xl min-w-fit"
          >
            <span className="text-xl">{selectedCountry.flag}</span>
            <span className="font-semibold text-white text-sm whitespace-nowrap">{selectedCountry.dialCode}</span>
            <ChevronDown
              className={`w-4 h-4 text-white/40 transition-transform duration-300 ${isOpen ? "rotate-180" : ""
                }`}
            />
          </button>

          {/* Phone Number Input */}
          <div className="flex-1">
            <input
              type="tel"
              value={localNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder={placeholder}
              inputMode="tel"
              maxLength={typeof maxLocalDigits === "number" ? maxLocalDigits : undefined}
              className="w-full h-full bg-transparent px-4 text-white font-medium text-lg outline-none placeholder:text-white/20"
            />
          </div>
        </div>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-white/10 bg-[#0b1017] shadow-2xl overflow-hidden backdrop-blur-xl"
            >
              <div className="p-2 border-b border-white/5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search countries..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white/5 rounded-xl py-2 pl-9 pr-4 text-sm text-white outline-none border border-transparent focus:border-white/10"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {filteredCountries.map((country) => (
                  <button
                    key={country.iso2}
                    type="button"
                    onClick={() => {
                      handleCountryChange(country);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`
                      w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors
                      ${selectedCountry.iso2 === country.iso2
                        ? "bg-white/5"
                        : ""
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{country.flag}</span>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-white">
                          {country.name}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {country.iso2}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-white">
                      {country.dialCode}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
