import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Gauge,
  Landmark,
  LockKeyhole,
  Network,
  Phone,
  ShieldCheck,
  UserRoundCheck,
  Wallet,
} from "lucide-react";

import { SiteHeader } from "@/src/components/layout/site-header";
import { TxProcessAnimator } from "./stimulations/tx-process-animator";

const heroStats = [
  { label: "Sender fee model", value: "Transparent", note: "network + TSN protocol fee shown before send" },
  { label: "Settlement target", value: "<3s", note: "from intent to cranker proof" },
  { label: "Identity layer", value: "TINS", note: "10-digit Transfer Identity Number" },
  { label: "Network", value: "Solana", note: "stablecoin payments over TSN" },
];



const transparentFeesRows = [
  ["Transfer amount", "The amount to be sent"],
  ["Solana network fee", "Current chain transaction fee"],
  ["Settlement fee estimates", "TSN protocol coordination fees"],
  ["Recipient readiness", "Status of the recipient identity"],
];

const devSnippet = {
  title: "Programmable Payment Infrastructure",
  code: `const recipient = await tsn.resolveRecipient({
  identifier: "4872193041",
  type: "tin",
});

const quote = await tsn.quotePayment({
  recipientTIN: recipient.tin,
  amount: 100_000_000,
  mint: USDC_MINT,
});

const intent = await tsn.createPaymentIntent({
  quoteId: quote.id,
  senderWallet: wallet.publicKey,
});`
};

