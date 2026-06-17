"use client";

import Link from "next/link";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

import { TrustLinkMark } from "@/src/components/trustlink-mark";

const navItems = [
  { label: "Identity", href: "/#identity" },
  { label: "Verification", href: "/#verification" },
  { label: "Settlement", href: "/#settlement" },
  { label: "Developers", href: "/#developers" },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage or system preference
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const isDarkTheme = saved ? saved === "dark" : prefersDark;
    setIsDark(isDarkTheme);
    if (isDarkTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
    if (newIsDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  useEffect(() => {
    function h() {
      setHeaderScrolled(window.scrollY > 8);
    }
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <>
      <header
        className={`items-center fixed inset-x-0 top-0 z-40 ${headerScrolled || menuOpen ? "bg-dock/90 backdrop-blur-lg border-b border-field-border/50" : "bg-transparent"}`}
      >
        <div className="mx-auto flex max-h-fit md:min-h-16  w-full max-w-[1280px] items-center justify-between gap-3 py-2.5 px-4 md:px-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex items-center gap-2 whitespace-nowrap"
              onClick={() => setMenuOpen(false)}
            >
              <Link
                href="/"
                className="flex items-center gap-1 whitespace-nowrap"
              >
                <TrustLinkMark compact />

                <span className="text-[0.65rem] font-black uppercase tracking-widest text-accent-deep">
                  TrustLink Pay
                </span>
              </Link>

              <Link
                href="/#tsn-protocol"
                className="tl-text-muted text-[0.6rem] tracking-[0.22em] leading-none whitespace-nowrap"
              >
                TSN
                <span className="hidden md:inline"> Protocol</span>
              </Link>
            </div>

          </div>

          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Landing page sections"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-2 text-[0.95rem] font-bold text-text-soft tracking-[0.05em] font-sans transition hover:bg-surface-soft hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={toggleTheme}
              className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 font-semibold uppercase tracking-[0.14em] transition"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDark ? "Light Mode" : "Dark Mode"}
            >
              {mounted &&
                (isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                ))}
            </button>
            <Link
              href="/operator-dashboard"
              className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 font-semibold uppercase tracking-[0.14em] sm:inline-flex"
            >
              Operator
            </Link>
            <Link
              href="/app"
              className="tl-button-transparent inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 font-semibold uppercase tracking-normal transition"
            >
              Open Dapp
            </Link>
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-[14px] text-text md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-elevated)] md:hidden"
          style={{
            animation:
              "menuSlideIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <style>{`
            @keyframes menuSlideIn {
              from { transform: translateX(30px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>

          <div className="flex items-center justify-between px-4 md:px-6 py-2.5 min-h-[64px] border-b border-[var(--field-border)]">
            <div className="flex items-center gap-2">
              <TrustLinkMark compact />
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[var(--text-faint)]">
                Navigation
              </span>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-[14px] text-[var(--text)] transition hover:bg-[var(--surface-soft)]"
              onClick={() => setMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col">
            <nav className="flex flex-col gap-8 mb-auto">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-[1.75rem] font-black tracking-[-0.03em] text-[var(--text-soft)] transition hover:text-[var(--text)] flex items-center justify-between group"
                >
                  {item.label}
                  <span className="text-[var(--field-border)] transition group-hover:text-[var(--accent)] group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              ))}
            </nav>

            <div className="mt-12 flex flex-col gap-3">
              <button
                onClick={toggleTheme}
                className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-4 py-4 font-semibold uppercase tracking-[0.14em] gap-2"
              >
                {mounted &&
                  (isDark ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  ))}
                {isDark ? "Light Mode" : "Dark Mode"}
              </button>
              <Link
                href="/operator-dashboard"
                onClick={() => setMenuOpen(false)}
                className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-4 py-4 font-semibold uppercase tracking-[0.14em]"
              >
                Operator
              </Link>
              <Link
                href="/app"
                onClick={() => setMenuOpen(false)}
                className="tl-button-primary inline-flex items-center justify-center rounded-[14px] px-4 py-4 font-semibold uppercase tracking-[0.05em]"
              >
                Open Dapp
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
