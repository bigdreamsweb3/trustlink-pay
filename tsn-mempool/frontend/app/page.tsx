'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CheckCircle2, FileText, Radio, RefreshCw,
         Zap, AlertCircle, Hash, Cpu } from 'lucide-react';

type Intent = {
  id: string; paymentId: string; amount: number;
  tokenMintAddress: string; status: string;
  recipientHash: string; postedAt: string; updatedAt: string;
};
type Claim = {
  id: string; intentId: string; paymentId: string;
  destinationWallet: string; status: string; postedAt: string;
};
type Proof = {
  intent_id: string; cranker_pubkey: string;
  proof_tx: string; timestamp: string; encrypted_payload?: string;
};
type WorkItem = { intent: Intent; claimRequest: Claim };
type Epoch = {
  epoch_number: number; epoch_started_at: string;
  next_close_at: string; intent_count: number;
  claim_count: number; proof_count: number;
};
type MempoolData = {
  epoch: Epoch | null; intents: Intent[]; claims: Claim[];
  proofs: Proof[]; work: WorkItem[]; fetched_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#fbbf24', claimed: '#2563EB', executed: '#00ff87',
  settled: '#00ff87', expired: '#6b7280', failed: '#ef4444',
  canceled: '#6b7280', reverted: '#ef4444',
  processing: '#22d3ee', completed: '#00ff87',
};
const STATUS_GLOW: Record<string, string> = {
  pending:   '0 0 6px rgba(251,191,36,0.6)',
  claimed:   '0 0 6px rgba(37,99,235,0.6)',
  executed:  '0 0 6px rgba(0,255,135,0.6)',
  settled:   '0 0 6px rgba(0,255,135,0.6)',
  failed:    '0 0 6px rgba(239,68,68,0.6)',
  completed: '0 0 6px rgba(0,255,135,0.6)',
};

function truncate(s: string, n = 12) {
  if (!s) return '';
  if (s.length <= n) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, Math.floor(
    (new Date(targetIso).getTime() - Date.now()) / 1000
  ));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function epochProgress(epoch: Epoch): number {
  const start = new Date(epoch.epoch_started_at).getTime();
  const end   = new Date(epoch.next_close_at).getTime();
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#6b7280';
  const glow  = STATUS_GLOW[status]  || 'none';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      color, fontSize:11, fontWeight:600, letterSpacing:'0.08em',
      textTransform:'uppercase' }}>
      <span style={{ width:7, height:7, borderRadius:'50%',
        background:color, boxShadow:glow, display:'inline-block' }}
        className={status === 'pending' ? 'pulse-dot' : ''} />
      {status}
    </span>
  );
}

function IntentRow({ intent, isNew }: { intent: Intent; isNew: boolean }) {
  return (
    <div className={isNew ? 'slide-in' : ''} style={{
      borderBottom:'1px solid #111', padding:'10px 14px',
      display:'grid', gridTemplateColumns:'1fr auto', gap:8,
      transition:'background 0.2s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#0d0d0d'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='transparent'; }}>
      <div>
        <div style={{ color:'#e8e8e8', fontSize:12, fontWeight:600, marginBottom:3 }}>
          <Hash size={10} style={{ display:'inline', marginRight:4, color:'#F97316' }} />
          {truncate(intent.id, 20)}
        </div>
        <div style={{ color:'#555', fontSize:11 }}>
          {intent.amount} <span style={{ color:'#666' }}>tokens</span>
          {' '}<span style={{ color:'#333' }}>|</span>{' '}
          {timeAgo(intent.postedAt)}
        </div>
      </div>
      <StatusBadge status={intent.status} />
    </div>
  );
}

