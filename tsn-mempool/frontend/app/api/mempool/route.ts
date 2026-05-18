import { NextResponse } from 'next/server';

// ── Point this to your self-hosted backend ───────────────────────────────────
// Set MEMPOOL_API_URL in .env.local, e.g.:
//   MEMPOOL_API_URL=http://localhost:8000

const BASE = (process.env.MEMPOOL_API_URL || 'http://localhost:8000').replace(/\/$/, '');

async function fetchGET(path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const [epoch, intents, claims, proofs, work] = await Promise.all([
    fetchGET('/epoch/status'),
    fetchGET('/intents'),
    fetchGET('/claim-requests'),
    fetchGET('/proofs'),
    fetchGET('/work'),
  ]);

  return NextResponse.json({
    epoch:      epoch  ?? null,
    intents:    Array.isArray(intents) ? intents : [],
    claims:     Array.isArray(claims)  ? claims  : [],
    proofs:     Array.isArray(proofs)  ? proofs  : [],
    work:       Array.isArray(work)    ? work    : [],
    fetched_at: new Date().toISOString(),
  });
}
