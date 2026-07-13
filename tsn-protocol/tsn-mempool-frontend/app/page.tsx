'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  Cpu,
  FileText,
  Hash,
  Layers3,
  RefreshCw,
  Wallet,
  Zap,
} from 'lucide-react';

type Intent = {
  id: string;
  paymentId: string;
  amount: number;
  tokenMintAddress: string;
  status: string;
  recipientHash: string;
  postedAt: string;
  updatedAt: string;
};

type Claim = {
  id: string;
  intentId: string;
  paymentId: string;
  destinationWallet: string | null;
  destinationRoute?: 'private' | string;
  status: string;
  postedAt: string;
};

type Proof = {
  intent_id: string;
  cranker_pubkey: string | null;
  crankerRoute?: 'private' | string;
  proof_tx: string;
  timestamp: string;
  encrypted_payload?: string;
};

type WorkItem = { intent: Intent; claimRequest: Claim };

type TinOperation = {
  intentId: string;
  intentType: 'tin_creation' | 'tin_update';
  tinHash: string;
  ownerPubkey: string | null;
  ownerIntentHash: string;
  nonce: string;
  expiry: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  verifierCranker: string | null;
  submitterCranker: string | null;
  feeMetadata: {
    feeMint: string;
    grossAmount: string;
    verifierAmount: string;
    submitterAmount: string;
    teamAmount: string;
    reservePoolAmount: string;
    feeCommitmentHash: string;
    status: string;
  } | null;
  failureReason?: string | null;
  onchainSignatures: string[];
  displayName?: string | null;
  encryptedMetadataHash: string;
  pruConfigurationHash: string;
};

type Epoch = {
  epoch_number: number;
  epoch_started_at: string;
  next_close_at: string;
  intent_count: number;
  claim_count: number;
  proof_count: number;
};

type MempoolData = {
  epoch: Epoch | null;
  intents: Intent[];
  claims: Claim[];
  proofs: Proof[];
  work: WorkItem[];
  tinOperations: TinOperation[];
  fetched_at: string;
  metrics: {
    intent_to_claim: {
      sample_count: number;
      average_ms: number;
      min_ms: number;
      max_ms: number;
      last_ms: number;
      updated_at?: string;
    };
    uptime: {
      service_started_at: string;
      uptime_seconds: number;
      uptime_days: number;
      downtime_events: number;
    };
    active_crankers_last_epoch: number;
  } | null;
  network: {
    online_crankers_last_epoch: number;
    total_crankers_seen: number;
    total_vault_liquidity_usd?: number;
    total_vault_liquidity: number;
    tokens: Array<{
      token_mint: string;
      token_symbol?: string | null;
      token_name?: string | null;
      unit_price_usd?: number | null;
      vault_token_account?: string | null;
      cranker_vault?: string | null;
      total_vault_liquidity_units?: number;
      total_vault_liquidity_usd?: number;
      total_vault_liquidity: number;
      total_intent_amount: number;
      pending_intent_amount: number;
      executed_intent_amount: number;
      vault_liquidity_estimate: number;
      liquidity_source?: string | null;
    }>;
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#fbbf24',
  escrowed: '#58f2b1',
  claimed: '#2563eb',
  processing: '#22d3ee',
  executed: '#00ff87',
  settled: '#00ff87',
  completed: '#00ff87',
  expired: '#6b7280',
  canceled: '#6b7280',
  failed: '#ef4444',
  reverted: '#ef4444',
  pending_verification: '#fbbf24',
  verifier_assigned: '#fbbf24',
  verified: '#22d3ee',
  fee_pending: '#a78bfa',
  fee_committed: '#58f2b1',
  submitter_assigned: '#58f2b1',
  submitted_onchain: '#2563eb',
  finalized: '#00ff87',
  rejected: '#ef4444',
};

const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function truncate(value: string, size = 14) {
  if (!value) return '--';
  if (value.length <= size) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function tokenAlias(mint: string) {
  const aliases: Record<string, string> = {
    [DEVNET_USDC_MINT]: 'USDC',
  };
  return aliases[mint] ?? truncate(mint, 14);
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return '0.0000';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 });
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.00';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 0 : 2, minimumFractionDigits: 2 });
}

function formatUsdcBaseUnits(value?: string | null) {
  if (!value) return '0.000000 USDC';
  const units = Number(value);
  if (!Number.isFinite(units)) return '0.000000 USDC';
  return `${(units / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 2 })} USDC`;
}

function formatSecondsFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '--';
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCountdown(targetIso: string, now: number) {
  const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - now) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timeAgo(iso: string, now: number | null) {
  if (!now) return '--';
  const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function epochProgress(epoch: Epoch | null, now: number | null) {
  if (!epoch || !now) return 0;
  const start = new Date(epoch.epoch_started_at).getTime();
  const end = new Date(epoch.next_close_at).getTime();
  if (end <= start) return 0;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function StatusBadge({ status }: { status: string }) {
  const displayStatus = status === 'onchain' ? 'escrowed' : status;
  const color = STATUS_COLORS[displayStatus] ?? '#6b7280';
  return (
    <span className="status-badge" style={{ ['--status-color' as string]: color }}>
      <span className="status-dot" />
      {displayStatus}
    </span>
  );
}

function DataRow({
  title,
  subtitle,
  status,
  icon,
  isNew,
}: {
  title: string;
  subtitle: string;
  status?: string;
  icon: React.ReactNode;
  isNew: boolean;
}) {
  return (
    <div className={`data-row ${isNew ? 'slide-in' : ''}`}>
      <div className="row-main">
        <span className="row-icon">{icon}</span>
        <div className="row-copy">
          <div className="row-title">{title}</div>
          <div className="row-subtitle">{subtitle}</div>
        </div>
      </div>
      {status ? <StatusBadge status={status} /> : null}
    </div>
  );
}

function Panel({ title, subtitle, count, children }: { title: string; subtitle: string; count: number; children: React.ReactNode }) {
  return (
    <section className="ledger-panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-subtitle">{subtitle}</div>
        </div>
        <span className="panel-count">{count}</span>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export default function MempoolExplorer() {
  const [data, setData] = useState<MempoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const prevIds = useRef<Set<string>>(new Set());
  const newIds = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/mempool', { cache: 'no-store' });
      if (!res.ok) throw new Error('mempool fetch failed');
      const json: MempoolData = await res.json();
      const allIds = [
        ...json.intents.map((intent) => intent.id),
        ...json.claims.map((claim) => claim.id),
        ...json.proofs.map((proof) => `${proof.intent_id}:proof`),
        ...json.work.map((work) => `${work.intent.id}:work`),
        ...(json.tinOperations ?? []).map((operation) => `${operation.intentId}:tin`),
      ];
      newIds.current = new Set(allIds.filter((id) => !prevIds.current.has(id)));
      prevIds.current = new Set(allIds);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mempool offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    void fetchData();
    const poll = window.setInterval(() => void fetchData(), 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [fetchData]);

  const progress = epochProgress(data?.epoch ?? null, now);
  const countdown = data?.epoch && now ? formatCountdown(data.epoch.next_close_at, now) : '--:--:--';
  const activeLiquidityUsd = data?.network?.total_vault_liquidity_usd ?? data?.network?.total_vault_liquidity ?? 0;

  return (
    <main className="mempool-shell">
      <div className="scan-grid" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Cpu size={20} /></div>
          <div>
            <div className="brand-title">TSN Mempool Explorer</div>
            <div className="brand-subtitle">private settlement queue for TrustLink Pay</div>
          </div>
        </div>
        <div className="live-strip">
          <span className={`live-dot ${error ? 'danger' : ''}`} />
          <span>{error ? 'backend disconnected' : 'live firebase mempool'}</span>
          <button className="refresh-button" type="button" onClick={() => void fetchData()}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            refresh
          </button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-card primary-card">
          <div className="hero-row compact">
            <div>
              <div className="eyebrow">settlement epoch</div>
              <h1>Epoch #{data?.epoch?.epoch_number ?? '--'}</h1>
              <p>Live TSN work board for intents, claims, cranker execution, and proof submission.</p>
            </div>
            <div className="epoch-stack">
              <div className="countdown-card">
                <div className="flex flex-nowrap items-center gap-2 md:justify-end">
                  <Clock3 size={18} />
                  <span>{countdown}</span>
                </div>
                <small>next close</small>
              </div>
              <div className="progress-shell compact">
                <div className="progress-meta">
                  <span>epoch progress</span>
                  <strong>{progress.toFixed(1)}%</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
          <div className="flow-strip">
            <div className="flow-step">
              <Box size={15} />
              <span>Intent</span>
            </div>
            <ArrowRight size={15} />
            <div className="flow-step">
              <FileText size={15} />
              <span>Claim</span>
            </div>
            <ArrowRight size={15} />
            <div className="flow-step">
              <Zap size={15} />
              <span>Crank</span>
            </div>
            <ArrowRight size={15} />
            <div className="flow-step">
              <CheckCircle2 size={15} />
              <span>Proof</span>
            </div>
          </div>
          <div className="hero-signal-grid">
            <div>
              <span>Open Intents</span>
              <strong>{data?.intents.filter((intent) => !['executed', 'settled', 'completed'].includes(intent.status)).length ?? 0}</strong>
            </div>
            <div>
              <span>Claim Requests</span>
              <strong>{data?.claims.length ?? 0}</strong>
            </div>
            <div>
              <span>Proofs</span>
              <strong>{data?.proofs.length ?? 0}</strong>
            </div>
            <div>
              <span>Avg Intent to Claim</span>
              <strong>{formatSecondsFromMs(data?.metrics?.intent_to_claim.average_ms ?? 0)}</strong>
            </div>
          </div>
        </div>

        <aside className="hero-card network-card">
          <div className="network-card-head">
            <div>
              <div className="eyebrow">network capacity</div>
              <div className="capacity-label">Active Liquidity</div>
            </div>
            <Wallet size={19} />
          </div>
          <div className="capacity-primary">
            <strong>{formatUsd(activeLiquidityUsd)}</strong>
            <small>USD value from TSN CrankerVault token balances</small>
          </div>
          <div className="capacity-grid">
            <div>
              <span>Online Crankers</span>
              <strong>{data?.network?.online_crankers_last_epoch ?? 0}</strong>
            </div>
            <div>
              <span>Total Seen</span>
              <strong>{data?.network?.total_crankers_seen ?? 0}</strong>
            </div>
            <div>
              <span>Open Work</span>
              <strong>{data?.work.length ?? 0}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="ledger-grid">
        <Panel title="Payment Intents" subtitle="sender-originated TSN requests" count={data?.intents.length ?? 0}>
          {data?.intents.length ? data.intents.map((intent) => (
            <DataRow
              key={intent.id}
              title={`${formatAmount(intent.amount)} ${tokenAlias(intent.tokenMintAddress)}`}
              subtitle={`${truncate(intent.id, 18)} | ${timeAgo(intent.postedAt, now)}`}
              status={intent.status}
              icon={<Hash size={14} />}
              isNew={newIds.current.has(intent.id)}
            />
          )) : <div className="empty-state">No intents yet</div>}
        </Panel>

        <Panel title="Claim Requests" subtitle="recipient payout requests" count={data?.claims.length ?? 0}>
          {data?.claims.length ? data.claims.map((claim) => (
            <DataRow
              key={claim.id}
              title="Private settlement route"
              subtitle={`${truncate(claim.id, 18)} | ${timeAgo(claim.postedAt, now)}`}
              status={claim.status}
              icon={<FileText size={14} />}
              isNew={newIds.current.has(claim.id)}
            />
          )) : <div className="empty-state">No claim requests yet</div>}
        </Panel>

        <Panel title="Proofs" subtitle="cranker payout attestations" count={data?.proofs.length ?? 0}>
          {data?.proofs.length ? data.proofs.map((proof) => (
            <DataRow
              key={`${proof.intent_id}:${proof.proof_tx}`}
              title="Private cranker route"
              subtitle={`${truncate(proof.proof_tx, 18)} | ${timeAgo(proof.timestamp, now)}`}
              status="executed"
              icon={<CheckCircle2 size={14} />}
              isNew={newIds.current.has(`${proof.intent_id}:proof`)}
            />
          )) : <div className="empty-state">No proofs submitted yet</div>}
        </Panel>
      </section>

      <section className="work-panel">
        <div className="section-title-row">
          <div>
            <div className="section-kicker">identity operations</div>
            <h2>TIP Cranker Queue</h2>
          </div>
          <span className="queue-count">{data?.tinOperations.length ?? 0} operations</span>
        </div>
        <div className="work-table">
          {data?.tinOperations.length ? data.tinOperations.map((operation) => (
            <div className={`work-row tins-work-row ${newIds.current.has(`${operation.intentId}:tin`) ? 'slide-in' : ''}`} key={operation.intentId}>
              <div>
                <span>operation</span>
                <strong>{operation.intentType === 'tin_creation' ? 'TIN creation' : 'TIN update'}</strong>
              </div>
              <div>
                <span>TIN route</span>
                <strong>{truncate(operation.tinHash, 18)}</strong>
              </div>
              <div>
                <span>owner</span>
                <strong>{truncate(operation.ownerPubkey ?? '', 18)}</strong>
              </div>
              <div>
                <span>operation fee</span>
                <strong>{formatUsdcBaseUnits(operation.feeMetadata?.grossAmount)}</strong>
              </div>
              <div>
                <span>crankers</span>
                <strong>A {truncate(operation.verifierCranker ?? '', 10)} / B {truncate(operation.submitterCranker ?? '', 10)}</strong>
              </div>
              <div>
                <span>PRU commitment</span>
                <strong>{truncate(operation.pruConfigurationHash, 18)}</strong>
              </div>
              <StatusBadge status={operation.status} />
            </div>
          )) : <div className="empty-state roomy">No TIP operations yet. TIN creation and updates will appear here after owner-signed intents enter TSN.</div>}
        </div>
      </section>

      <section className="work-panel">
        <div className="section-title-row">
          <div>
            <div className="section-kicker">operator queue</div>
            <h2>Cranker Work Queue</h2>
          </div>
          <span className="queue-count">{data?.work.length ?? 0} available</span>
        </div>
        <div className="work-table">
          {data?.work.length ? data.work.map((work) => (
            <div className={`work-row ${newIds.current.has(`${work.intent.id}:work`) ? 'slide-in' : ''}`} key={`${work.intent.id}:${work.claimRequest.id}`}>
              <div>
                <span>intent</span>
                <strong>{truncate(work.intent.id, 18)}</strong>
              </div>
              <div>
                <span>claim</span>
                <strong>{truncate(work.claimRequest.id, 18)}</strong>
              </div>
              <div>
                <span>amount</span>
                <strong>{formatAmount(work.intent.amount)} {tokenAlias(work.intent.tokenMintAddress)}</strong>
              </div>
              <div>
                <span>route</span>
                <strong>private</strong>
              </div>
              <StatusBadge status="pending" />
            </div>
          )) : <div className="empty-state roomy">No open work. The queue is waiting for claimable payments.</div>}
        </div>
      </section>

      <section className="token-flow-grid">
        <div className="section-title-row">
          <div>
            <div className="section-kicker">on-chain capacity</div>
            <h2>Vaults By Token</h2>
          </div>
          <span className="data-note">balances are read from TSN CrankerVault token accounts</span>
        </div>
        {(data?.network?.tokens ?? []).length > 0 ? (
          data!.network!.tokens.slice(0, 6).map((token) => (
            <article className="token-card" key={token.token_mint}>
              <div className="token-head">
                <div>
                  <div className="token-symbol">{token.token_symbol ?? tokenAlias(token.token_mint)}</div>
                  <div className="token-mint">{truncate(token.vault_token_account ?? token.token_mint, 18)}</div>
                </div>
                <Wallet size={20} />
              </div>
              <div className="token-total compact">{formatUsd(token.total_vault_liquidity_usd ?? token.total_vault_liquidity ?? token.vault_liquidity_estimate)}</div>
              <div className="token-breakdown">
                <span>Units <strong>{formatAmount(token.total_vault_liquidity_units ?? token.total_vault_liquidity ?? 0)} {token.token_symbol ?? tokenAlias(token.token_mint)}</strong></span>
                <span>USD price <strong>{token.unit_price_usd != null ? formatUsd(token.unit_price_usd) : '--'}</strong></span>
                <span>Mempool <strong>{formatAmount(token.total_intent_amount)}</strong></span>
                <span>Pending <strong>{formatAmount(token.pending_intent_amount)}</strong></span>
                <span>Executed <strong>{formatAmount(token.executed_intent_amount)}</strong></span>
                <span>Source <strong>{token.liquidity_source ?? 'program'}</strong></span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-token-card">
            <Layers3 size={20} />
            <span>No on-chain CrankerVault accounts discovered yet. Initialize/fund a TSN cranker vault, then refresh.</span>
          </div>
        )}
      </section>

      <footer className="mempool-footer">
        <span>TSN mempool explorer | polling every 4s</span>
        <span>{data?.fetched_at ? `last update ${new Date(data.fetched_at).toLocaleTimeString()}` : 'waiting for first fetch'}</span>
      </footer>

      {error ? (
        <div className="error-toast">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}
    </main>
  );
}
