"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TrustLinkMark } from "@/src/components/trustlink-mark";

export function SiteHeader() {
  const pathname = usePathname();
  const onAuth = pathname?.startsWith("/auth");

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-[#05090d]/78 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1180px] items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <TrustLinkMark compact />
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-semibold tracking-[-0.04em] text-white">TrustLink</div>
            <div className="text-[0.72rem] uppercase tracking-[0.2em] text-white/36">Crypto over WhatsApp</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {/* <Link
            href="/auth?mode=login"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              onAuth ? "text-white" : "text-white/62 hover:text-white"
            }`}
          >
            Sign in
          </Link> */}
          <Link
            href="/auth?mode=register"
            className="button inline-flex items-center justify-center rounded-[16px] border border-[#76ffd8]/24 bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.18),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.035)_100%)] px-4 py-2.5 text-sm font-semibold tracking-[-0.02em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#76ffd8]/38 hover:bg-[radial-gradient(circle_at_top,rgba(118,255,216,0.22),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)]"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
