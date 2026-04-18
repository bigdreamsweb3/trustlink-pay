"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TrustLinkMark } from "@/src/components/trustlink-mark";

export function SiteHeader() {
  const pathname = usePathname();
  const onAuth = pathname?.startsWith("/auth");

  return (
    <header className="tl-topbar fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1180px] items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <TrustLinkMark compact />
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">TrustLink</div>
            <div className="text-[0.72rem] uppercase tracking-[0.2em] tl-text-muted">Crypto over WhatsApp</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {/* <Link
            href="/auth?mode=login"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              onAuth ? "text-text" : "text-text/62 hover:text-text"
            }`}
          >
            Sign in
          </Link> */}
          <Link
            href="/auth?mode=register"
            className="button tl-button-primary inline-flex items-center justify-center rounded-[16px] px-4 py-2.5 text-sm font-semibold tracking-[-0.02em] transition"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
