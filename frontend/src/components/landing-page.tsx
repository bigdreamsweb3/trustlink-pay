import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  Zap,
  Globe,
  KeyRound,
  MessageCircle,
  Twitter,
  BookOpen,
  Github,
  Clock,
  TrendingUp,
  Lock,
  Eye,
  Fingerprint,
  Users,
  Phone,
  Network,
  UserRoundCheck,
  Gauge,
} from "lucide-react";

import { SiteHeader } from "@/src/components/layout/site-header";
import { TxProcessAnimator } from "./stimulations/tx-process-animator";

const heroStats = [
  {
    icon: Fingerprint,
    label: "Identity Layer",
    value: "TIP",
    note: "Payment identity and optional trust attestations",
  },
  {
    icon: Network,
    label: "Privacy Layer",
    value: "ZK-PRU",
    note: "Purpose-bound protected receiving identities for each Transfer Identity",
  },
  {
    icon: Clock,
    label: "Settlement",
    value: "TSN",
    note: "Payment intents, epochs, Crankers, fees, and receipts",
  },
  {
    icon: Lock,
    label: "Confidential assets",
    value: "TCAP",
    note: "Reserve metadata, commitments, nullifiers, and private roots",
  },
];

const transparentFeesRows = [
  ["Transfer amount", "The amount to be sent"],
  ["Solana network fee", "Current chain transaction fee"],
  ["Sender fee", "Covers sender-side TSN execution and network sponsorship"],
  [
    "Recipient fee",
    "Deducted from the recipient payout and split by TSN policy",
  ],
  ["Recipient readiness", "Status of the recipient identity"],
];

const codeLines = [
  { token: "keyword", text: "const " },
  { token: "variable", text: "recipient" },
  { token: "operator", text: " = " },
  { token: "function", text: "await tsn.identity.resolve" },
  { token: "punctuation", text: "({" },
  { token: "break", text: "\n    " },
  { token: "property", text: "identifier" },
  { token: "operator", text: ": " },
  { token: "string", text: '"4872193041"' },
  { token: "punctuation", text: "," },
  { token: "break", text: "\n    " },
  { token: "property", text: "type" },
  { token: "operator", text: ": " },
  { token: "string", text: '"tin"' },
  { token: "punctuation", text: "\n  });" },
  { token: "break", text: "\n\n" },
  { token: "keyword", text: "const " },
  { token: "variable", text: "quote" },
  { token: "operator", text: " = " },
  { token: "function", text: "await tsn.payments.quote" },
  { token: "punctuation", text: "({" },
  { token: "break", text: "\n    " },
  { token: "property", text: "recipientTIN" },
  { token: "punctuation", text: ": " },
  { token: "variable", text: "recipient.tin" },
  { token: "punctuation", text: "," },
  { token: "break", text: "\n    " },
  { token: "property", text: "amount" },
  { token: "operator", text: ": " },
  { token: "number", text: "100_000_000" },
  { token: "punctuation", text: "," },
  { token: "break", text: "\n    " },
  { token: "property", text: "mint" },
  { token: "operator", text: ": " },
  { token: "variable", text: "USDC_MINT" },
  { token: "punctuation", text: "\n  });" },
  { token: "break", text: "\n\n" },
  { token: "keyword", text: "const" },
  { token: "variable", text: "intent" },
  { token: "operator", text: " = " },
  { token: "function", text: "await tsn.payments.createIntent" },
  { token: "punctuation", text: "({" },
  { token: "break", text: "\n    " },
  { token: "property", text: "quoteId" },
  { token: "operator", text: ": " },
  { token: "variable", text: "quote.id" },
  { token: "punctuation", text: "," },
  { token: "break", text: "\n    " },
  { token: "property", text: "senderWallet" },
  { token: "operator", text: ": " },
  { token: "variable", text: "wallet.publicKey" },
  { token: "punctuation", text: "\n  });" },
];

