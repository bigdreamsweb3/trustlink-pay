import { bytesToHex } from "@noble/hashes/utils";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { parseTokenAmountToBaseUnits } from "./canonical-message.js";
import { withTinOwnerDebitOpeningV1, type LoadTinOwnerBalanceV1Params } from "./tin-owner-balance.js";
import { deriveGpruTinDebitCommitmentsV1, buildTinDebitApprovalMessageV1, signTinDebitOpeningV1,
  GPRU_TIN_DEBIT_FIELD_V1 } from "./gpru/tin-debit-opening.js";

export type TinDebitClientV1 = { post(path: string, body: unknown): Promise<unknown> };
export type TinDebitResultV1 = { workId: string; status: string; stateVersion: number };
/** Keep this private in device memory until the original work is reconciled. */
export type TinDebitRetryStateV1 = { intent?: string; requestJson?: string; workId?: string; inFlight?: boolean };
export type SendTinDebitV1Params = LoadTinOwnerBalanceV1Params & {
  recipientTin: string;
  tokenMintAddress: string;
  amount: string;
  debitClient: TinDebitClientV1;
  paymentId: string;
  retryState: TinDebitRetryStateV1;
};

/** Approve a private sender debit and recipient credit with local owner recovery. */
export async function sendTinDebitV1(params: SendTinDebitV1Params): Promise<TinDebitResultV1> {
  if (params.retryState.inFlight) throw new Error("TIN-Debit is already being prepared or submitted.");
  params.retryState.inFlight = true;
  try {
    if (!/^\d{10}$/.test(params.tin) || !/^\d{10}$/.test(params.recipientTin) || params.recipientTin === params.tin) throw new Error("A different ten-digit recipient TIN is required.");
    new PublicKey(params.tokenMintAddress);
    params.signal?.throwIfAborted();
    const paymentId = params.paymentId;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(paymentId)) throw new Error("TIN-Debit payment ID is invalid.");
    const ownerAddress = () => typeof params.ownerWallet.publicKey === "string" ? params.ownerWallet.publicKey : params.ownerWallet.publicKey.toBase58();
    const walletAddress = ownerAddress();
    const intent = JSON.stringify([paymentId, walletAddress, params.tin, params.recipientTin, params.tokenMintAddress, params.amount]);
    if (params.retryState.intent && params.retryState.intent !== intent) throw new Error("TIN-Debit is pending. Check the original payment before changing its details.");
    const submit = async (requestJson: string): Promise<TinDebitResultV1> => {
      if (ownerAddress() !== walletAddress) throw new Error("The connected wallet changed during TIN-Debit approval.");
      params.signal?.throwIfAborted();
      const result = await params.debitClient.post("/network/tin-debit", JSON.parse(requestJson)) as TinDebitResultV1;
      if (!result || result.workId !== paymentId || typeof result.status !== "string" || !Number.isSafeInteger(result.stateVersion)) throw new Error("TIN-Debit submission outcome is unavailable. Check the same payment ID.");
      params.retryState.workId = result.workId;
      return result;
    };
    if (params.retryState.requestJson) return await submit(params.retryState.requestJson);
    const expiresAt = String(Math.floor(Date.now() / 1000) + 240);
    const prepareMessage = new TextEncoder().encode("TSN_TIN_DEBIT_PREPARE_V1\0" + [params.tin, params.recipientTin, params.tokenMintAddress, expiresAt].join("\n"));
    let prepareSignature: Uint8Array;
    try {
      const signed = await params.ownerWallet.signMessage(prepareMessage, "utf8");
      prepareSignature = new Uint8Array(signed instanceof Uint8Array ? signed : signed.signature);
      if (ownerAddress() !== walletAddress || prepareSignature.length !== 64 || !nacl.sign.detached.verify(prepareMessage, prepareSignature, new PublicKey(walletAddress).toBytes())) throw new Error("TIN-Debit preparation requires the connected owner's signature.");
    } finally { prepareMessage.fill(0); }
    const ready = await params.debitClient.post("/network/tin-debit/prepare", {
      senderTin: params.tin, recipientTin: params.recipientTin, tokenMintAddress: params.tokenMintAddress,
      ownerPublicKey: bytesToHex(new PublicKey(walletAddress).toBytes()), signature: bytesToHex(prepareSignature), expiresAt,
    }) as { tokenId: number; decimals: number; senderRouteKeyCommitment: string; recipientRouteKeyCommitment: string;
      oldGlobalRoot: string; tipRouteRoot: string; rootSequence: string; deploymentCommitment: string;
      validAfterSlot: string; expiresAtSlot: string };
    if (!ready || !Number.isSafeInteger(ready.tokenId) || ready.tokenId <= 0) throw new Error("TIN-Debit preparation is invalid.");
    prepareSignature.fill(0);
    const amountBaseUnits = parseTokenAmountToBaseUnits(params.amount, ready.decimals).toString();
    const random = new Uint8Array(32);
    const privateValues: bigint[] = [];
    for (let index = 0; index < 2; index++) {
      let value = 0n;
      while (value === 0n || value >= GPRU_TIN_DEBIT_FIELD_V1) {
        globalThis.crypto.getRandomValues(random);
        random[0] &= 63;
        value = BigInt(`0x${bytesToHex(random)}`);
      }
      privateValues.push(value);
    }
    random.fill(0);
    const nonce = privateValues[0].toString(), amountBlinding = privateValues[1].toString();
    privateValues.fill(0n);
    const bound = deriveGpruTinDebitCommitmentsV1({ ...ready, amountBaseUnits, nonce, amountBlinding });
    params.onProgress?.("Approve the TIN-Debit amount and recipient.");
    const message = buildTinDebitApprovalMessageV1(bound.authorizationCommitment);
    let signature: Uint8Array;
    try {
      const signed = await params.ownerWallet.signMessage(message, "utf8");
      signature = new Uint8Array(signed instanceof Uint8Array ? signed : signed.signature);
      if (ownerAddress() !== walletAddress || signature.length !== 64 || !nacl.sign.detached.verify(message, signature, new PublicKey(walletAddress).toBytes())) throw new Error("TIN-Debit approval signature is invalid.");
    } finally { message.fill(0); }
    const approval = { ownerPublicKey: bytesToHex(new PublicKey(walletAddress).toBytes()), signature: bytesToHex(signature) };
    signature.fill(0);
    params.signal?.throwIfAborted();
    return await withTinOwnerDebitOpeningV1({ ...params, tokenId: ready.tokenId, leg: 0,
      authorizationCommitment: bound.authorizationCommitment, expectedGlobalRoot: ready.oldGlobalRoot,
      tipRouteRoot: ready.tipRouteRoot, expectedRootSequence: ready.rootSequence }, async packet => {
      const currentAddress = typeof params.ownerWallet.publicKey === "string" ? params.ownerWallet.publicKey : params.ownerWallet.publicKey.toBase58();
      if (currentAddress !== walletAddress) throw new Error("The connected wallet changed during TIN-Debit approval.");
      if (BigInt(packet.balance) < BigInt(amountBaseUnits)) throw new Error("Insufficient TIN balance.");
      params.onProgress?.("Approve disclosure of this sender balance opening to TSN Node.");
      const senderOpening = await signTinDebitOpeningV1(packet, params.ownerWallet);
      params.signal?.throwIfAborted();
      const requestJson = JSON.stringify({
        paymentId, senderTin: params.tin, recipientTin: params.recipientTin,
        tokenMintAddress: params.tokenMintAddress, amountBaseUnits, nonce, amountBlinding,
        deploymentCommitment: ready.deploymentCommitment, validAfterSlot: ready.validAfterSlot, expiresAtSlot: ready.expiresAtSlot,
        approval, senderOpening,
      });
      params.retryState.intent = intent;
      params.retryState.requestJson = requestJson;
      senderOpening.balance = "0"; senderOpening.blinding = "0";
      return submit(requestJson);
    });
  } finally { delete params.retryState.inFlight; }
}