export function LandingPage() {
  const mempoolExplorerUrl = process.env.NEXT_PUBLIC_TSN_MEMPOOL_EXPLORER_URL ?? "/tsn-mempool";

  return (
    <main className="app-shell overflow-hidden text-[14px] md:text-[15px]">
      <SiteHeader />

      {/* HERO SECTION - KEPT INTACT */}
      <section id="tsn-protocol" className="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-[1180px] scroll-mt-28 items-center gap-10 px-2 pb-12 pt-2 lg:grid-cols-[0.98fr_1.02fr]">
        <div className="relative z-10">
          <div className="tl-meta-label text-nowrap whitespace-nowrap">
            Transfer Settlement Network · Solana
          </div>
          <h1 className="tl-display mt-5 max-w-[760px]">
            Private blockchain <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-deep">payments as familiar as mobile money.</span>
          </h1>
          <p className="tl-body-lg mt-5 pr-3 max-w-[680px]">
            Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day because they solved identity-first payments. TrustLink Pay brings that same familiar identity layer to Solana stablecoins, while TSN routes settlement through temporary escrow and private claim flows instead of direct wallet-to-wallet transfers.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#how-it-works" className="tl-button-primary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5">
              See how it works <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/app" className="tl-button-secondary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5">
              Open Dapp
            </Link>
            <a href={mempoolExplorerUrl} className="tl-button-secondary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5">
              Open TSN Mempool
            </a>
          </div>

        </div>

        <div id="how-it-works-hero" className="relative z-10 grid gap-3 w-full scroll-mt-28">

          <TxProcessAnimator />

          <div className="grid grid-cols-2 gap-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="tl-field rounded-[14px] p-4">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-text-faint">{stat.label}</p>
                <strong className="mt-2 block text-xl font-black text-[var(--text)]">{stat.value}</strong>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{stat.note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* SECTION 1: IDENTITY-FIRST */}
      <section id="identity-first" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-2 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0">
        <div className="min-w-0">
          <SectionLabel index="01" title="Identity-First Payments" />
          <h2 className="tl-h2 mt-5 text-balance">
            The world already understands how to pay people through identity.
          </h2>
          <p className="tl-body mt-5 max-w-[680px]">
            Nigeria uses OPay.<br />
            India uses UPI.<br />
            Brazil uses Pix.
          </p>
        </div>
        <div className="tl-panel overflow-hidden rounded-[18px] p-8 flex flex-col justify-center">
          <p className="text-[1.1rem] leading-8 text-[var(--text-soft)]">
            Users send money to people — not raw account strings.
            <br /><br />
            TrustLink brings that same identity-first experience to stablecoin payments on Solana. Instead of copying wallet addresses, users pay a <strong>phone number</strong> or a permanent <strong>Transfer Identity Number (TIN)</strong>.
          </p>
        </div>
      </section>





      {/* SECTION 3: WHY ESCROW */}
      <section id="escrow-settlement" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-2 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0">
        <div className="min-w-0">
          <SectionLabel index="02" title="Why Escrow-Based Settlement?" />
          <h2 className="tl-h2 mt-5">
            Traditional wallet transfers expose both parties directly during payment coordination.
          </h2>
          <p className="tl-body mt-5 max-w-[680px]">
            TrustLink uses escrow-backed settlement flows to reduce direct wallet exposure, support onboarding flows, and create programmable infrastructure. Settlement remains verifiable on-chain while abstracting complexity away from normal users.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [ShieldCheck, "Reduce direct wallet exposure"],
            [Network, "Improve payment coordination"],
            [UserRoundCheck, "Support onboarding flows"],
            [Code2, "Programmable settlement infrastructure"],
          ].map(([Icon, title], idx) => (
            <article key={idx} className="tl-panel rounded-[18px] p-5 flex items-center gap-4">
              {/* @ts-ignore */}
              <Icon className="h-6 w-6 text-accent shrink-0" />
              <h3 className="text-[0.95rem] font-bold text-[var(--text)]">{String(title)}</h3>
            </article>
          ))}
        </div>
      </section>


      {/* SECTION 4: TSN & FEES */}
      <section id="tsn" className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-2 py-14 sm:px-6 lg:px-0">
        <SectionLabel index="03" title="Transfer Settlement Network" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2">
              TSN is the settlement infrastructure layer powering TrustLink.
            </h2>
            <p className="mt-4 text-[1rem] leading-8 text-[var(--text-soft)]">
              TSN coordinates payment intents, escrow settlement, payout execution, operator coordination, and settlement verification.
              <br /><br />
              The goal is simple: Make blockchain payments feel closer to familiar mobile-money systems while preserving programmable on-chain settlement.
              <br /><br />
              <em>At launch, TrustLink operates the settlement infrastructure directly while the network matures.</em>
            </p>
          </div>
          <div className="tl-panel rounded-[18px] p-6">
            <h3 className="text-[1.2rem] font-black text-[var(--text)] mb-4">Transparent Fees</h3>
            <p className="text-[0.92rem] leading-7 text-[var(--text-soft)] mb-6">
              TrustLink separates network fees, settlement fees, and infrastructure costs instead of combining everything into a single unclear transaction cost.
            </p>
            <div className="grid gap-2 border-t border-[var(--field-border)] pt-4">
              {transparentFeesRows.map(([label, note]) => (
                <div key={label} className="grid gap-2 border-b border-[var(--field-border)] pb-4 last:border-b-0 md:grid-cols-[1fr_1.5fr]">
                  <span className="tl-label">{label}</span>
                  <p className="tl-meta-sm">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* SECTION 5: TINS */}
      <section id="tins" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-2 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0">
        <div className="min-w-0">
          <SectionLabel index="04" title="TINS" />
          <h2 className="tl-h2 mt-5">
            Transfer Identity Number System.
          </h2>
          <p className="tl-body mt-5 max-w-[680px]">
            Every TrustLink identity is built around a portable Transfer Identity Number (TIN).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            [Wallet, "Wallet-linked identities", "TINS enables wallet-linked payment identities and portable payment routing."],
            [Network, "Connects multiple identifiers", "A TIN can eventually connect phone numbers, social handles, and merchant profiles to the same settlement identity."],
            [Gauge, "Developer-accessible", "Provides developer-accessible identity infrastructure for the entire ecosystem."],
          ].map(([Icon, title, body]) => (
            <article key={String(title)} className="tl-panel rounded-[18px] p-5">
              {/* @ts-ignore */}
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="tl-h3 mt-4">{String(title)}</h3>
              <p className="tl-body-sm mt-3">{String(body)}</p>
            </article>
          ))}
        </div>
      </section>


      {/* SECTION 6: DEVELOPERS */}
      <section id="developers" className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-2 py-14 sm:px-6 lg:px-0">
        <SectionLabel index="05" title="For Developers" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2 items-center">
          <div>
            <h2 className="tl-h2">
              Programmable payment infrastructure.
            </h2>
            <p className="mt-4 text-[1rem] leading-8 text-[var(--text-soft)]">
              TrustLink is designed as programmable payment infrastructure. Developers can resolve identities, quote settlement costs, create payment intents, and integrate escrow-backed payment flows directly into their own applications.
            </p>
          </div>
          <article className="tl-panel overflow-hidden rounded-[18px]">
            <div className="flex items-center gap-2 border-b border-[var(--field-border)] px-4 py-3">
              <Code2 className="h-4 w-4 text-accent" />
              <h3 className="tl-label text-accent">{devSnippet.title}</h3>
            </div>
            <pre className="tl-code overflow-x-auto p-4 text-sm leading-7">
              <code>{devSnippet.code}</code>
            </pre>
          </article>
        </div>
      </section>


      {/* SECTION 7: CURRENT STATUS */}
      <section id="status" className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-2 py-14 sm:px-6 lg:px-0 mb-12">
        <div className="tl-panel rounded-[24px] p-8 md:p-12 text-center bg-gradient-to-b from-[var(--bg)] to-[var(--bg-soft)] border border-[var(--field-border)]">
          <h2 className="tl-h2 mb-6">Current Status</h2>
          <div className="flex flex-wrap justify-center gap-3 max-w-[800px] mx-auto">
            {[
              "Wallet onboarding",
              "Phone-number routing",
              "Escrow-backed payments",
              "Stablecoin support",
              "Transaction review flows",
              "Settlement-intent creation",
              "WhatsApp-based onboarding"
            ].map((feature) => (
              <span key={feature} className="inline-flex items-center gap-2 bg-[var(--field-bg)] border border-[var(--field-border)] rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-soft)]">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                {feature}
              </span>
            ))}
          </div>
          <p className="mt-8 text-[0.95rem] text-[var(--text-faint)] max-w-[600px] mx-auto">
            Additional settlement infrastructure continues evolving through TSN and TINS development.<br /><br />
            <strong>TrustLink Pay: Identity-first stablecoin settlement infrastructure on Solana.</strong>
          </p>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 border-t border-[var(--field-border)] py-8 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between px-2 sm:px-6 lg:px-0">
        <div>
          <strong className="block text-[var(--text)]">TrustLink Pay</strong>
          <span>Transfer Settlement Network · Solana</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/app">Open Dapp</Link>
          <Link href="/operator-dashboard" className="tsn-link font-semibold">
            Operator Dashboard
          </Link>
          <Link href="/support">Support</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </main>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="tl-badge tl-meta-label rounded-full px-3 py-1 text-[0.66rem] font-black">
        Section {index}
      </span>
      <span className="text-sm font-black uppercase tracking-[0.16em] text-[var(--text-faint)]">{title}</span>
    </div>
  );
}
