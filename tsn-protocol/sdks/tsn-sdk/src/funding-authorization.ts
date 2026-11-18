import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { assertSenderFundingBlockhashContext, type CreateIntentRequest, type SenderFundingBlockhashContext } from "./contracts.js";
import { parsePaymentIntentMessage } from "./canonical-message.js";
import { assertFundingNoteV1 } from "./gpru/funding-note.js";
import { assertSignedTcapGpruWalletDepositTransaction, GPRU_TCAP_PROGRAM_ID, type TcapGpruDepositAccounts } from "./tcap-gpru-credit.js";

export type TsnFundingReadiness = {
  workId: string;
  stateVersion: number;
  authorizationPayloadCommitment: string;
  expiresAt: string;
  amountBaseUnits: string;
  depositAccounts: Record<keyof TcapGpruDepositAccounts, string>;
};

export type TsnFundingStatus = {
  operationId: string;
  status: string;
  stateVersion: number;
  fundingPhase: "AUTHORIZATION" | "SIGNED_DEPOSIT";
  fundingReady: boolean;
  fundingReadiness?: { expiresAt: string; authorizationPayloadCommitment: string } | null;
};

export type CompleteTsnFundingRequest = {
  workId: string;
  senderPubkey: string;
  authorizationSignature: string;
  expectedStateVersion: number;
  authorizationPayloadCommitment: string;
  senderFundingDepositTxB64: string;
  senderFundingBlockhashContext: SenderFundingBlockhashContext;
};

/** Validate owner-authenticated Node preparation against the unchanged signed authorization. */
export function assertTsnFundingReadiness(value: unknown, request: CreateIntentRequest, workId: string, tcapProgramId = GPRU_TCAP_PROGRAM_ID): TsnFundingReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TSN_FUNDING_READINESS_INVALID");
  const ready = value as TsnFundingReadiness;
  const signed = parsePaymentIntentMessage(request.senderAuthorizationMessage);
  const note = assertFundingNoteV1(request.fundingNote);
  if (ready.workId !== workId || !Number.isSafeInteger(ready.stateVersion) || ready.stateVersion < 1
      || typeof ready.authorizationPayloadCommitment !== "string" || !/^[0-9a-f]{64}$/.test(ready.authorizationPayloadCommitment)
      || typeof ready.expiresAt !== "string" || !Number.isFinite(Date.parse(ready.expiresAt)) || Date.parse(ready.expiresAt) <= Date.now()
      || Date.parse(ready.expiresAt) > signed.expires.getTime()
      || ready.amountBaseUnits !== signed.amountBaseUnits.toString() || signed.fundingNoteCommitment !== note.commitment
      || signed.recipientTin !== request.recipientTin || signed.tokenMintAddress !== request.tokenMintAddress) {
    throw new Error("TSN_FUNDING_READINESS_DIFFERS_FROM_AUTHORIZATION");
  }
  const names: readonly (keyof TcapGpruDepositAccounts)[] = ["depositor", "tcapProgramId", "config", "assetEntry", "reserveState", "source", "vault", "mint", "tokenProgram", "fundingRootAccount"];
  if (!ready.depositAccounts || Object.keys(ready.depositAccounts).length !== names.length) throw new Error("TSN_FUNDING_ACCOUNTS_INVALID");
  const accounts = Object.fromEntries(names.map(name => {
    const text = ready.depositAccounts[name];
    try { const key = new PublicKey(text); if (typeof text !== "string" || key.toBase58() !== text || key.equals(PublicKey.default)) throw new Error(); return [name, key]; }
    catch { throw new Error("TSN_FUNDING_ACCOUNTS_INVALID"); }
  })) as TcapGpruDepositAccounts;
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("tcap:global-config:v1")], accounts.tcapProgramId);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-registry:v1")], accounts.tcapProgramId);
  const [assetEntry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), accounts.tokenProgram.toBuffer(), accounts.mint.toBuffer()], accounts.tcapProgramId);
  const [fundingRoot] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], accounts.tcapProgramId);
  if (!accounts.depositor.equals(new PublicKey(request.senderWallet)) || !accounts.mint.equals(new PublicKey(request.tokenMintAddress))
      || !accounts.tcapProgramId.equals(tcapProgramId) || !accounts.config.equals(config)
      || !accounts.assetEntry.equals(assetEntry) || !accounts.fundingRootAccount.equals(fundingRoot)) {
    throw new Error("TSN_FUNDING_ACCOUNTS_DIFFERS_FROM_AUTHORIZATION");
  }
  return { workId, stateVersion: ready.stateVersion, authorizationPayloadCommitment: ready.authorizationPayloadCommitment,
    expiresAt: ready.expiresAt, amountBaseUnits: ready.amountBaseUnits, depositAccounts: { ...ready.depositAccounts } };
}

