import Link from "next/link";
import { ArrowLeft, Gauge, Network, Wallet } from "lucide-react";

export default function OperatorDashboardPage() {
  return (
    <main className="app-shell tl-grid-overlay bg-[var(--bg)]">
      <section className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[980px] flex-col justify-center py-8">
        <Link href="/#cranker" className="mb-8 inline-flex w-fit items-center gap-2 rounded-[14px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-2 text-sm font-bold text-[var(--text-soft)]">
          <ArrowLeft className="h-4 w-4" />
          Back to TrustLink Pay
        </Link>

        <div className="tl-panel p-6 md:p-8">
          <div className="tl-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
            <Network className="h-3.5 w-3.5" />
            Operator Dashboard
          </div>
          <h1 className="mt-5 max-w-[760px] text-[clamp(2rem,6vw,4rem)] font-black leading-tight tracking-normal text-[var(--text)]">
            Cranker operations are coming into focus.
          </h1>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-[var(--text-soft)] md:text-base">
            This dashboard will let operators fund vaults, watch TSN payment intents, acquire execution leases, submit settlement proof, and track epoch reimbursements.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [Wallet, "Vault capital", "Monitor deployable USDC and settlement capacity."],
              [Gauge, "Intent queue", "Track pending payments, leases, and proof status."],
              [Network, "Epoch recovery", "See reimbursements, claim fees, and operator earnings."],
            ].map(([Icon, title, body]) => (
              <article key={String(title)} className="tl-field rounded-[14px] p-4">
                <Icon className="h-5 w-5 text-[var(--accent)]" />
                <h2 className="mt-4 text-base font-black text-[var(--text)]">{String(title)}</h2>
                <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{String(body)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
