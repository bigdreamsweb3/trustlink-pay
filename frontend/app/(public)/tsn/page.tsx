import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Wallet,
  Network,
} from "lucide-react";

export const metadata = {
  title: "Transfer Settlement Network (TSN) — TrustLink Pay",
  description:
    "TrustLink Pay is built on the Transfer Settlement Network, a Solana settlement protocol where Payment Intents, Escrow Holds, Cranker execution, and Settlement Proofs coordinate private payments.",
};

const stages = [
  {
    title: "Payment Intent",
    description:
      "A sender creates a cryptographically signed intent that defines the amount, recipient, and settlement constraints.",
  },
  {
    title: "Escrow Hold",
    description:
      "Funds are routed into an escrow-backed settlement path so the payment is secured before execution completes.",
  },
  {
    title: "Cranker Execution",
    description:
      "Independent operators called Crankers execute the settlement work, sponsor fees, and keep the system moving.",
  },
  {
    title: "Settlement Proof",
    description:
      "The system records verifiable proof of execution so the final payout can be audited and trusted.",
  },
];

const roles = [
  {
    title: "Senders",
    description:
      "Create payment intents and authorize settlement using identity-first flows.",
    icon: Wallet,
  },
  {
    title: "Recipients",
    description:
      "Receive funds through TIN and PRU-based routing without exposing wallet addresses.",
    icon: Network,
  },
  {
    title: "Crankers",
    description:
      "Execute settlement work and earn fees for keeping the network live.",
    icon: Zap,
  },
  {
    title: "Liquidity Providers",
    description:
      "Back the settlement economy with capital that earns yield from real payment volume.",
    icon: ShieldCheck,
  },
];

export default function TsnPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-main)] text-[var(--text)]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 lg:px-8">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)]/70 px-3 py-1 text-sm font-semibold uppercase tracking-[0.22em] text-accent">
            Transfer Settlement Network
          </span>
          <h1 className="max-w-4xl text-4xl font-black tracking-[-0.02em] sm:text-5xl">
            The settlement layer behind TrustLink Pay on Solana.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--text-soft)]">
            TrustLink Pay is built on the Transfer Settlement Network — a
            decentralized payment execution layer for Solana where Payment
            Intents, Escrow Holds, Cranker execution, and Settlement Proofs
            coordinate private and verifiable payments.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-main)] transition hover:opacity-90"
            >
              Explore the product <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="https://github.com/bigdreamsweb3/trustlink-pay"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--field-border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              View the repo
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[var(--accent-border)] bg-[var(--panel-bg)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.16)]">
          <div className="rounded-[22px] border border-[var(--field-border)] bg-[var(--bg-main)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  TSN architecture
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  Payment Intent → Escrow Hold → Cranker Execution → Settlement
                  Proof
                </h2>
              </div>
            </div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-[18px] border border-[var(--field-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent)]">
              <Image
                src="/tsn-architecture.svg"
                alt="Transfer Settlement Network TSN architecture diagram — TrustLink Pay"
                fill
                className="object-contain p-4"
                priority
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-[var(--accent-border)] bg-[var(--panel-bg)] p-6">
            <h2 className="text-2xl font-bold">How TSN works</h2>
            <div className="mt-6 space-y-4">
              {stages.map((stage, index) => (
                <div
                  key={stage.title}
                  className="rounded-[16px] border border-[var(--field-border)] bg-[var(--bg-main)] p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-black text-accent">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold">{stage.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
                    {stage.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--accent-border)] bg-[var(--panel-bg)] p-6">
            <h2 className="text-2xl font-bold">Who participates</h2>
            <div className="mt-6 grid gap-4">
              {roles.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    className="rounded-[16px] border border-[var(--field-border)] bg-[var(--bg-main)] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-[var(--accent-soft)] p-2 text-accent">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold">{role.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
                      {role.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
