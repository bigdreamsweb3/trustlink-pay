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

import { LandingFeeYieldCalculator } from "@/src/components/landing-fee-yield-calculator";
import { SiteHeader } from "@/src/components/layout/site-header";

const heroStats = [
  { label: "Sender fee model", value: "Transparent", note: "network + TSN protocol fee shown before send" },
  { label: "Settlement target", value: "<3s", note: "from intent to cranker proof" },
  { label: "Identity layer", value: "TINS", note: "10-digit Transfer Identity Number" },
  { label: "Network", value: "Solana", note: "stablecoin payments over TSN" },
];

const flowSteps = [
  {
    title: "Alice types a phone number",
    body: "No wallet address. No blockchain jargon. TrustLink starts with the same identity-first habit people already know from OPay, UPI, and Pix, using phone-number-style identifiers inside a Solana dApp.",
    icon: Phone,
  },
  {
    title: "TrustLink resolves identity",
    body: "The identifier can be a phone number with country code, a local 10-digit number, or eventually a permanent 10-digit TIN as the Transfer Identity Number System comes online.",
    icon: UserRoundCheck,
  },
  {
    title: "Escrow locks funds on Solana",
    body: "The sender sees the current Solana network fee and TSN protocol fee before confirming. Verifier-paid protocol setup is not disguised as sender network fee.",
    icon: LockKeyhole,
  },
  {
    title: "TSN settles the claim",
    body: "Cranker liquidity pays through a private claim path, submits proof, and recovers during epoch settlement. The sender and recipient do not need to expose wallets to each other.",
    icon: Network,
  },
];

const privacyProofs = [
  {
    title: "No direct wallet-to-wallet route",
    body: "The sender locks funds into temporary escrow instead of pushing directly to the recipient wallet.",
    icon: LockKeyhole,
  },
  {
    title: "Private claim flow",
    body: "The recipient claims through TSN routing, so their wallet does not have to be shown to the sender.",
    icon: ShieldCheck,
  },
  {
    title: "Proof still settles on-chain",
    body: "Crankers submit Proof of Payment so settlement remains verifiable without exposing the full user relationship.",
    icon: Network,
  },
];

const feeRows = [
  ["Transfer amount", "$100.00", "The amount Alice wants Bob to receive before claim-side settlement costs."],
  ["Current Solana network fee", "~live estimate", "Only the chain fee for the sender transaction, shown separately."],
  ["TSN settlement fees", "policy-based", "Sender and claim fees are protocol-configured and fully visible before execution."],
  ["Recipient account setup", "claim-side only", "Applied only if settlement creates a recipient token account that the protocol cannot later recover."],
  ["Settlement fee distribution", "LP + operator + treasury", "Settlement fees are shared by policy, with LPs receiving the majority share."],
];

const crankerSteps = [
  "Deploy approved asset vault capital",
  "Watch TSN for payment intents",
  "Acquire execution leases",
  "Pay recipients from vault liquidity",
  "Submit proof on-chain",
  "Recover at epoch settlement",
];

const sdkSnippets = [
  {
    title: "Create Payment Intent",
    code: `await tsn.createPaymentIntent({
  recipientTIN: "4872193041",
  amount: 100_000_000,
  senderWallet: keypair.publicKey,
  escrowProgramId: TSN_PROGRAM_ID,
});`,
  },
  {
    title: "Claim and Pay",
    code: `const lease = await tsn.claimPaymentIntent({
  intentId: "pmt_8341",
  crankerVault: vaultPDA,
  crankerKeypair: operatorKeypair,
});

await tsn.payRecipient({ lease, recipientWallet });`,
  },
  {
    title: "Submit Proof",
    code: `await tsn.submitProofOfPayment({
  lease,
  txSignature: paymentTx.signature,
  crankerKeypair: operatorKeypair,
  escrowProgramId: TSN_PROGRAM_ID,
});`,
  },
];