/** Attach one exact wallet-approved deposit to its original ready work; never creates an intent. */
export function buildCompleteTsnFundingRequest(params: {
  request: CreateIntentRequest;
  readiness: TsnFundingReadiness;
  workId: string;
  senderFundingDepositTxB64: string;
  senderFundingBlockhashContext: SenderFundingBlockhashContext;
  tcapProgramId?: PublicKey;
}): CompleteTsnFundingRequest {
  const readiness = assertTsnFundingReadiness(params.readiness, params.request, params.workId, params.tcapProgramId);
  const context = assertSenderFundingBlockhashContext(params.senderFundingBlockhashContext);
  const encoded = params.senderFundingDepositTxB64;
  if (typeof encoded !== "string" || !encoded || encoded.length > 5464
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
      || Buffer.from(encoded, "base64").toString("base64") !== encoded) throw new Error("TCAP_SIGNED_DEPOSIT_WIRE_INVALID");
  const accounts = Object.fromEntries(Object.entries(readiness.depositAccounts).map(([name, value]) => [name, new PublicKey(value)])) as TcapGpruDepositAccounts;
  assertSignedTcapGpruWalletDepositTransaction(Buffer.from(encoded, "base64"), {
    accounts, amountBaseUnits: BigInt(readiness.amountBaseUnits), fundingNoteCommitment: params.request.fundingNote.commitment,
  }, context);
  return { workId: params.workId, senderPubkey: params.request.senderWallet, authorizationSignature: params.request.senderAuthorizationSignature,
    expectedStateVersion: readiness.stateVersion, authorizationPayloadCommitment: readiness.authorizationPayloadCommitment,
    senderFundingDepositTxB64: encoded, senderFundingBlockhashContext: context };
}

/** Wait for Receiver-verified readiness; aborting never signs or submits funding. */
export async function waitForTsnFundingReadiness(params: {
  workId: string;
  getStatus: () => Promise<TsnFundingStatus>;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<TsnFundingStatus> {
  const interval = params.pollIntervalMs ?? 1000;
  const timeout = params.timeoutMs ?? 5 * 60_000;
  if (!Number.isSafeInteger(interval) || interval < 1 || !Number.isSafeInteger(timeout) || timeout < 1) throw new Error("TSN_FUNDING_POLL_OPTIONS_INVALID");
  const deadline = Date.now() + timeout;
  const pause = () => new Promise<void>((resolve, reject) => {
    const finish = () => { params.signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, Math.max(1, Math.min(interval, deadline - Date.now())));
    const abort = () => { clearTimeout(timer); params.signal?.removeEventListener("abort", abort); reject(params.signal?.reason ?? new Error("TSN_FUNDING_WAIT_ABORTED")); };
    params.signal?.addEventListener("abort", abort, { once: true });
    if (params.signal?.aborted) abort();
  });
  while (true) {
    params.signal?.throwIfAborted();
    let status: TsnFundingStatus;
    try { status = await params.getStatus(); }
    catch {
      params.signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new Error("TSN_FUNDING_AUTHORIZATION_WAIT_EXPIRED");
      await pause();
      continue;
    }
    params.signal?.throwIfAborted();
    if (status.operationId !== params.workId) throw new Error("TSN_FUNDING_STATUS_OPERATION_MISMATCH");
    if (status.status === "FUNDING_READY" && status.fundingReady === true && status.fundingPhase === "AUTHORIZATION"
        && Number.isSafeInteger(status.stateVersion) && status.stateVersion >= 1
        && /^[0-9a-f]{64}$/.test(status.fundingReadiness?.authorizationPayloadCommitment ?? "")
        && Date.parse(status.fundingReadiness?.expiresAt ?? "") > Date.now()) return status;
    if (["REJECTED", "FAILED", "CONFIRMED"].includes(status.status) || status.fundingPhase === "SIGNED_DEPOSIT") throw new Error(`TSN_FUNDING_AUTHORIZATION_ENDED:${status.status}`);
    if (Date.now() >= deadline) throw new Error("TSN_FUNDING_AUTHORIZATION_WAIT_EXPIRED");
    await pause();
  }
}
