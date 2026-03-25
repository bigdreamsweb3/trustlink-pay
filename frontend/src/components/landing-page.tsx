import Link from "next/link";

import { SiteHeader } from "@/src/components/site-header";

const highlights = [
  {
    label: "Identity-led transfers",
    value: "Sender names and references travel with each payment."
  },
  {
    label: "WhatsApp-native flow",
    value: "Incoming alerts, claim OTP, and payout confirmation stay inside chat."
  },
  {
    label: "Escrow-first release",
    value: "Funds stay locked until the receiver claims to a saved wallet."
  }
];

export function LandingPage() {
  return (
    <main className="app-shell">
      <SiteHeader />

      <section className="hero-block">
        <div className="hero-copy">
          {/* <span className="hero-kicker">Payments that read like transfers, not crypto jargon</span> */}
          <h1 className="">Send stablecoins on Solana to WhatsApp numbers with the same confidence as a bank alert.</h1>
          <p>
            TrustLink turns sender identity, escrow, and wallet payout into one mobile-first flow. The sender connects
            a wallet. The receiver gets a clear incoming transfer message, verifies ownership, and claims directly into
            a saved wallet.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary button--compact" href="/auth?mode=register">
              Create TrustLink account
            </Link>
            <Link className="button button--secondary button--compact" href="/auth?mode=login">
              Sign in
            </Link>
          </div>
        </div>

        {/* <div className="hero-device"> */}
        <div className=" grid gap-3">
          <div className="device-header">
            <span className="device-chip">Incoming transfer</span>
            <strong>2.50 USDC</strong>
          </div>
          <div className="device-card">
            <div className="device-line">
              <span>From</span>
              <strong>Daniel Trust</strong>
            </div>
            <div className="device-line">
              <span>Handle</span>
              <strong>@daniel_trust</strong>
            </div>
            <div className="device-line">
              <span>Reference</span>
              <strong>TL-4K9P2X</strong>
            </div>
          </div>
          <div className="device-card device-card--accent">
            <span className="mini-label">Claim wallet</span>
            <strong>Primary Solana</strong>
            <small>Release after OTP confirmation</small>
          </div>
        </div>
        {/* </div> */}
      </section>

      <section className="metrics-row">
        {highlights.map((item) => (
          <article className="metric-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