const sdkFeatures = [
  {
    icon: KeyRound,
    title: "Identity APIs",
    desc: "Resolve TINs and phone numbers to settlement identities",
  },
  {
    icon: ShieldCheck,
    title: "Identity APIs",
    desc: "Resolve payment identity and its available trust context",
  },
  {
    icon: Zap,
    title: "Settlement APIs",
    desc: "Create payment intents and manage escrow workflows",
  },
  {
    icon: Lock,
    title: "Escrow Infrastructure",
    desc: "Protocol-controlled vault management for secure settlement",
  },
];

const currentCapabilities = [
  {
    title: "TIN Identity Registry",
    desc: "10-digit payment identities with wallet abstraction",
  },
  {
    title: "Phone-Number Routing",
    desc: "Encrypted phone-number resolution and payment routing",
  },
  {
    title: "WhatsApp Verification",
    desc: "Encrypted verification linking through WhatsApp",
  },
  {
    title: "Gasless Payment Flow",
    desc: "Cranker-sponsored transaction execution",
  },
  {
    title: "Escrow-Backed Settlement",
    desc: "Funds secured in protocol-controlled accounts",
  },
  {
    title: "Settlement Intent Creation",
    desc: "Payment intent lifecycle management on TSN",
  },
];

const upcomingCapabilities = [
  {
    title: "X Business Verification",
    desc: "Business identity credentials linked to Transfer Identity",
  },
  {
    title: "SAS Credential Providers",
    desc: "Government, merchant, and proof-of-personhood attestations when provider integration is available",
  },
  {
    title: "Multi-Cranker Network",
    desc: "Decentralized settlement operators under integration testing",
  },
  {
    title: "Additional SPL Assets",
    desc: "Support for broader Solana token ecosystems",
  },
  {
    title: "Analytics Dashboard",
    desc: "Transaction monitoring and settlement analytics tooling",
  },
];

const socialIdentities = [
  { icon: MessageCircle, name: "WhatsApp", status: "active", color: "#25D366" },
  { icon: Twitter, name: "X Business", status: "coming", color: "#1DA1F2" },
];

const sasFeatures = [
  {
    icon: ShieldCheck,
    title: "Government Identity",
    desc: "A future trusted credential category for legal-name confirmation",
  },
  {
    icon: Wallet,
    title: "Business Identity",
    desc: "A future credential category for verified business context",
  },
  {
    icon: Users,
    title: "Proof Of Personhood",
    desc: "A future credential category for privacy-preserving human verification",
  },
  {
    icon: CheckCircle2,
    title: "Reusable Attestations",
    desc: "Attestation evidence associated with a Transfer Identity",
  },
];

const feeDistribution = [
  {
    role: "Settlement execution",
    share: "TSN",
    desc: "Fees are coordinated by TSN according to the active network policy",
  },
  {
    role: "Cranker Operators",
    share: "TSN",
    desc: "Operators earn rewards for valid settlement work",
  },
  {
    role: "Protocol policy",
    share: "TSN",
    desc: "Exact fee allocation is versioned by TSN governance",
  },
];

const securityFeatures = [
  {
    icon: LockKeyhole,
    title: "Intent authorization",
    desc: "Payment intents are signed and coordinated before settlement",
  },
  {
    icon: ShieldCheck,
    title: "Cranker Verification",
    desc: "Multi-signature settlement authorization",
  },
  {
    icon: Eye,
    title: "Off-Chain Proof Trail",
    desc: "Verifiable settlement evidence off-chain",
  },
];

const footerLinks = [
  { label: "App", href: "/app" },
  {
    label: "Docs",
    href: "https://github.com/bigdreamsweb3/trustlink-pay#readme",
  },
  { label: "TSN Explorer", href: "/#" },
] as const;

const communityLinks = [
  // {
  //   label: "Discord",
  //   href: "#",
  //   icon: MessageCircle,
  // },
  {
    label: "Twitter",
    href: "https://twitter.com/trustlinklabs",
    icon: Twitter,
  },
  {
    label: "GitHub",
    href: "https://github.com/bigdreamsweb3/trustlink-pay",
    icon: Github,
  },
];

