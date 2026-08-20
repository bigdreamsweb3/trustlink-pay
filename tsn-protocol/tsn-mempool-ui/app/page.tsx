"use client";

import { useEffect, useState } from "react";

type Intent = { id: string; payment_id: string; status: string; assigned_cranker_pubkey?: string | null; funding_tx_sig?: string | null; settlement_tx_sig?: string | null };

export default function MempoolPage() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/mempool").then((r) => r.ok ? r.json() : Promise.reject(new Error("mempool unavailable"))).then((v) => setIntents(Array.isArray(v?.intents) ? v.intents : [])).catch((e) => setError(e instanceof Error ? e.message : "mempool unavailable")); }, []);
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32, fontFamily: "system-ui" }}>
    <h1>TSN settlement intents</h1>
    <p>Only internal Node-created intents are shown. Settlement DNA and encrypted payment bindings never enter this UI.</p>
    {error ? <p role="alert">{error}</p> : null}
    <table><thead><tr><th>Intent</th><th>Payment</th><th>Status</th><th>Cranker</th><th>Funding</th><th>Settlement</th></tr></thead><tbody>{intents.map((i) => <tr key={i.id}><td>{i.id}</td><td>{i.payment_id}</td><td>{i.status}</td><td>{i.assigned_cranker_pubkey ?? "—"}</td><td>{i.funding_tx_sig ?? "—"}</td><td>{i.settlement_tx_sig ?? "—"}</td></tr>)}</tbody></table>
  </main>;
}
