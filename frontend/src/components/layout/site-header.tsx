"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { TrustLinkMark } from "@/src/components/trustlink-mark";

const navItems = [
  { label: "TSN Privacy", href: "/#tsn-privacy" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "LP APY", href: "/#lp-yield" },
  { label: "Cranker", href: "/#cranker" },
  { label: "SDK", href: "/#sdk" },
  { label: "TINS", href: "/#tins" },
] as const;


export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => { function h() { setHeaderScrolled(window.scrollY > 8); } h(); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);


  return (
    <header className={`items-center fixed inset-x-0 top-0 z-40 ${headerScrolled || menuOpen ? "bg-bg/90 backdrop-blur-lg border-b border-field-border/50" : "bg-transparent"}`}>
      <div className="mx-auto flex max-h-fit md:min-h-16  w-full max-w-[1180px] items-center justify-between gap-3 py-2.5 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-3" onClick={() => setMenuOpen(false)}>
            <TrustLinkMark compact />
            <div className="min-w-0 flex  items-center gap-1.5">
              <div className="tl-text-muted text-[0.6rem] text-center uppercase tracking-[0.22em] leading-none">TrustLink Pay</div>
              <Link
                href="/#tsn-protocol"
                onClick={() => setMenuOpen(false)}
                className="rounded-full border tl-badge px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.14em] sm:inline-flex"
              >
                TSN Protocol
              </Link>
            </div>
          </div>

        </div>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Landing page sections">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-[0.72rem] font-bold text-[var(--text-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/operator-dashboard"
            className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 font-semibold uppercase tracking-[0.14em] sm:inline-flex"
          >
            Operator
          </Link>
          <Link
            href="/app"
            className="tl-button-secondary inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 font-semibold uppercase tracking-normal transition"
          >
            Open Dapp
          </Link>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-[14px] text-[var(--text)] md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-[var(--field-border)] bg-[var(--bg-elevated)] px-4 pb-4 pt-2 shadow-[0_18px_45px_rgba(0,0,0,0.12)] md:hidden">
          <div className="mx-auto grid w-full max-w-[1180px] gap-2">

            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-[14px] px-4 py-3 text-[0.72rem] font-bold text-[var(--text-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <Link
                href="/operator-dashboard"
                onClick={() => setMenuOpen(false)}
                className="tsn-button-transparent inline-flex items-center justify-center rounded-[14px] px-4 py-3 font-semibold uppercase tracking-[0.14em] sm:inline-flex"
              >
                Operator
              </Link>
              <Link
                href="/app"
                onClick={() => setMenuOpen(false)}
                className="tl-button-secondary inline-flex items-center justify-center rounded-[14px] px-4 py-3 font-semibold uppercase"
              >
                Open Dapp
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