export function LandingPage() {
  const mempoolExplorerUrl =
    process.env.NEXT_PUBLIC_TSN_MEMPOOL_EXPLORER_URL ?? "/tsn-mempool";

  return (
    <main className="app-shell overflow-hidden text-[14px] md:text-[15px]">
      <SiteHeader />

      {/* HERO SECTION */}
      <section
        id="tsn-protocol"
        className="mx-auto grid grid-cols-1 min-h-[calc(100dvh-7rem)] w-full max-w-[1180px] scroll-mt-14 px-0 pb-12 pt-2"
      >
        <div className="grid lg:grid-cols-[0.98fr_1.02fr] items-center gap-10">
          {/* LEFT CONTENT */}
          <div className="relative z-10 order-1">
            <div className="tl-meta-label text-nowrap whitespace-nowrap">
              Transfer Settlement Network · Solana
            </div>

            <h1 className="tl-display mt-5 max-w-[760px]">
              <span className="text-transparent bg-clip-text bg-linear-to-r from-accent to-accent-deep">
                Private, Identity-first, and Confidential
              </span>{" "}
              <span className="text-[clamp(1.2rem,3.5vw,2.2rem)] font-black tracking-[-0.015em]">
                Crypto Payments on Solana
              </span>
            </h1>

            <p className="tl-body-lg mt-5 pr-3 max-w-[680px] text-[var(--text-soft)]">
              TrustLink Pay is built on the Transfer Settlement Network — a
              decentralized settlement layer for Solana that turns payment
              intents into private, cryptographically verifiable execution
              through Escrow Hold, Cranker execution, and Settlement Proof. Pay
              anyone using a phone number or 10-digit TIN instead of a wallet
              address, with private settlement and optional identity trust
              context.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/tsn"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-main)] transition hover:opacity-90"
              >
                Learn about TSN <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://github.com/bigdreamsweb3/trustlink-pay"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--field-border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
              >
                Read the repo
              </Link>
            </div>

            {/* HERO CARDS */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 items-stretch lg:hidden">
              {heroStats.map((stat) => {
                const IconComponent = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className="tl-field rounded-[10px] p-3 min-h-[110px] flex flex-col"
                  >
                    <div className="flex items-center gap-2">
                      <IconComponent className="h-4 w-4 shrink-0 text-accent" />

                      <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-text-faint">
                        {stat.label}
                      </p>
                    </div>

                    <strong className="mt-2 block text-sm font-black text-[var(--text)]">
                      {stat.value}
                    </strong>

                    <p className="mt-1 text-xs leading-4 text-[var(--muted)]">
                      {stat.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TX SIMULATOR */}
          <div
            id="how-it-works-hero"
            className="relative z-10 order-2 grid gap-3 w-full scroll-mt-14 min-h-[400px]"
          >
            <TxProcessAnimator />
          </div>
        </div>

        {/* DESKTOP HERO CARDS */}
        <div className="mt-6 hidden lg:grid grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 items-stretch max-h-[100px]">
          {heroStats.map((stat) => {
            const IconComponent = stat.icon;

            return (
              <div
                key={stat.label}
                className="tl-field rounded-[10px] p-3 h-full min-h-[60px] flex flex-col"
              >
                <div className="flex items-center gap-2">
                  <IconComponent className="h-4 w-4 shrink-0 text-accent" />

                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-text-faint">
                    {stat.label}
                  </p>
                </div>

                <strong className="mt-2 block text-sm font-black text-[var(--text)]">
                  {stat.value}
                </strong>

                <p className="mt-1 text-xs leading-4 text-[var(--muted)]">
                  {stat.note}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 00 — BLOCKCHAIN SOLUTION */}
      {/* ============================================================ */}
      <section
        id="blockchain-solution"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="00" title="Blockchain Solution" />

        <div className="mt-6 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h2 className="tl-h2 mt-5">
              Why TrustLink Pay Is a Modern Blockchain Solution
            </h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              A useful blockchain solution should make payments easier for
              people while preserving the verifiability that makes blockchain
              settlement valuable. TrustLink Pay does this by combining
              identity-first payments, stablecoin-native flows, private
              settlement routing, and developer APIs.
            </p>
            <p className="tl-body-lg mt-4 text-text-soft">
              TrustLink Pay is the Web3 payment system users interact with. TSN
              is the settlement protocol that moves payment work through
              Crankers, ZK-PRU routes, and programmable blockchain settlement on
              Solana.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Blockchain Payments Without Wallet Addresses",
                desc: "Users can pay a phone number or TIN while the system resolves identity and settlement routes behind the scenes.",
              },
              {
                title: "Identity-First Blockchain Solution",
                desc: "The Transfer Identity Protocol connects payment identity, verification context, and ZK-PRU route commitments.",
              },
              {
                title: "Private Blockchain Settlement",
                desc: "TSN separates sender funding from recipient payout so payments do not look like simple wallet-to-wallet transfers.",
              },
              {
                title: "Developer-Friendly Payment Protocol",
                desc: "SDKs expose identity resolution, payment authorization, fee transparency, and settlement status for apps building on TrustLink Pay.",
              },
            ].map(({ title, desc }) => (
              <article
                key={title}
                className="tl-panel rounded-[22px] px-4 py-4"
              >
                <h3 className="font-semibold text-text">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-faint">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="identity"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="01" title="Identity" />

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Left: Main identity content */}
          <div>
            <h2 className="tl-h2 mt-5">Pay people, not wallet addresses.</h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              The world already understands how to pay people through identity.
              Nigeria uses OPay. India uses UPI. Brazil uses Pix. TrustLink
              brings that identity-first experience to stablecoin payments on
              Solana.
            </p>
            <p className="tl-body-lg mt-4 text-text-soft">
              Instead of copying complex wallet addresses, users pay a{" "}
              <strong>phone number</strong> or a permanent{" "}
              <strong>Transfer Identity</strong> with a 10-digit TIN. Each
              upgraded Transfer Identity receives 30 ZK-PRU handles, so received funds land in private payment routes that are
              still controlled by the user's wallet proof.
            </p>
          </div>

          {/* Right: TIN Example Card */}
          <div className="tl-panel rounded-[22px] px-4 py-4 flex flex-col justify-center">
            <div className="p-4 tl-field rounded-[14px] max-w-fit">
              <p className="text-xs font-bold uppercase tracking-wider text-text-faint mb-2">
                Example TIN
              </p>
              <p className="text-2xl font-mono font-bold text-accent">
                4872-1930-41
              </p>
            </div>
            <p className="tl-body mt-4 text-text-soft">
              A 10-digit identifier that protects your wallet address while
              enabling seamless payments across the TSN network.
            </p>
          </div>
        </div>

        {/* How Transfer Identity Works */}
        <div className="mt-12">
          <h3 className="tl-h3 mb-6">How Transfer Identity Works</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                icon: Phone,
                title: "Phone-Number Routing",
                desc: "Send payments to any phone number linked to a Transfer Identity. The system resolves the phone to the recipient's TIN and settlement route.",
              },
              {
                icon: Fingerprint,
                title: "Portable Payment Identity",
                desc: "Your Transfer Identity is not tied to one wallet. Change wallets without changing your public payment identity.",
              },
              {
                icon: Lock,
                title: "Address Protection",
                desc: "Your actual wallet address stays hidden from recipients. They see only your TIN, Transfer Identity name, or verified display name.",
              },
              {
                icon: Network,
                title: "ZK-PRU-Routed Balances",
                desc: "Each upgraded Transfer Identity has 30 ZK-PRU handles. The app shows them as one TIN balance while TSN routes payments into ZK-PRU handles instead of a public owner wallet.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="tl-panel rounded-[22px] px-4 py-4">
                <div className="p-2 rounded-[10px] bg-[var(--accent-soft)] inline-block">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h4 className="font-semibold text-text mt-4">{title}</h4>
                <p className="text-sm text-text-faint mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Identity Resolution Flow */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="tl-field rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Identity And ZK-PRU Resolution</h3>
            <p className="tl-body text-text-soft">
              The Transfer Identity Protocol maintains a secure mapping between
              human-readable identifiers, TINs, and ZK-PRU settlement routes. When
              you initiate a payment, the system resolves the recipient's
              identifier without exposing raw wallet addresses.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">
                  Phone number → TIN resolution
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">TIN → wallet mapping</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">ZK-PRU route authentication</span>
              </div>
            </div>
          </div>

          <div className="tl-field rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Identity Lifecycle</h3>
            <p className="tl-body text-text-soft">
              Each Transfer Identity can connect multiple identifiers — phone
              numbers, social handles, and verification credentials — to a
              single settlement identity. This creates a portable payment
              identity that works across applications.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">Wallet-linked identities</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">Multi-identifier support</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-text-soft">
                  Cross-application portability
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 02 — IDENTITY ATTESTATIONS */}
      {/* ============================================================ */}
      <section
        id="identity-attestations"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="02" title="Identity confidence" />

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">Trust context belongs with identity.</h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              Transfer Identity provides the payment identity and can carry
              optional trust context. A TIN is still usable without a verified
              name or business credential.
            </p>
            <p className="tl-body-lg mt-4 text-text-soft">
              TrustLink is designed to accept Solana Attestation Service (SAS)
              credentials when its credential-provider integration is
              available. That can let a sender confirm that a displayed legal
              or business name comes from a trusted issuer without making the
              credential itself a public payment record.
            </p>
          </div>

          {/* Identity-attestation context */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="tl-field rounded-[14px] p-4 max-h-fit">
              <p className="text-3xl font-black text-accent">SAS</p>
              <p className="text-sm text-text-faint mt-2">
                Solana Attestation Service
              </p>
              <p className="text-xs text-text-soft mt-1">
                Future credential-provider integration
              </p>
            </div>
            <div className="tl-field rounded-[14px] p-4 h-fit">
              <p className="text-3xl font-black text-accent">Zero</p>
              <p className="text-sm text-text-faint mt-2">
                Personal Data Exposed
              </p>
              <p className="text-xs text-text-soft mt-1">
                Trust context is separate from payment settlement
              </p>
            </div>
          </div>
        </div>

        {/* Future attestation categories */}
        <div className="mt-12">
          <h3 className="tl-h3 mb-6">Future SAS attestation categories</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {sasFeatures.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="tl-panel rounded-[22px] px-4 py-4 flex items-start gap-4"
              >
                <div className="p-2 rounded-[10px] bg-[var(--accent-soft)] shrink-0">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h4 className="font-semibold text-text">{title}</h4>
                  <p className="text-sm text-text-faint mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Identity links and attestation design */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="tl-field rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Identity links</h3>
            <p className="tl-body text-text-soft">
              Link supported identity channels to your TIN for additional
              payment context. WhatsApp uses encrypted phone-number linking.
              X Business credentials are part of the planned attestation path.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {socialIdentities.map(({ icon: Icon, name, status, color }) => (
                <div
                  key={name}
                  className="inline-flex items-center gap-2 bg-[var(--field-bg)] border border-[var(--field-border)] rounded-full px-3 py-1.5"
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                  <span className="text-sm font-medium text-text">{name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      status === "active"
                        ? "bg-accent/20 text-accent"
                        : "bg-warning/20 text-warning"
                    }`}
                  >
                    {status === "active" ? "Active" : "Soon"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="tl-field rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Attestation design</h3>
            <p className="tl-body text-text-soft">
              When SAS credential providers are available, TrustLink can use
              their attestations as trust evidence for a Transfer Identity.
              The payment identity remains separate from the settlement layer.
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-text-soft">
                  Trust evidence is associated with identity
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-text-soft">
                  TINs remain usable without attestations
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-text-soft">
                  Settlement does not depend on credential exposure
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 03 — SETTLEMENT */}
      {/* ============================================================ */}
      <section
        id="settlement"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="03" title="Settlement" />

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">Why TSN exists.</h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              Direct wallet-to-wallet transfers are insufficient for everyday
              payments. They expose addresses, lack payment intent clarity, and
              offer no recourse for disputes.
            </p>
            <p className="tl-body-lg mt-4 text-text-soft">
              TSN (Transfer Settlement Network) coordinates settlement through
              identity-first flows, Crankers, and verifiable settlement receipts
              trails.
            </p>
          </div>

          {/* How TSN Works */}
          <div className="tl-field rounded-[14px] p-4">
            <h3 className="text-[1.2rem] font-black text-text mb-4">
              TSN Coordinates Settlement
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent">1</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">
                    Payment Intent
                  </p>
                  <p className="text-xs text-text-faint">
                    Sender creates intent with fee transparency
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent">2</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">Escrow Hold</p>
                  <p className="text-xs text-text-faint">
                    Funds secured in protocol-controlled vault
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent">3</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">
                    Cranker Execution
                  </p>
                  <p className="text-xs text-text-faint">
                    Operator executes payout transaction
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent">4</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">
                    Settlement Proof
                  </p>
                  <p className="text-xs text-text-faint">
                    Verifiable off-chain evidence recorded
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Settlement Features */}
        <div className="mt-12">
          <h3 className="tl-h3 mb-6">Security & Privacy</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            {securityFeatures.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="tl-panel rounded-[22px] px-4 py-4">
                <div className="p-2 rounded-[10px] bg-[var(--accent-soft)] inline-block">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h4 className="font-semibold text-text mt-4">{title}</h4>
                <p className="text-sm text-text-faint mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Gasless & Fees */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="tl-field rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Gasless Payments</h3>
            <p className="tl-body text-text-soft">
              Senders don't need SOL for transaction fees. Crankers — network
              operators — sponsor transaction execution in exchange for a fee
              included in the transfer amount.
            </p>
            <div className="mt-4 p-3 rounded-[10px] bg-[var(--accent-soft)]">
              <p className="text-sm font-semibold text-text">
                Gasless by Design
              </p>
              <p className="text-xs text-text-faint mt-1">
                Sender and recipient fees are shown before authorization
              </p>
            </div>
          </div>

          <div className="tl-panel rounded-[14px] p-4">
            <h3 className="tl-h3 mb-4">Fee Distribution</h3>
            <div className="space-y-4">
              {feeDistribution.map(({ role, share, desc }) => (
                <div
                  key={role}
                  className="flex items-center gap-4 pb-4 border-b border-[var(--field-border)] last:border-b-0 last:pb-0"
                >
                  <div className="w-16 h-16 rounded-[12px] bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                    <p className="text-lg font-black text-accent">{share}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-text">{role}</p>
                    <p className="text-sm text-text-faint">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transparent Fees */}
        <div className="mt-6 tl-field rounded-[14px] p-4">
          <h3 className="tl-h3 mb-4">Transparent Fee Breakdown</h3>
          <p className="tl-body text-text-soft mb-4">
            TSN separates network fees, settlement fees, and infrastructure
            costs instead of combining everything into a single unclear
            transaction cost.
          </p>
          <div className="grid gap-2 border-t border-[var(--field-border)] pt-4">
            {transparentFeesRows.map(([label, note]) => (
              <div
                key={label}
                className="grid gap-2 border-b border-field-border pb-4 last:border-b-0 md:grid-cols-[1fr_1.5fr]"
              >
                <span className="tl-label">{label}</span>
                <p className="tl-meta-sm text-text-faint">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 04 — DEVELOPERS */}
      {/* ============================================================ */}
      <section
        id="developers"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="04" title="For Developers" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">TSN SDK — Production-ready APIs.</h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              TSN SDK provides developer APIs for Transfer Identity resolution,
              verification, and payment settlement on Solana. Build applications
              that consume Transfer Identity and TSN without rebuilding payment
              flows from scratch.
            </p>

            <div className="mt-6 px-4 py-4 grid gap-3 sm:grid-cols-2">
              {sdkFeatures.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="p-1.5 rounded-[8px] bg-[var(--accent-soft)] shrink-0">
                    <Icon className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {title}
                    </p>
                    <p className="text-xs text-text-faint">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="https://github.com/bigdreamsweb3/trustlink-pay#readme"
                className="tl-button-primary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-sm"
              >
                <BookOpen className="h-4 w-4" />
                SDK Docs
              </Link>
              <Link
                href="https://github.com/bigdreamsweb3/trustlink-pay"
                className="tl-button-secondary tl-btn inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-sm"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </Link>
            </div>
          </div>
          <article className="tl-field overflow-hidden rounded-[14px]">
            <div className="flex items-center gap-2 border-b border-[var(--field-border)] px-4 py-2">
              <Code2 className="h-4 w-4 text-accent" />
              <h3 className="tl-label text-accent">TSN SDK Integration</h3>
            </div>
            <pre className="tl-code overflow-x-auto p-4 text-sm leading-6">
              <code>
                {codeLines.map((line, i) => (
                  <span
                    key={i}
                    className={
                      line.token === "break" ? "" : `code-${line.token}`
                    }
                  >
                    {line.text}
                  </span>
                ))}
              </code>
            </pre>
          </article>
        </div>
      </section>

      {/* ============================================================ */}
      {/* ROADMAP */}
      {/* ============================================================ */}
      <section
        id="roadmap"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="05" title="Roadmap" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Current Capabilities */}
          <div className="px-4 py-4">
            <h2 className="tl-h2 mb-6">Current Capabilities</h2>
            <div className="flex flex-col gap-3">
              {currentCapabilities.map(({ title, desc }) => (
                <div
                  key={title}
                  className="tl-panel rounded-[22px] px-4 py-3 flex items-start gap-4"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text)]">{title}</p>
                    <p className="mt-1 text-sm text-[var(--text-faint)]">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Capabilities */}
          <div className="px-4 py-4">
            <h2 className="tl-h2 mb-6">Upcoming Capabilities</h2>
            <div className="flex flex-col gap-3">
              {upcomingCapabilities.map(({ title, desc }) => (
                <div
                  key={title}
                  className="tl-panel rounded-[22px] px-4 py-3 flex items-start gap-4"
                >
                  <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text)]">{title}</p>
                    <p className="mt-1 text-sm text-[var(--text-faint)]">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-14 px-0 py-14 sm:px-6 lg:px-0">
        <div className="rounded-[18px] p-4 md:p-6 text-center">
          <h2 className="tl-h2 mb-3">
            Ready to Experience Identity-First Payments?
          </h2>
          <p className="text-[var(--text-soft)] max-w-[500px] mx-auto mb-5">
            TrustLink Pay brings gasless, identity-first payments to Solana. Pay
            using phone numbers or TINs while keeping your wallet address
            private.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/app"
              className="tl-button-primary tl-btn inline-flex items-center gap-2 rounded-[14px] px-6 py-3"
            >
              Open Dapp <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="https://github.com/bigdreamsweb3/trustlink-pay#readme"
              className="tl-button-secondary tl-btn inline-flex items-center gap-2 rounded-[14px] px-6 py-3"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-accent-border mx-auto flex w-full max-w-[1180px] flex-col gap-6 border-t border-[var(--field-border)] py-10 px-2 sm:px-6 lg:px-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <strong className="text-lg font-bold text-[var(--text)]">
              TrustLink Pay
            </strong>
            <p className="mt-1 text-sm text-[var(--text-faint)]">
              Privacy and Confidence First on Solana
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            {footerLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-sm text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[var(--field-border)]">
          <div className="flex flex-wrap gap-4">
            {communityLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[var(--text-faint)] hover:text-accent transition-colors"
              >
                <Icon className="h-4 w-4" />
                {label}
              </a>
            ))}
          </div>
          <p className="text-xs text-[var(--text-faint)]">
            Transfer Settlement Network · Solana
          </p>
        </div>
      </footer>
    </main>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="tl-badge tl-meta-label rounded-full px-3 py-1 text-[0.66rem] font-black">
        {index}
      </span>
      <span className="text-sm font-black uppercase tracking-[0.16em] text-[var(--text-faint)]">
        {title}
      </span>
    </div>
  );
}