export function LandingPage() {
  return (
    <main className="app-shell tl-grid-overlay overflow-hidden bg-[var(--bg)]">
      <SiteHeader />

      <section id="tsn-protocol" className="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-[1180px] scroll-mt-28 items-center gap-8 pb-10 pt-2 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative z-10">
          <div className="tl-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
            <Network className="h-3.5 w-3.5" />
            Transfer Settlement Network · Solana
          </div>
          <h1 className="mt-5 max-w-[760px] text-[clamp(2.05rem,6vw,4.0rem)] font-black leading-[0.98] tracking-[0.09em] text-[var(--text)]">
            Private stablecoin payments as familiar as mobile money.
          </h1>
          <p className="mt-6 max-w-[680px] text-[1rem] leading-8 text-[var(--text-soft)] md:text-[1.12rem]">
            Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day because they solved identity-first payments. TrustLink Pay brings that same familiar identity layer to Solana stablecoins, while TSN routes settlement through temporary escrow and private claim flows instead of direct wallet-to-wallet transfers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#how-it-works" className="tl-button-primary inline-flex items-center gap-2 rounded-[16px] px-5 py-3 text-sm font-bold">
              See how it works <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/app" className="tl-button-secondary inline-flex items-center gap-2 rounded-[16px] px-5 py-3 text-sm font-bold">
              Open app
            </Link>
          </div>
        </div>

        <div className="relative z-10 grid gap-3">
          <div className="tl-panel p-4 md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="tl-meta-label text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-faint)]">Payment intent</p>
                <h2 className="mt-2 text-2xl font-black tracking-normal text-[var(--text)]">$100.00 stablecoin</h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 grid gap-2">
              {["Alice enters Bob's phone identity", "Temporary escrow locks funds", "Private claim routes payout", "Proof settles at epoch"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-[12px] border border-[var(--field-border)] bg-[var(--field)] px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-sm font-semibold text-[var(--text-soft)]">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="tl-field rounded-[14px] p-4">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">{stat.label}</p>
                <strong className="mt-2 block text-2xl font-black text-[var(--text)]">{stat.value}</strong>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{stat.note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tsn-privacy" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="01" title="TSN privacy" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h2 className="text-[clamp(1.8rem,4vw,3.2rem)] font-black leading-tight tracking-normal text-[var(--text)]">
              Settlement without direct wallet-to-wallet exposure.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
              TSN separates the sender lock, recipient claim, Cranker payout, and epoch reimbursement. Payments remain provable on-chain, but the normal payment experience does not require either side to reveal the other wallet path.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {privacyProofs.map((proof) => (
              <article key={proof.title} className="tl-panel p-5">
                <proof.icon className="h-5 w-5 text-[var(--accent)]" />
                <h3 className="mt-4 text-base font-black tracking-normal text-[var(--text)]">{proof.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">{proof.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="02" title="How a payment works" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {flowSteps.map((step, index) => (
            <article key={step.title} className="tl-panel p-5">
              <div className="flex items-center justify-between">
                <span className="tl-meta-label text-xs text-[var(--text-faint)]">{String(index + 1).padStart(2, "0")}</span>
                <step.icon className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <h3 className="mt-5 text-lg font-black tracking-normal text-[var(--text)]">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="fee-model" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-5 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionLabel index="03" title="Current fee model" />
          <h2 className="mt-4 text-[clamp(1.8rem,4vw,3.2rem)] font-black leading-tight tracking-normal text-[var(--text)]">
            Show the real fee, not account rent dressed up as network cost.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
            Sender quotes should stay honest: current Solana transaction fee plus TSN settlement fees from active on-chain policy. LP rewards come only from real settlement usage, not idle-capital farming. Claim and sender fees remain inside the settlement economy and are distributed to LPs, operators, and treasury based on protocol policy. Verifier-paid setup for escrow, vault, and recoverable protocol accounts stays an operating cost; unrecoverable recipient account setup belongs on the claim side.
          </p>
        </div>
        <div className="tl-panel overflow-hidden p-2">
          {feeRows.map(([label, value, note]) => (
            <div key={label} className="grid gap-2 border-b border-[var(--field-border)] px-4 py-4 last:border-b-0 md:grid-cols-[1fr_0.55fr_1.25fr]">
              <span className="text-sm font-bold text-[var(--text)]">{label}</span>
              <strong className="text-sm text-[var(--accent)]">{value}</strong>
              <p className="text-xs leading-5 text-[var(--muted)]">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="lp-yield" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="04" title="LP settlement APY" />
        <p className="mt-4 max-w-[660px] text-sm leading-7 text-[var(--text-soft)]">
          TSN LP APY is calculated strictly from real settlement fees generated by network usage. No external lending, farming, or hidden yield strategy is assumed. Settlement liquidity stays dedicated to instant transfer settlement.
        </p>
        <div className="mt-6">
          <LandingFeeYieldCalculator />
        </div>
      </section>

      <section id="cranker" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-5 py-12 lg:grid-cols-[1fr_0.9fr]">
        <div className="tl-panel p-5 md:p-7">
          <SectionLabel index="05" title="Run a Cranker node" />
          <h2 className="mt-4 text-[clamp(1.8rem,4vw,3.1rem)] font-black leading-tight tracking-normal text-[var(--text)]">
            Earn for every settlement you execute.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
            Cranker operators provide the liquidity that makes instant settlement possible. They fund a vault, watch payment intents, execute payouts, submit proof, and recover from Mother Escrow at epoch settlement.
          </p>
          <Link href="/operator-dashboard" className="mt-6 inline-flex items-center gap-2 rounded-[16px] bg-[#ff7a18] px-5 py-3 text-sm font-black text-[#120703] shadow-[0_14px_30px_rgba(255,122,24,0.22)] transition hover:bg-[#ff8b33]">
            Register as operator <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3">
          {crankerSteps.map((step, index) => (
            <div key={step} className="tl-field flex items-center gap-3 rounded-[14px] p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-black text-[var(--accent)]">{index + 1}</span>
              <span className="text-sm font-bold text-[var(--text-soft)]">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="sdk" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="06" title="TSN SDK" />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {sdkSnippets.map((snippet) => (
            <article key={snippet.title} className="tl-panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--field-border)] px-4 py-3">
                <Code2 className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="text-sm font-black text-[var(--text)]">{snippet.title}</h3>
              </div>
              <pre className="overflow-x-auto p-4 text-[0.74rem] leading-6 text-[var(--text-soft)]"><code>{snippet.code}</code></pre>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            ["TrustLink calls TSN", "TrustLink resolves phone identities, then TSN owns send and claim logic."],
            ["Other apps call TSN directly", "Once TINS is live, Solana apps can route payments without TrustLink dependency."],
            ["Same program foundation", "TSN connects into the escrow settlement layer while frontend apps stay modular."],
          ].map(([title, body]) => (
            <div key={title} className="tl-field rounded-[14px] p-4">
              <h3 className="text-sm font-black text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tins" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-5 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionLabel index="07" title="TINS" />
          <h2 className="mt-4 text-[clamp(1.8rem,4vw,3.1rem)] font-black leading-tight tracking-normal text-[var(--text)]">
            Transfer Identity Number System.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
            Every user will own a permanent 10-digit Transfer Identity Number as a Solana PDA. Phone numbers, social identities, and business identities can resolve to the same payment identity without exposing raw private data on-chain.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [Landmark, "On-chain and permanent", "Your TIN lives as a Solana PDA, not as a private TrustLink database row."],
            [Wallet, "Links payment identity", "Phone numbers, TINs, social handles, and business registrations can resolve to the same payment route."],
            [Gauge, "Open infrastructure", "Developers resolve a TIN, create an intent, and route funds through TSN."],
          ].map(([Icon, title, body]) => (
            <article key={String(title)} className="tl-panel p-5">
              <Icon className="h-5 w-5 text-[var(--accent)]" />
              <h3 className="mt-4 text-lg font-black tracking-normal text-[var(--text)]">{String(title)}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">{String(body)}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 border-t border-[var(--field-border)] py-8 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="block text-[var(--text)]">TrustLink Pay</strong>
          <span>Transfer Settlement Network · Solana</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/app">Open app</Link>
          <Link href="/operator-dashboard">Operator Dashboard</Link>
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
      <span className="tl-meta-label rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[0.66rem] font-black text-[var(--accent)]">
        Section {index}
      </span>
      <span className="text-sm font-black uppercase tracking-[0.16em] text-[var(--text-faint)]">{title}</span>
    </div>
  );
}
