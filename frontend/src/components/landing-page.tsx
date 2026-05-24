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
import { TxProcessAnimator } from "./stimulations/tx-process-animator";

const heroStats = [
  { label: "Sender fee model", value: "Transparent", note: "network + TSN protocol fee shown before send" },
  { label: "Settlement target", value: "<3s", note: "from intent to cranker proof" },
  { label: "Identity layer", value: "TINS", note: "10-digit Transfer Identity Number" },
  { label: "Network", value: "Solana", note: "stablecoin payments over TSN" },
];

const flowSteps = [
  {
    title: "Alice enters Bob's identity",
    body: "Alice starts with Bob's phone identity or supported payment identity. TrustLink resolves the route without asking Alice to paste or verify Bob's wallet address.",
    icon: Phone,
  },
  {
    title: "Intent enters TSN Mempool",
    body: "The payment intent is published to TSN Mempool first. A registered Cranker picks it up and submits the on-chain intent transaction.",
    icon: UserRoundCheck,
  },

  {
    title: "Verifier PDA funds setup",
    body: "The verifier PDA funds protocol account setup and reimburses Cranker gas in the same transaction. The Cranker earns claim credit instead of an immediate profit tip.",
    icon: ShieldCheck,
  },

  {
    title: "Funds lock in escrow",
    body: "Alice signs once. The transfer amount locks into sender-side escrow while the payment intent is prepared for TSN settlement.",
    icon: LockKeyhole,
  },

  {
    title: "Private claim pays Bob",
    body: "A Cranker uses claim eligibility to acquire settlement work, routes payout from vault liquidity, and keeps Alice and Bob from exposing wallets to each other.",
    icon: Network,
  },
  {
    title: "Proof closes the loop",
    body: "The Cranker submits Proof of Payment and the settlement record moves through epoch accounting for verifiable finality.",
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
  "Register as a TSN Cranker",
  "Watch TSN Mempool for payment intents",
  "Submit on-chain payment intents",
  "Earn claim-credit eligibility",
  "Acquire claim execution leases",
  "Pay recipients from vault liquidity",
  "Submit proof on-chain",
  "Settle through epoch accounting",
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
  const mempoolExplorerUrl = process.env.NEXT_PUBLIC_TSN_MEMPOOL_EXPLORER_URL ?? "/tsn-mempool";

  return (
    <main className="app-shell overflow-hidden text-[14px] md:text-[15px]">
      <SiteHeader />

      <section id="tsn-protocol" className="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-[1180px] scroll-mt-28 items-center gap-10 pb-12 pt-2 lg:grid-cols-[0.98fr_1.02fr]">
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

        <div id="how-it-works" className="relative z-10 grid gap-3 w-full scroll-mt-28">



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


      {/* PRIVACY */}
      <section
        id="tsn-privacy"
        className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="01" title="TSN privacy" />

        <div className="mt-6 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="min-w-0">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.35rem)] font-black leading-[1.08] tracking-[-0.03em] text-[var(--text)]">
              Settlement without direct wallet-to-wallet exposure.
            </h2>

            <p className="mt-5 max-w-[680px] text-[1rem] leading-8 text-[var(--text-soft)]">
              TSN separates sender lock, recipient claim, Cranker payout, and
              epoch reimbursement. Payments remain verifiable on-chain while
              reducing direct exposure between counterparties during normal
              payment flows.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {privacyProofs.map((proof) => (
              <article
                key={proof.title}
                className="tl-panel rounded-[18px] p-5"
              >
                <proof.icon className="h-5 w-5 text-[var(--accent)]" />

                <h3 className="mt-4 text-[1rem] font-black text-[var(--text)]">
                  {proof.title}
                </h3>

                <p className="mt-3 text-[0.92rem] leading-7 text-[var(--text-soft)]">
                  {proof.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* <section id="how-it-works" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="02" title="How a payment works" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flowSteps.map((step, index) => (
            <article key={step.title} className="tl-panel p-5">
              <div className="flex items-center justify-between">
                <span className="tl-meta-label text-xs">{String(index + 1).padStart(2, "0")}</span>
                <step.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="tl-h3 mt-5">{step.title}</h3>
              <p className="tl-body-sm mt-3">{step.body}</p>
            </article>
          ))}
        </div>
      </section> */}

      {/* <section id="fee-model" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-5 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionLabel index="02" title="Current fee model" />
          <h2 className="tl-h2 mt-4">
            Show the real fee, not account rent dressed up as network cost.
          </h2>
          <p className="tl-body mt-4 pr-3 max-w-[680px]">
            Sender quotes should stay honest: current Solana transaction fee plus TSN settlement fees from active on-chain policy. LP rewards come only from real settlement usage, not idle-capital farming. Claim and sender fees remain inside the settlement economy and are distributed to LPs, operators, and treasury based on protocol policy. Verifier-paid setup for escrow, vault, and recoverable protocol accounts stays an operating cost; unrecoverable recipient account setup belongs on the claim side.
          </p>
        </div>
        <div className="tl-panel p-2">
          {feeRows.map(([label, value, note]) => (
            <div key={label} className="grid gap-2 border-b border-[var(--field-border)] px-4 py-4 last:border-b-0 md:grid-cols-[1fr_0.55fr_1.25fr]">
              <span className="tl-label">{label}</span>
              <strong className="tl-label text-accent">{value}</strong>
              <p className="tl-meta-sm">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="lp-yield" className="mx-auto w-full max-w-[1180px] scroll-mt-28 py-12">
        <SectionLabel index="04" title="LP settlement APY" />
        <p className="tl-body mt-4 pr-3 max-w-[680px]">
          TSN LP APY is calculated strictly from real settlement fees generated by network usage. No external lending, farming, or hidden yield strategy is assumed. Settlement liquidity stays dedicated to instant transfer settlement.
        </p>
        <div className="mt-6">
          <LandingFeeYieldCalculator />
        </div>
      </section> */}

      {/* <section id="cranker" className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-5 py-12 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <SectionLabel index="05" title="Run a Cranker node" />
          <h2 className="tl-h2 mt-4">
            Earn for every settlement you execute.
          </h2>
          <p className="tl-body mt-4 pr-3 max-w-[680px]">
            Cranker operators secure settlement by doing useful work before they can claim profitable work. A registered Cranker watches TSN Mempool, submits payment intents on-chain, receives same-transaction gas reimbursement, and earns claim credit instead of receiving an immediate profit tip. That credit is required to acquire a claim lease and process settlement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/operator-dashboard" className="tsn-button-strong tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5">
              Register as operator <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={mempoolExplorerUrl} className="tl-button-secondary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5">
              View mempool explorer
            </a>
          </div>
        </div>
        <div className="grid gap-3">
          {crankerSteps.map((step, index) => (
            <div key={step} className="tl-field flex items-center gap-3 rounded-[14px] p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] tl-label text-accent">{index + 1}</span>
              <span className="tl-body-sm font-semibold">{step}</span>
            </div>
          ))}
        </div>
      </section> */}

      {/* FEE MODEL */}
      <section
        id="fee-model"
        className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-0 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0"
      >
        <div className="min-w-0">
          <SectionLabel index="02" title="Current fee model" />

          <h2 className="tl-h2 mt-5 text-balance">
            Show the real fee, not account rent dressed up as network cost.
          </h2>

          <p className="tl-body mt-5 max-w-[680px]">
            Sender quotes should stay honest: current Solana transaction fee
            plus TSN settlement fees from active on-chain policy.
          </p>
        </div>

        <div className="tl-panel overflow-hidden rounded-[18px] p-2">
          {feeRows.map(([label, value, note]) => (
            <div
              key={label}
              className="grid gap-2 border-b border-[var(--field-border)] px-4 py-4 last:border-b-0 md:grid-cols-[1fr_0.55fr_1.25fr]"
            >
              <span className="tl-label">{label}</span>

              <strong className="tl-label text-accent">
                {value}
              </strong>

              <p className="tl-meta-sm">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LP */}
      <section
        id="lp-yield"
        className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="03" title="LP settlement APY" />

        <p className="tl-body mt-5 max-w-[680px]">
          TSN LP APY is calculated strictly from real settlement fees generated
          by network usage.
        </p>

        <div className="mt-6">
          <LandingFeeYieldCalculator />
        </div>
      </section>

      {/* SDK */}
      <section
        id="sdk"
        className="mx-auto w-full max-w-[1180px] scroll-mt-28 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="04" title="TSN SDK" />

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {sdkSnippets.map((snippet) => (
            <article
              key={snippet.title}
              className="tl-panel overflow-hidden rounded-[18px]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--field-border)] px-4 py-3">
                <Code2 className="h-4 w-4 text-accent" />

                <h3 className="tl-label text-accent">
                  {snippet.title}
                </h3>
              </div>

              <pre className="tl-code overflow-x-auto p-4 text-sm leading-7">
                <code>{snippet.code}</code>
              </pre>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            [
              "TrustLink calls TSN",
              "TrustLink resolves phone identities, then TSN owns send and claim logic.",
            ],
            [
              "Other apps call TSN directly",
              "Once TINS is live, Solana apps can route payments without TrustLink dependency.",
            ],
            [
              "Same program foundation",
              "TSN connects into the escrow settlement layer while frontend apps stay modular.",
            ],
          ].map(([title, body]) => (
            <div
              key={String(title)}
              className="tl-field rounded-[16px] p-4"
            >
              <h3 className="tl-h3">{String(title)}</h3>

              <p className="tl-meta-sm mt-2">
                {String(body)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* TINS */}
      <section
        id="tins"
        className="mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-0 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0"
      >
        <div className="min-w-0">
          <SectionLabel index="05" title="TINS" />

          <h2 className="tl-h2 mt-5">
            Transfer Identity Number System.
          </h2>

          <p className="tl-body mt-5 max-w-[680px]">
            Every user will own a permanent 10-digit Transfer Identity Number
            as a Solana PDA.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            [
              Landmark,
              "On-chain and permanent",
              "Your TIN lives as a Solana PDA, not as a private TrustLink database row.",
            ],
            [
              Wallet,
              "Links payment identity",
              "Phone numbers, TINs, social handles, and business registrations can resolve to the same payment route.",
            ],
            [
              Gauge,
              "Open infrastructure",
              "Developers resolve a TIN, create an intent, and route funds through TSN.",
            ],
          ].map(([Icon, title, body]) => (
            <article
              key={String(title)}
              className="tl-panel rounded-[18px] p-5"
            >
              {/* @ts-ignore */}
              <Icon className="h-5 w-5 text-accent" />

              <h3 className="tl-h3 mt-4">
                {String(title)}
              </h3>

              <p className="tl-body-sm mt-3">
                {String(body)}
              </p>
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
