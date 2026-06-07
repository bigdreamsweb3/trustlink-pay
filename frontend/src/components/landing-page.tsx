import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Gauge,
  LockKeyhole,
  Network,
  ShieldCheck,
  UserRoundCheck,
  Wallet,
  Zap,
  Globe,
  KeyRound,
  MessageCircle,
  Twitter,
  Send,
  BookOpen,
  Github,
  ExternalLink,
  Layers,
  Clock,
  TrendingUp,
  Lock,
  Eye,
  Fingerprint,
  Activity,
  Users,
} from "lucide-react";

import { SiteHeader } from "@/src/components/layout/site-header";
import { TxProcessAnimator } from "./stimulations/tx-process-animator";

// const heroStats = [
//   {
//     icon: Fingerprint,
//     label: "Identity layer",
//     value: "TINS",
//     note: "10-digit Transfer Identity Number, protects wallet addresses",
//   },
//   {
//     icon: UserRoundCheck,
//     label: "Confidence layer",
//     value: "Verify",
//     note: "Social Identities linked for verification",
//   },
//   {
//     icon: Zap,
//     label: "Sender fee model",
//     value: "Gasless",
//     note: "network + TSN protocol fee shown before send",
//   },
//   {
//     icon: Clock,
//     label: "Settlement target",
//     value: "TSN <0.9s",
//     note: "from intent to cranker proof",
//   },
// ];

const heroStats = [
  {
    icon: Fingerprint,
    label: "Identity Layer",
    value: "TINS",
    note: "10-digit payment identity for Solana transfers",
  },
  {
    icon: UserRoundCheck,
    label: "Trust Layer",
    value: "Verified",
    note: "Linked social identities build payment confidence",
  },
  {
    icon: Zap,
    label: "Fee Model",
    value: "Gasless",
    note: "Network and TSN fees shown before sending",
  },
  {
    icon: Clock,
    label: "Settlement",
    value: "TSN <0.9s",
    note: "Intent routing to settlement proof completion",
  },
];

const transparentFeesRows = [
  ["Transfer amount", "The amount to be sent"],
  ["Solana network fee", "Current chain transaction fee"],
  ["Settlement fee estimates", "TSN protocol coordination fees"],
  ["Recipient readiness", "Status of the recipient identity"],
];

const codeLines = [
  { token: "keyword", text: "const" },
  { token: "variable", text: "recipient" },
  { token: "operator", text: " = " },
  { token: "function", text: "await tsn.resolveRecipient" },
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
  { token: "keyword", text: "const" },
  { token: "variable", text: "quote" },
  { token: "operator", text: " = " },
  { token: "function", text: "await tsn.quotePayment" },
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
  { token: "function", text: "await tsn.createPaymentIntent" },
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
    title: "Identity Resolution",
    desc: "Resolve TINs to wallet addresses with privacy",
  },
  {
    icon: Fingerprint,
    title: "Social Confidence",
    desc: "Decrypt and verify linked social identities",
  },
  {
    icon: Zap,
    title: "Gasless Settlement",
    desc: "Handle fee delegation automatically",
  },
  {
    icon: Lock,
    title: "Escrow Management",
    desc: "Create and claim escrow-backed payments",
  },
];

const roadmapItems = [
  {
    status: "live",
    title: "TIN Identity Registry",
    desc: "Devnet identity creation and resolution",
  },
  {
    status: "live",
    title: "WhatsApp Social Linking",
    desc: "Phone-based social identity verification",
  },
  {
    status: "live",
    title: "Gasless Payment Flow",
    desc: "No SOL required in sender wallet",
  },
  {
    status: "soon",
    title: "X Business Integration",
    desc: "Business account verification for merchants",
  },
  {
    status: "soon",
    title: "Multi-Cranker Network",
    desc: "Decentralized operator infrastructure",
  },
  {
    status: "planned",
    title: "SPL Token Expansion",
    desc: "Support for all SPL tokens beyond USDC",
  },
  {
    status: "planned",
    title: "Analytics Dashboard",
    desc: "Advanced payment analytics and reporting",
  },
];

const socialIdentities = [
  { icon: MessageCircle, name: "WhatsApp", status: "active", color: "#25D366" },
  { icon: Twitter, name: "X Business", status: "coming", color: "#1DA1F2" },
  // { icon: Send, name: "Telegram", status: "coming", color: "#0088cc" },
];

