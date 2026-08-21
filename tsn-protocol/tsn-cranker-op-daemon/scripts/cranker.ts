import "dotenv/config";
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getTsnSettlementDnaPda, tsnExecutePrivatePayoutOnChain } from "../../tsn-sdk/src/worker/private-settlement";
import { tsnSubmitEpochFundingTransaction, tsnFetchMotherEscrowOnChain, getTsnCrankerPda } from "../../tsn-sdk/src/blockchain/solana-tsn";
import { resolveSolanaRpcUrl } from "../../tsn-sdk/src/rpc";

type Work = {
  id: string; kind: "AUTHORIZED_FUNDING" | "SETTLEMENT"; stateVersion: number; status: string;
  verification?: { verifiedPayload?: Record<string, unknown> } | null;
  authorization?: Record<string, unknown> | null;
};

const receiver = () => (process.env.TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
const operator = () => {
  const path = resolve(process.env.TSN_CRANKER_KEYPAIR_PATH || process.env.KEYPAIR_PATH || "./cranker-keypair.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
};
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest();
const hex32 = (value: unknown, field: string) => { const bytes = Buffer.from(String(value ?? ""), "hex"); if (bytes.length !== 32) throw new Error(`${field} must be 32 bytes`); return Uint8Array.from(bytes); };

async function receiverRequest<T>(signer: Keypair, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<T> {
  const bodyText = JSON.stringify(body);
  const publicKey = signer.publicKey.toBase58();
  const challenge = await fetch(`${receiver()}/api/cranker/auth/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicKey }) });
  if (!challenge.ok) throw new Error(`Receiver challenge failed (${challenge.status})`);
  const data = await challenge.json() as { nonce?: string };
  if (!data.nonce) throw new Error("Receiver challenge is malformed");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(bodyText).digest("hex");
  const message = `TSN_RECEIVER_CRANKER_V1|${method}|/api/cranker/work|${timestamp}|${data.nonce}|${digest}`;
  const signature = Buffer.from(nacl.sign.detached(Buffer.from(message), signer.secretKey)).toString("base64");
  const response = await fetch(`${receiver()}/api/cranker/work`, { method, headers: { "content-type": "application/json", "x-cranker-public-key": publicKey, "x-cranker-challenge": data.nonce, "x-cranker-timestamp": timestamp, "x-cranker-signature": signature }, body: bodyText });
  if (!response.ok) throw new Error(`Receiver work request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return await response.json() as T;
}

async function lease(signer: Keypair): Promise<Work | null> {
  const response = await receiverRequest<{ work: Work | null }>(signer, "POST", { supportedKinds: ["AUTHORIZED_FUNDING", "SETTLEMENT"] });
  return response.work;
}

async function report(signer: Keypair, work: Work, status: "CONFIRMED" | "FAILED", evidence: Record<string, unknown>) {
  await receiverRequest(signer, "PATCH", { id: work.id, owner: signer.publicKey.toBase58(), expectedVersion: work.stateVersion, status, evidence });
}

async function processAuthorizedFunding(signer: Keypair, work: Work, rpcUrl: string) {
  const payload = work.verification?.verifiedPayload;
  const encoded = payload?.senderSignedFundingTransaction;
  if (typeof encoded !== "string" || !encoded) throw new Error("Node did not provide the sender-authorized epoch funding transaction");
  const result = await tsnSubmitEpochFundingTransaction({ operator: signer, signedTransactionBase64: encoded, rpcUrl });
  await report(signer, work, "CONFIRMED", { signature: result.signature, stage: "EPOCH_TREASURY_FUNDED", reason: "Authorized funding uses only the epoch treasury; no payment account was created." });
}

async function processSettlement(signer: Keypair, work: Work, rpcUrl: string) {
  const auth = work.authorization;
  if (!auth || auth.kind !== "TSN_PAYOUT_AUTHORIZATION") throw new Error("Settlement has no Node payout authorization");
  const expiresAtTs = BigInt(String(auth.expiresAtTs));
  if (expiresAtTs <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Payout authorization expired");
  const leaseId = String(auth.leaseId ?? work.id);
  const claimSlot = hex32(auth.claimSlot, "claimSlot");
  const expectedDna = getTsnSettlementDnaPda(claimSlot).toBase58();
  if (String(auth.settlementDna ?? "") !== expectedDna) throw new Error("Settlement DNA does not match the opaque slot");
  const result = await tsnExecutePrivatePayoutOnChain({
    operator: signer,
    permitSigner: new PublicKey(String(auth.authorizationSigner)),
    permitSignature: Uint8Array.from(Buffer.from(String(auth.authorizationSignatureBase64), "base64")),
    epochTreasury: new PublicKey(String(auth.epochTreasury)), epochLedger: new PublicKey(String(auth.epochLedger)),
    claimSlot, settlementCommitment: hex32(auth.settlementCommitment, "settlementCommitment"),
    randomNonce: hex32(auth.randomNonce, "randomNonce"), payoutNullifier: hex32(auth.payoutNullifier, "payoutNullifier"), commitmentDigest: hex32(auth.commitmentDigest, "commitmentDigest"),
    tokenMint: new PublicKey(String(auth.tokenMintAddress)), recipientWallet: new PublicKey(String(auth.recipientWallet)),
    payoutAmount: BigInt(String(auth.payoutAmountBaseUnits)), claimFeeAmount: BigInt(String(auth.claimFeeAmountBaseUnits ?? "0")),
    leaseIdHash: hash(leaseId), leaseVersion: BigInt(String(auth.leaseVersion ?? 0)), leaseExpiryTs: BigInt(String(Date.parse(String(auth.leaseExpiresAt)) / 1000)), expiresAtTs, rpcUrl,
  });
  await report(signer, work, "CONFIRMED", { signature: result.signature, stage: "SETTLEMENT_SETTLED", claimSlot: String(auth.claimSlot) });
}

async function main() {
  const signer = operator();
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const mother = await tsnFetchMotherEscrowOnChain(rpcUrl);
  if (!mother || !mother.valid) throw new Error("Mother Escrow is not initialized for this RPC");
  const cranker = getTsnCrankerPda({ motherEscrow: new PublicKey(mother.address), operator: signer.publicKey });
  console.log(`[tsn-cranker] operator=${signer.publicKey.toBase58()} cranker=${cranker.toBase58()} receiver=${receiver()}`);
  for (;;) {
    try {
      const work = await lease(signer);
      if (!work) { await new Promise((resolve) => setTimeout(resolve, Number(process.env.TSN_CRANKER_POLL_MS ?? 2000))); continue; }
      try { if (work.kind === "AUTHORIZED_FUNDING") await processAuthorizedFunding(signer, work, rpcUrl); else await processSettlement(signer, work, rpcUrl); }
      catch (error) { await report(signer, work, "FAILED", { reason: error instanceof Error ? error.message : String(error) }).catch(() => undefined); console.error(error); }
    } catch (error) { console.error(`[tsn-cranker] poll failed: ${error instanceof Error ? error.message : String(error)}`); await new Promise((resolve) => setTimeout(resolve, 3000)); }
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
