import Link from "next/link";
import { ArrowLeft, Gauge, Network, Wallet } from "lucide-react";

import styles from "./operator-dashboard.module.css";

export default function OperatorDashboardPage() {
  return (
    <main className={`app-shell tl-grid-overlay ${styles.operatorShell}`}>
      <section className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[980px] flex-col justify-center py-8">
        <Link href="/#cranker" className={`mb-8 inline-flex w-fit items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-bold ${styles.backLink}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to TrustLink Pay
        </Link>

        <div className={`rounded-[22px] p-6 md:p-8 ${styles.panel}`}>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
            <Network className="h-3.5 w-3.5" />
            TSN Operator Dashboard
          </div>
          <h1 className={`mt-5 max-w-[760px] text-[clamp(2rem,6vw,4rem)] font-black leading-tight tracking-normal ${styles.title}`}>
            Operate liquidity, settle intents, recover at epoch.
          </h1>
          <p className={`mt-4 max-w-[680px] text-sm leading-7 md:text-base ${styles.copy}`}>
            Monitor vault capital, acquire TSN payment intents, submit proof of settlement, and track reimbursement across each epoch cycle.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [Wallet, "Vault capital", "Monitor deployable stablecoin liquidity and settlement capacity."],
              [Gauge, "Intent queue", "Track pending payments, leases, and proof status."],
              [Network, "Epoch recovery", "See reimbursements, claim fees, and operator earnings."],
            ].map(([Icon, title, body]) => (
              <article key={String(title)} className={`rounded-[14px] p-4 ${styles.card}`}>
                <div className={`grid h-10 w-10 place-items-center rounded-[12px] ${styles.iconSurface}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className={`mt-4 text-base font-black ${styles.cardTitle}`}>{String(title)}</h2>
                <p className={`mt-2 text-xs leading-6 ${styles.cardBody}`}>{String(body)}</p>
              </article>
            ))}
          </div>

          <div className={`mt-8 grid gap-4 pt-5 text-sm md:grid-cols-3 ${styles.metric}`}>
            <div>
              <span className="block text-[0.68rem] font-black uppercase tracking-[0.18em]">Settlement Mode</span>
              <strong className="mt-1 block text-xl font-black">Instant</strong>
            </div>
            <div>
              <span className="block text-[0.68rem] font-black uppercase tracking-[0.18em]">Epoch Model</span>
              <strong className="mt-1 block text-xl font-black">7 hours</strong>
            </div>
            <div>
              <span className="block text-[0.68rem] font-black uppercase tracking-[0.18em]">Role</span>
              <strong className="mt-1 block text-xl font-black">Cranker</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