function ClaimRow({ claim, isNew }: { claim: Claim; isNew: boolean }) {
  return (
    <div className={isNew ? 'slide-in' : ''} style={{
      borderBottom:'1px solid #111', padding:'10px 14px',
      display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#0d0d0d'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='transparent'; }}>
      <div>
        <div style={{ color:'#e8e8e8', fontSize:12, fontWeight:600, marginBottom:3 }}>
          <FileText size={10} style={{ display:'inline', marginRight:4, color:'#2563EB' }} />
          {truncate(claim.id, 20)}
        </div>
        <div style={{ color:'#555', fontSize:11 }}>
          <span style={{ color:'#444' }}>-{'>'}</span>{' '}
          {truncate(claim.destinationWallet, 18)}
          {' '}<span style={{ color:'#333' }}>|</span>{' '}
          {timeAgo(claim.postedAt)}
        </div>
      </div>
      <StatusBadge status={claim.status} />
    </div>
  );
}

function ProofRow({ proof, isNew }: { proof: Proof; isNew: boolean }) {
  return (
    <div className={isNew ? 'slide-in' : ''} style={{
      borderBottom:'1px solid #111', padding:'10px 14px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#0d0d0d'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='transparent'; }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
        <CheckCircle2 size={11} style={{ color:'#00ff87', flexShrink:0 }} />
        <span style={{ color:'#e8e8e8', fontSize:12, fontWeight:600 }}>
          {truncate(proof.cranker_pubkey, 20)}
        </span>
      </div>
      <div style={{ color:'#555', fontSize:11 }}>
        tx: {truncate(proof.proof_tx, 22)}
        {' '}<span style={{ color:'#333' }}>|</span>{' '}
        {timeAgo(proof.timestamp)}
      </div>
    </div>
  );
}

function WorkRow({ item, isNew }: { item: WorkItem; isNew: boolean }) {
  return (
    <div className={isNew ? 'slide-in' : ''} style={{
      borderBottom:'1px solid #111', padding:'10px 16px',
      display:'grid', gridTemplateColumns:'1fr 1fr auto',
      gap:12, alignItems:'center' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#0d0d0d'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='transparent'; }}>
      <div>
        <div style={{ color:'#F97316', fontSize:11, marginBottom:2 }}>INTENT</div>
        <div style={{ color:'#e8e8e8', fontSize:12, fontWeight:600 }}>
          {truncate(item.intent.id, 18)}
        </div>
        <div style={{ color:'#555', fontSize:11 }}>{item.intent.amount} tokens</div>
      </div>
      <div>
        <div style={{ color:'#2563EB', fontSize:11, marginBottom:2 }}>CLAIM</div>
        <div style={{ color:'#e8e8e8', fontSize:12, fontWeight:600 }}>
          {truncate(item.claimRequest.id, 18)}
        </div>
        <div style={{ color:'#555', fontSize:11 }}>
          {truncate(item.claimRequest.destinationWallet, 18)}
        </div>
      </div>
      <div style={{ padding:'4px 10px', border:'1px solid #F97316',
        color:'#F97316', fontSize:11, letterSpacing:'0.08em',
        boxShadow:'0 0 6px rgba(249,115,22,0.2)' }}>AVAILABLE</div>
    </div>
  );
}

export default function MempoolExplorer() {
  const [data, setData]           = useState<MempoolData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');
  const [progress, setProgress]   = useState(0);
  const prevIds = useRef<Set<string>>(new Set());
  const newIds  = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/mempool', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json: MempoolData = await res.json();
      const allIds = [
        ...json.intents.map(i => i.id),
        ...json.claims.map(c => c.id),
        ...json.proofs.map(p => p.intent_id + '_proof'),
        ...json.work.map(w => w.intent.id + '_work'),
      ];
      newIds.current  = new Set(allIds.filter(id => !prevIds.current.has(id)));
      prevIds.current = new Set(allIds);
      setData(json); setError(null);
    } catch { setError('connection lost'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 4000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => {
      if (data?.epoch) {
        setCountdown(formatCountdown(data.epoch.next_close_at));
        setProgress(epochProgress(data.epoch));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [data?.epoch]);

  useEffect(() => {
    if (data?.epoch) {
      setCountdown(formatCountdown(data.epoch.next_close_at));
      setProgress(epochProgress(data.epoch));
    }
  }, [data?.epoch]);

  const col: React.CSSProperties = {
    background:'#050505', border:'1px solid #1a1a1a',
    display:'flex', flexDirection:'column',
    overflow:'hidden', position:'relative', zIndex:1,
  };
  const colHeader: React.CSSProperties = {
    padding:'10px 14px', borderBottom:'1px solid #1a1a1a',
    display:'flex', alignItems:'center',
    justifyContent:'space-between', background:'#080808',
  };
  const colTitle: React.CSSProperties  = { fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#444', textTransform:'uppercase' };
  const colCount: React.CSSProperties  = { fontSize:11, color:'#F97316', fontWeight:600 };
  const colBody: React.CSSProperties   = { flex:1, overflowY:'auto', maxHeight:340 };
  const emptyState: React.CSSProperties = { padding:'32px 16px', textAlign:'center', color:'#2a2a2a', fontSize:12 };

  return (
    <div style={{ minHeight:'100vh', background:'#000', position:'relative', zIndex:1 }}>

      {/* Header */}
      <div style={{
        borderBottom:'1px solid #1a1a1a', padding:'0 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        height:56, background:'#050505', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Cpu size={18} style={{ color:'#F97316' }} />
            <span style={{ color:'#e8e8e8', fontSize:14, fontWeight:700, letterSpacing:'0.05em' }}>TSN MEMPOOL</span>
            <span style={{ color:'#333', fontSize:14 }}>/</span>
            <span style={{ color:'#555', fontSize:13 }}>EXPLORER</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span className="pulse-dot" style={{ width:7, height:7, borderRadius:'50%',
              background:'#00ff87', boxShadow:'0 0 6px rgba(0,255,135,0.8)',
              display:'inline-block' }} />
            <span style={{ color:'#00ff87', fontSize:11, letterSpacing:'0.1em' }}>LIVE</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:24 }}>
          {data?.epoch && (
            <>
              <div style={{ textAlign:'right' }}>
                <div style={{ color:'#444', fontSize:10, letterSpacing:'0.1em', marginBottom:2 }}>
                  EPOCH #{data.epoch.epoch_number}
                </div>
                <div style={{ color:'#e8e8e8', fontSize:14, fontWeight:700, letterSpacing:'0.08em' }}>
                  {countdown || '--:--:--'}
                </div>
              </div>
              <div style={{ color:'#333', fontSize:18 }}>|</div>
            </>
          )}
          {error
            ? <AlertCircle size={16} style={{ color:'#ef4444' }} />
            : <RefreshCw size={14} style={{ color:'#2a2a2a',
                animation: loading ? 'spin 1s linear infinite' : 'none' }} />}
        </div>
      </div>

      {/* Epoch progress bar */}
      {data?.epoch && (
        <div style={{ background:'#080808', borderBottom:'1px solid #111',
          padding:'8px 24px', position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ color:'#333', fontSize:10, letterSpacing:'0.1em' }}>EPOCH PROGRESS</span>
            <span style={{ color:'#444', fontSize:10 }}>{progress.toFixed(1)}%</span>
          </div>
          <div style={{ height:3, background:'#111', overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${progress}%`,
              background: progress > 80
                ? 'linear-gradient(90deg, #2563EB, #ef4444)'
                : 'linear-gradient(90deg, #2563EB, #F97316)',
              boxShadow:'0 0 8px rgba(249,115,22,0.5)',
              transition:'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)',
        borderBottom:'1px solid #111', background:'#030303',
        position:'relative', zIndex:1 }}>
        {[
          { label:'INTENTS',      val:data?.intents.length??0, icon:<Box size={14}/>,         color:'#F97316' },
          { label:'CLAIMS',       val:data?.claims.length??0,  icon:<FileText size={14}/>,     color:'#2563EB' },
          { label:'PROOFS',       val:data?.proofs.length??0,  icon:<CheckCircle2 size={14}/>, color:'#00ff87' },
          { label:'WORK PENDING', val:data?.work.length??0,    icon:<Zap size={14}/>,          color:'#fbbf24' },
        ].map((stat, i) => (
          <div key={stat.label} style={{ padding:'16px 20px',
            borderRight: i < 3 ? '1px solid #111' : 'none',
            display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:stat.color, opacity:0.7 }}>{stat.icon}</span>
            <div>
              <div style={{ color:stat.color, fontSize:22, fontWeight:700,
                lineHeight:1, letterSpacing:'-0.02em' }}>
                {String(stat.val).padStart(2,'0')}
              </div>
              <div style={{ color:'#333', fontSize:10, letterSpacing:'0.12em', marginTop:4 }}>
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Three-column live feed */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
        gap:1, background:'#111', borderBottom:'1px solid #111',
        position:'relative', zIndex:1 }}>

        <div style={col}>
          <div style={colHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Box size={12} style={{ color:'#F97316' }}/>
              <span style={colTitle}>Payment Intents</span>
            </div>
            <span style={colCount}>{data?.intents.length??0}</span>
          </div>
          <div style={colBody}>
            {!data?.intents.length
              ? <div style={emptyState}>no intents in mempool</div>
              : data.intents.map(i =>
                  <IntentRow key={i.id} intent={i} isNew={newIds.current.has(i.id)} />
                )}
          </div>
        </div>

        <div style={{ ...col, borderLeft:'none', borderRight:'none' }}>
          <div style={colHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <FileText size={12} style={{ color:'#2563EB' }}/>
              <span style={colTitle}>Claim Requests</span>
            </div>
            <span style={colCount}>{data?.claims.length??0}</span>
          </div>
          <div style={colBody}>
            {!data?.claims.length
              ? <div style={emptyState}>no claim requests</div>
              : data.claims.map(c =>
                  <ClaimRow key={c.id} claim={c} isNew={newIds.current.has(c.id)} />
                )}
          </div>
        </div>

        <div style={col}>
          <div style={colHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <CheckCircle2 size={12} style={{ color:'#00ff87' }}/>
              <span style={colTitle}>Proofs of Payment</span>
            </div>
            <span style={colCount}>{data?.proofs.length??0}</span>
          </div>
          <div style={colBody}>
            {!data?.proofs.length
              ? <div style={emptyState}>no proofs submitted</div>
              : data.proofs.map(p =>
                  <ProofRow key={p.intent_id} proof={p}
                    isNew={newIds.current.has(p.intent_id+'_proof')} />
                )}
          </div>
        </div>
      </div>

      {/* Work queue */}
      <div style={{ background:'#030303', position:'relative', zIndex:1 }}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid #111',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'#080808' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Radio size={12} style={{ color:'#fbbf24' }} />
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em',
              color:'#444', textTransform:'uppercase' }}>Cranker Work Queue</span>
            <span style={{ fontSize:11, color:'#555' }}>-- open settlement opportunities</span>
          </div>
          <span style={{ color:'#fbbf24', fontSize:11, fontWeight:600 }}>
            {data?.work.length??0} available
          </span>
        </div>
        {!data?.work.length
          ? <div style={{ padding:'28px 20px', textAlign:'center', color:'#1e1e1e', fontSize:12 }}>
              no pending work -- all intents settled or awaiting claims
            </div>
          : data.work.map(w =>
              <WorkRow key={w.intent.id} item={w}
                isNew={newIds.current.has(w.intent.id+'_work')} />
            )}
      </div>

      {/* Footer */}
      <div style={{ padding:'10px 24px', display:'flex', alignItems:'center',
        justifyContent:'space-between', borderTop:'1px solid #0d0d0d',
        background:'#000', position:'relative', zIndex:1 }}>
        <span style={{ color:'#1e1e1e', fontSize:10, letterSpacing:'0.1em' }}>
          TSN MEMPOOL EXPLORER v1.0 -- polling every 4s
        </span>
        {data?.fetched_at && (
          <span style={{ color:'#1e1e1e', fontSize:10 }}>
            last update: {new Date(data.fetched_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
