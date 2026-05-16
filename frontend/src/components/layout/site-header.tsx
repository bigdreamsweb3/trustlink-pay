"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { TrustLinkMark } from "@/src/components/trustlink-mark";

const navItems = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "LP Yield", href: "/#lp-yield" },
  { label: "Cranker", href: "/#cranker" },
  { label: "SDK", href: "/#sdk" },
  { label: "TINS", href: "/#tins" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="tl-topbar fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1180px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setMenuOpen(false)}>
            <TrustLinkMark compact />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-normal text-[var(--text)]">TrustLink Pay</div>
              <div className="truncate text-[0.68rem] uppercase tracking-[0.16em] tl-text-muted">Transfer Settlement Network</div>
            </div>
          </Link>
          <Link
            href="/#tsn-protocol"
            onClick={() => setMenuOpen(false)}
            className="hidden rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--accent)] sm:inline-flex"
          >
            TSN Protocol
          </Link>
        </div>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Landing page sections">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-[0.78rem] font-bold text-[var(--text-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/operator-dashboard"
            className="tl-button-secondary inline-flex items-center justify-center rounded-[14px] px-3.5 py-2.5 text-sm font-semibold tracking-normal transition"
          >
            Operator Dashboard
          </Link>
          <Link
            href="/app"
            className="tl-button-primary inline-flex items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-semibold tracking-normal transition"
          >
            Open App
          </Link>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-[14px] border border-[var(--field-border)] bg-[var(--field)] text-[var(--text)] md:hidden"
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
            <Link
              href="/#tsn-protocol"
              onClick={() => setMenuOpen(false)}
              className="rounded-[14px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-black text-[var(--accent)]"
            >
              TSN Protocol
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-[14px] px-4 py-3 text-sm font-bold text-[var(--text-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <Link
                href="/operator-dashboard"
                onClick={() => setMenuOpen(false)}
                className="tl-button-secondary inline-flex items-center justify-center rounded-[14px] px-4 py-3 text-sm font-semibold"
              >
                Operator Dashboard
              </Link>
              <Link
                href="/app"
                onClick={() => setMenuOpen(false)}
                className="tl-button-primary inline-flex items-center justify-center rounded-[14px] px-4 py-3 text-sm font-semibold"
              >
                Open App
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