const feeDistribution = [
  {
    role: "Liquidity Providers",
    share: "87%",
    desc: "Market makers providing stablecoin liquidity",
  },
  {
    role: "TSN Treasury",
    share: "8%",
    desc: "Protocol development and operations",
  },
  {
    role: "Cranker / Operator",
    share: "5%",
    desc: "Settlement verification and processing",
  },
];

const securityFeatures = [
  {
    icon: LockKeyhole,
    title: "Escrow Vaults",
    desc: "Funds secured in protocol-controlled accounts",
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
  { label: "Dashboard", href: "/dashboard" },
  { label: "Docs", href: "/docs" },
  { label: "TSN Explorer", href: "/tsn-mempool" },
];

const communityLinks = [
  {
    label: "Discord",
    href: "https://discord.gg/trustlink",
    icon: MessageCircle,
  },
  { label: "Twitter", href: "https://twitter.com/trustlinkpay", icon: Twitter },
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
        className="mx-auto grid grid-cols-1 min-h-[calc(100dvh-7rem)] w-full max-w-[1180px] scroll-mt-28 px-0 pb-12 pt-2 "
      >
        <div className="grid lg:grid-cols-[0.98fr_1.02fr] items-center gap-10 ">
          <div className="relative z-10">
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
              Pay anyone on Solana using a phone number or 10-digit TIN instead
              of a wallet address, with private settlement and trusted identity
              verification.
            </p>
          </div>

          <div
            id="how-it-works-hero"
            className="relative z-10 grid gap-3 w-full scroll-mt-28"
          >
            <TxProcessAnimator />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 md:items-start">
          {heroStats.map((stat) => {
            const IconComponent = stat.icon;

            return (
              <div
                key={stat.label}
                className="tl-field rounded-[10px] p-3 flex h-full flex-col"
              >
                <div className="flex items-center gap-2">
                  <IconComponent className="h-4 w-4 shrink-0 text-accent" />

                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-text-faint">
                    {stat.label}
                  </p>
                </div>

                <strong className="mt-2 text-sm font-black text-[var(--text)]">
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

      {/* SECTION: IDENTITY-FIRST */}
      <section
        id="identity-first"
        className="border-t border-accent-border mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-0 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0"
      >
        <div className="min-w-0">
          <SectionLabel index="01" title="Identity-First Payments" />
          <h2 className="tl-h2 mt-5 text-balance">
            The world already understands how to pay people through identity.
          </h2>
          <p className="tl-body-lg mt-4 text-text-soft">
            Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of
            transactions happen every day because they solved identity-first
            payments.
          </p>
        </div>
        <div className="tl-panel tl-field rounded-[22px] px-4 py-4 flex flex-col justify-center">
          <p className="tl-body-lg mt-4 text-text-soft">
            Users send money to people — not raw account strings.
            <br />
            <br />
            TrustLink brings that same identity-first experience to stablecoin
            payments on Solana. Instead of copying wallet addresses, users pay a{" "}
            <strong>phone number</strong> or a permanent{" "}
            <strong>Transfer Identity Number (TIN)</strong>.
          </p>
        </div>
      </section>

      {/* TIN SYSTEM EXPLAINER */}
      <section
        id="tin-system"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="02" title="TIN Identity System" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">
              Your 10-digit identifier replaces wallet addresses.
            </h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              A Transfer Identity Number (TIN) is a portable, human-readable
              identifier that protects your wallet address while enabling
              seamless payments. Share your TIN instead of a complex
              cryptographic address.
            </p>
            <div className="mt-6 p-4 tl-field rounded-[14px] max-w-fit">
              <p className="text-xs font-bold uppercase tracking-wider text-text-faint mb-2">
                Example TIN
              </p>
              <p className="text-2xl font-mono font-bold text-accent">
                4872-1930-41
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            {[
              {
                icon: KeyRound,
                title: "Wallet-Linked Identity",
                desc: "Each TIN maps to one or more wallets with privacy controls",
              },
              {
                icon: Globe,
                title: "TSN Network",
                desc: "TINs are recognized across the TSN settlement network",
              },
              {
                icon: Lock,
                title: "Address Protection",
                desc: "Your actual wallet address stays hidden from recipients",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="tl-panel rounded-[22px] px-4 py-4 flex items-start gap-4"
              >
                <div className="p-2 rounded-[10px] bg-[var(--accent-soft)]">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-text">{title}</h3>
                  <p className="mt-1 text-sm text-text-soft">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL IDENTITY SECTION */}
      <section
        id="social-identity"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <SectionLabel index="03" title="Social Confidence Layer" />
            <h2 className="tl-h2 mt-5">
              Verify recipients through linked social identities.
            </h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              Before sending, verify your recipient through their linked
              WhatsApp number. This creates a social confidence layer that
              reduces scams and builds trust in peer-to-peer payments.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-text-faint mb-3">
                Supported Platforms
              </p>
              <div className="flex flex-wrap gap-3">
                {socialIdentities.map(({ icon: Icon, name, status, color }) => (
                  <div
                    key={name}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
                      status === "active"
                        ? "bg-[var(--accent-soft)] border-[var(--accent-border)]"
                        : "bg-[var(--surface-soft)] border-[var(--field-border)] opacity-60"
                    }`}
                  >
                    <Icon className="h-4 w-4" style={{ color }} />
                    <span
                      className={`text-sm font-medium ${status === "active" ? "text-text" : "text-text-faint"}`}
                    >
                      {name}
                    </span>
                    {status === "active" && (
                      <CheckCircle2 className="h-3 w-3 text-accent" />
                    )}
                    {status === "coming" && (
                      <span className="text-[10px] text-[var(--text-faint)]">
                        Soon
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: WHY ESCROW */}
      <section
        id="escrow-settlement"
        className="border-t border-accent-border mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8 px-0 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0"
      >
        <div className="min-w-0">
          <SectionLabel index="04" title="Escrow & Settlement" />
          <h2 className="tl-h2 mt-5">
            Secure payment flow with gasless convenience.
          </h2>
          <p className="tl-body-lg mt-4 text-text-soft">
            TrustLink uses escrow-backed settlement flows to reduce direct
            wallet exposure, support onboarding flows, and create programmable
            infrastructure. Users enjoy a <strong>gasless experience</strong> —
            no SOL is required in their wallet.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [ShieldCheck, "Reduce direct wallet exposure"],
            [Network, "Improve payment coordination"],
            [UserRoundCheck, "Support onboarding flows"],
            [Code2, "Programmable settlement infrastructure"],
          ].map(([Icon, title], idx) => (
            <article
              key={idx}
              className="tl-panel max-h-fit px-4 py-2 flex items-center gap-4"
            >
              {/* @ts-ignore */}
              <Icon className="h-6 w-6 text-accent shrink-0" />
              <h3 className="text-[0.95rem] font-bold text-text">
                {String(title)}
              </h3>
            </article>
          ))}
        </div>
      </section>

      {/* SECURITY SECTION */}
      <section className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0">
        <SectionLabel index="05" title="Security & Trust" />
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {securityFeatures.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="px-4 py-4 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-soft)] mb-4">
                <Icon className="h-7 w-7 text-accent" />
              </div>
              <h3 className="text-lg font-bold text-text">{title}</h3>
              <p className="mt-2 text-sm text-text-soft">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION: FEES TRANSPARENCY */}
      <section
        id="fees"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="06" title="Fees & Transparency" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">
              Transparent fee distribution, paid in token.
            </h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              TrustLink separates network fees, settlement fees, and
              infrastructure costs. All fees are covered in the token being sent
              — users never need SOL to transact.
            </p>
            <div className="mt-6 p-4 tl-field rounded-[14px] flex items-center gap-3 max-w-fit">
              <Zap className="h-5 w-5 text-accent" />
              <div>
                <p className="font-semibold text-[var(--text)]">
                  Gasless by Design
                </p>
                <p className="text-sm text-[var(--text-faint)]">
                  Fees included in transfer amount
                </p>
              </div>
            </div>
          </div>
          <div className="tl-panel rounded-[14px] p-4">
            <h3 className="text-lg font-bold text-[var(--text)] mb-4">
              Fee Distribution
            </h3>
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
                    <p className="font-semibold text-[var(--text)]">{role}</p>
                    <p className="text-sm text-[var(--text-faint)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: TSN & FEES */}
      <section
        id="tsn"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="07" title="Transfer Settlement Network" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">
              TSN is the settlement infrastructure layer powering TrustLink.
            </h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              TSN coordinates payment intents, escrow settlement, payout
              execution, operator coordination, and settlement verification.
              <br />
              <br />
              The goal is simple: Make blockchain payments feel closer to
              familiar mobile-money systems while preserving programmable
              on-chain settlement.
              <br />
              <br />
              <em>
                At launch, TrustLink operates the settlement infrastructure
                directly while the network matures.
              </em>
            </p>
          </div>
          <div className="tl-field rounded-[14px] p-4">
            <h3 className="text-[1.2rem] font-black text-text mb-4">
              Transparent Fees
            </h3>
            <p className="tl-body text-text-soft mb-6">
              TrustLink separates network fees, settlement fees, and
              infrastructure costs instead of combining everything into a single
              unclear transaction cost.
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
        </div>
      </section>

      {/* SECTION: TINS */}
      <section
        id="tins"
        className="border-t border-accent-border mx-auto grid w-full max-w-[1180px] scroll-mt-28 gap-8  px-0 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-0"
      >
        <div className="min-w-0">
          <SectionLabel index="08" title="TINS" />
          <h2 className="tl-h2 mt-5">Transfer Identity Number System.</h2>
          <p className="tl-body-lg mt-4 text-text-soft">
            Every TrustLink identity is built around a portable Transfer
            Identity Number (TIN).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            [
              Wallet,
              "Wallet-linked identities",
              "TINS enables wallet-linked payment identities and portable payment routing.",
            ],
            [
              Network,
              "Connects multiple identifiers",
              "A TIN can eventually connect phone numbers, social handles, and merchant profiles to the same settlement identity.",
            ],
            [
              Gauge,
              "Developer-accessible",
              "Provides developer-accessible identity infrastructure for the entire ecosystem.",
            ],
          ].map(([Icon, title, body]) => (
            <article
              key={String(title)}
              className="tl-panel rounded-[22px] px-4 py-4"
            >
              {/* @ts-ignore */}
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="tl-h3 mt-4">{String(title)}</h3>
              <p className="tl-body-sm mt-3 text-text-soft">{String(body)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* SECTION: DEVELOPERS */}
      <section
        id="developers"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="09" title="For Developers" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="tl-h2 mt-5">Programmable payment infrastructure.</h2>
            <p className="tl-body-lg mt-4 text-text-soft">
              TrustLink is designed as programmable payment infrastructure.
              Developers can resolve identities, quote settlement costs, create
              payment intents, and integrate escrow-backed payment flows
              directly into their own applications.
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
                href="/docs"
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
              <h3 className="tl-label text-accent">
                Programmable Payment Infrastructure
              </h3>
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

      {/* SECTION: CURRENT STATUS & ROADMAP */}
      <section
        id="status"
        className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28  px-0 py-14 sm:px-6 lg:px-0"
      >
        <SectionLabel index="10" title="Status & Roadmap" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div className="px-4 py-4">
            <h2 className="tl-h2 mb-6">Current Status</h2>
            <div className="flex flex-wrap gap-3">
              {[
                "Wallet onboarding",
                "Phone-number routing",
                "Escrow-backed payments",
                "Stablecoin support",
                "Transaction review flows",
                "Settlement-intent creation",
                "WhatsApp-based onboarding",
              ].map((feature) => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-2 bg-[var(--field-bg)] border border-[var(--field-border)] rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-soft)]"
                >
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  {feature}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="tl-h2 mt-5">Roadmap</h2>
            {roadmapItems.map(({ status, title, desc }) => (
              <div
                key={title}
                className="tl-panel rounded-[22px] px-4 py-4 flex items-start gap-4"
              >
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    status === "live"
                      ? "bg-accent/20"
                      : status === "soon"
                        ? "bg-warning/20"
                        : "bg-[var(--surface-soft)]"
                  }`}
                >
                  {status === "live" && (
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  )}
                  {status === "soon" && (
                    <Clock className="h-4 w-4 text-warning" />
                  )}
                  {status === "planned" && (
                    <TrendingUp className="h-4 w-4 text-[var(--text-faint)]" />
                  )}
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
      </section>

      {/* SECTION: CTA */}
      <section className="border-t border-accent-border mx-auto w-full max-w-[1180px] scroll-mt-28 px-0 py-14 sm:px-6 lg:px-0">
        <div className="rounded-[18px] p-4 md:p-6 text-center">
          <h2 className="tl-h2 mb-3">
            Ready to Experience Identity-First Payments?
          </h2>
          <p className="text-[var(--text-soft)] max-w-[500px] mx-auto mb-5">
            Experience stablecoin payments that feel familiar while keeping your
            wallet address private. TrustLink Pay brings gasless, identity-first
            payments to Solana.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/app"
              className="tl-button-primary tl-btn inline-flex items-center gap-2 rounded-[14px] px-6 py-3"
            >
              Open Dapp <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
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
              <Link
                key={label}
                href={href}
                className="text-sm text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
              >
                {label}
              </Link>
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
