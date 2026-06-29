import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

// ── Point this to your self-hosted backend ───────────────────────────────────
// Set MEMPOOL_API_URL in .env.local, e.g.:
//   MEMPOOL_API_URL=http://localhost:8000

const BASE = (process.env.MEMPOOL_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const API_KEY = process.env.MEMPOOL_API_KEY;

function opaqueId(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  return createHash('sha256').update(`tsn-public:${value}`).digest('hex').slice(0, 16);
}

function redactIntent(intent: any) {
  if (!intent || typeof intent !== 'object') return intent;
  return {
    ...intent,
    id: opaqueId(intent.id),
    paymentId: opaqueId(intent.paymentId),
    recipientHash: null,
    assignedCrankerPubkey: null,
    escrowTxSig: null,
    claimTxSig: null,
    proofTxSig: null,
  };
}

async function fetchGET(path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      next: { revalidate: 3 },
      headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function redactClaim(claim: any) {
  if (!claim || typeof claim !== 'object') return claim;
  return {
    ...claim,
    id: opaqueId(claim.id),
    paymentId: opaqueId(claim.paymentId),
    intentId: opaqueId(claim.intentId),
    recipientHash: null,
    assignedCrankerPubkey: null,
    destinationWallet: null,
    destinationRoute: 'private',
  };
}

function redactWorkItem(work: any) {
  if (!work || typeof work !== 'object') return work;
  return {
    ...work,
    intent: redactIntent(work.intent),
    claimRequest: redactClaim(work.claimRequest),
  };
}

function redactProof(proof: any) {
  if (!proof || typeof proof !== 'object') return proof;
  return {
    ...proof,
    intent_id: opaqueId(proof.intent_id),
    proof_tx: null,
    cranker_pubkey: null,
    crankerRoute: 'private',
  };
}

function redactTinOperation(operation: any) {
  if (!operation || typeof operation !== 'object') return operation;
  return {
    intentId: opaqueId(operation.intentId),
    intentType: operation.intentType,
    tinHash: operation.tinHash ?? opaqueId(operation.tin),
    ownerPubkey: opaqueId(operation.ownerPubkey),
    ownerIntentHash: operation.ownerIntentHash,
    nonce: operation.nonce,
    expiry: operation.expiry,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    status: operation.status,
    verifierCranker: opaqueId(operation.verifierCranker),
    submitterCranker: opaqueId(operation.submitterCranker),
    feeMetadata: operation.feeMetadata
      ? {
          feeMint: operation.feeMetadata.feeMint,
          grossAmount: operation.feeMetadata.grossAmount,
          verifierAmount: operation.feeMetadata.verifierAmount,
          submitterAmount: operation.feeMetadata.submitterAmount,
          teamAmount: operation.feeMetadata.teamAmount,
          reservePoolAmount: operation.feeMetadata.reservePoolAmount,
          feeCommitmentHash: operation.feeMetadata.feeCommitmentHash,
          status: operation.feeMetadata.status,
        }
      : null,
    failureReason: operation.failureReason,
    onchainSignatures: Array.isArray(operation.onchainSignatures)
      ? operation.onchainSignatures.map((signature: string) => opaqueId(signature))
      : [],
    displayName: operation.displayName,
    encryptedMetadataHash: operation.encryptedMetadataHash,
    pruConfigurationHash: operation.pruConfigurationHash,
  };
}

export async function GET() {
  const [epoch, intents, claims, proofs, work, metrics, network, tinOperations] = await Promise.all([
    fetchGET('/epoch/status'),
    fetchGET('/intents'),
    fetchGET('/claim-requests'),
    fetchGET('/proofs'),
    fetchGET('/work'),
    fetchGET('/metrics'),
    fetchGET('/network/overview'),
    fetchGET('/tin-operations'),
  ]);

  return NextResponse.json({
    epoch:      epoch  ?? null,
    intents:    Array.isArray(intents) ? intents.map(redactIntent) : [],
    claims:     Array.isArray(claims)  ? claims.map(redactClaim) : [],
    proofs:     Array.isArray(proofs)  ? proofs.map(redactProof) : [],
    work:       Array.isArray(work)    ? work.map(redactWorkItem) : [],
    metrics:    metrics ?? null,
    network:    network ?? null,
    tinOperations: Array.isArray(tinOperations) ? tinOperations.map(redactTinOperation) : [],
    fetched_at: new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
    },
  });
}
