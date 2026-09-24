import "dotenv/config";
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { CreditcoinCranker } from "../../tsn-crosschain/src/creditcoin-cranker.js";
import {
  getTsnSettlementDnaPda,
  tsnExecutePrivatePayoutOnChain,
} from "../../../sdks/tsn-sdk/legacy/private-settlement";
import {
  tsnSubmitEpochFundingTransaction,
  tsnFetchMotherEscrowOnChain,
  getTsnCrankerPda,
} from "../../../sdks/tsn-sdk/src/blockchain/solana-tsn";
import { resolveSolanaRpcUrl } from "../../../sdks/tsn-sdk/src/rpc";
import {
  getTinsIdentityPda,
  getTinsGlobalStatePda,
  decodeTinAccount,
  serializeTinCreationRegistryParams,
  serializeTinV1CreationParams,
} from "../../../sdks/tsn-sdk/src/tins";

type Work = {
  id: string;
  kind: "AUTHORIZED_FUNDING" | "SETTLEMENT" | "TIN_OPERATION";
  stateVersion: number;
  status: string;
  verification?: { verifiedPayload?: Record<string, unknown> } | null;
  authorization?: Record<string, unknown> | null;
};

const creditcoinCranker = () => {
  const keypairFile = process.env.CREDITCOIN_CRANKER_KEYPAIR_FILE?.trim();
  const privateKey = keypairFile
    ? (
        JSON.parse(readFileSync(resolve(keypairFile), "utf8")) as {
          privateKey?: string;
        }
      ).privateKey?.trim()
    : undefined;
  const rpcUrl = process.env.CREDITCOIN_RPC_URL?.trim();
  const hub = process.env.CREDITCOIN_SETTLEMENT_HUB?.trim();
  const registry = process.env.CREDITCOIN_LIQUIDITY_REGISTRY?.trim();
  const routeId = process.env.CREDITCOIN_ROUTE_ID?.trim();
  if (!privateKey || !rpcUrl || !hub || !registry || !routeId) {
    throw new Error(
      "Creditcoin Cranker requires CREDITCOIN_RPC_URL, CREDITCOIN_CRANKER_KEYPAIR_FILE, CREDITCOIN_SETTLEMENT_HUB, CREDITCOIN_LIQUIDITY_REGISTRY, and CREDITCOIN_ROUTE_ID",
    );
  }
  return new CreditcoinCranker({
    rpcUrl,
    hub: hub as `0x${string}`,
    signerPrivateKey: privateKey,
    route: {
      rpcUrl,
      registry: registry as `0x${string}`,
      routeId: routeId as `0x${string}`,
    },
  });
};

const receiver = () =>
  (
    process.env.TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app"
  ).replace(/\/$/, "");
const operator = () => {
  const path = resolve(
    process.env.TSN_CRANKER_KEYPAIR_PATH ||
      process.env.KEYPAIR_PATH ||
      "./keys/cranker-keypair.json",
  );
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
};
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();
const hex32 = (value: unknown, field: string) => {
  const bytes = Buffer.from(String(value ?? ""), "hex");
  if (bytes.length !== 32) throw new Error(`${field} must be 32 bytes`);
  return Uint8Array.from(bytes);
};

async function receiverRequest<T>(
  signer: Keypair,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<T> {
  const bodyText = JSON.stringify(body);
  const publicKey = signer.publicKey.toBase58();
  let challenge: Response;
  try {
    challenge = await fetch(`${receiver()}/api/cranker/auth/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });
  } catch (error) {
    throw new Error(
      `Receiver challenge request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!challenge.ok) {
    const detail = (await challenge.text()).slice(0, 300);
    throw new Error(
      `Receiver challenge failed (${challenge.status}): ${detail}`,
    );
  }
  const data = (await challenge.json()) as { nonce?: string };
  if (!data.nonce) throw new Error("Receiver challenge is malformed");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(bodyText).digest("hex");
  const message = `TSN_RECEIVER_CRANKER_V1|${method}|/api/cranker/work|${timestamp}|${data.nonce}|${digest}`;
  const signature = Buffer.from(
    nacl.sign.detached(Buffer.from(message), signer.secretKey),
  ).toString("base64");
  const response = await fetch(`${receiver()}/api/cranker/work`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-cranker-public-key": publicKey,
      "x-cranker-challenge": data.nonce,
      "x-cranker-timestamp": timestamp,
      "x-cranker-signature": signature,
    },
    body: bodyText,
  });
  if (!response.ok)
    throw new Error(
      `Receiver work request failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  return (await response.json()) as T;
}

async function lease(signer: Keypair): Promise<Work | null> {
  const response = await receiverRequest<{ work: Work | null }>(
    signer,
    "POST",
    { supportedKinds: ["AUTHORIZED_FUNDING", "SETTLEMENT", "TIN_OPERATION"] },
  );
  return response.work;
}

async function report(
  signer: Keypair,
  work: Work,
  status: "CONFIRMED" | "FAILED",
  evidence: Record<string, unknown>,
) {
  await receiverRequest(signer, "PATCH", {
    id: work.id,
    owner: signer.publicKey.toBase58(),
    expectedVersion: work.stateVersion,
    status,
    evidence,
  });
}

async function processAuthorizedFunding(
  signer: Keypair,
  work: Work,
  rpcUrl: string,
) {
  const payload = work.verification?.verifiedPayload;
  const encoded = payload?.senderSignedFundingTransaction;
  if (typeof encoded !== "string" || !encoded)
    throw new Error(
      "Node did not provide the sender-authorized epoch funding transaction",
    );
  const result = await tsnSubmitEpochFundingTransaction({
    operator: signer,
    signedTransactionBase64: encoded,
    rpcUrl,
  });
  await report(signer, work, "CONFIRMED", {
    signature: result.signature,
    stage: "EPOCH_TREASURY_FUNDED",
    reason:
      "Authorized funding uses only the epoch treasury; no payment account was created.",
  });
}

async function processSettlement(signer: Keypair, work: Work, rpcUrl: string) {
  const auth = work.authorization;
  if (auth?.kind === "TSN_CREDITCOIN_PAYOUT_AUTHORIZATION") {
    const authorization = auth.authorization;
    const signature = auth.signature ?? auth.authorizationSignature;
    if (
      !authorization ||
      typeof authorization !== "object" ||
      typeof signature !== "string"
    ) {
      throw new Error(
        "Creditcoin settlement work is missing authorization or signature",
      );
    }
    const result = await creditcoinCranker().submit(
      authorization as never,
      signature,
    );
    await report(signer, work, "CONFIRMED", {
      stage: "CREDITCOIN_SETTLEMENT_SUBMITTED",
      creditcoinTxHash: result.transactionHash,
      attestcoinMessageId: result.messageId,
    });
    return;
  }
  if (!auth || auth.kind !== "TSN_PAYOUT_AUTHORIZATION")
    throw new Error("Settlement has no Node payout authorization");
  const expiresAtTs = BigInt(String(auth.expiresAtTs));
  if (expiresAtTs <= BigInt(Math.floor(Date.now() / 1000)))
    throw new Error("Payout authorization expired");
  const leaseId = String(auth.leaseId ?? work.id);
  const claimSlot = hex32(auth.claimSlot, "claimSlot");
  const expectedDna = getTsnSettlementDnaPda(claimSlot).toBase58();
  if (String(auth.settlementDna ?? "") !== expectedDna)
    throw new Error("Settlement DNA does not match the opaque slot");
  const result = await tsnExecutePrivatePayoutOnChain({
    operator: signer,
    permitSigner: new PublicKey(String(auth.authorizationSigner)),
    permitSignature: Uint8Array.from(
      Buffer.from(String(auth.authorizationSignatureBase64), "base64"),
    ),
    epochTreasury: new PublicKey(String(auth.epochTreasury)),
    epochLedger: new PublicKey(String(auth.epochLedger)),
    claimSlot,
    settlementCommitment: hex32(
      auth.settlementCommitment,
      "settlementCommitment",
    ),
    randomNonce: hex32(auth.randomNonce, "randomNonce"),
    payoutNullifier: hex32(auth.payoutNullifier, "payoutNullifier"),
    commitmentDigest: hex32(auth.commitmentDigest, "commitmentDigest"),
    tokenMint: new PublicKey(String(auth.tokenMintAddress)),
    recipientWallet: new PublicKey(String(auth.recipientWallet)),
    payoutAmount: BigInt(String(auth.payoutAmountBaseUnits)),
    claimFeeAmount: BigInt(String(auth.claimFeeAmountBaseUnits ?? "0")),
    leaseIdHash: hash(leaseId),
    leaseVersion: BigInt(String(auth.leaseVersion ?? 0)),
    leaseExpiryTs: BigInt(
      String(Date.parse(String(auth.leaseExpiresAt)) / 1000),
    ),
    expiresAtTs,
    rpcUrl,
  });
  await report(signer, work, "CONFIRMED", {
    signature: result.signature,
    stage: "SETTLEMENT_SETTLED",
    claimSlot: String(auth.claimSlot),
  });
}

function base64Bytes(value: unknown, field: string) {
  if (typeof value !== "string" || !value)
    throw new Error(`TIN operation is missing ${field}`);
  return Buffer.from(value, "base64");
}

async function processTinOperation(
  signer: Keypair,
  work: Work,
  rpcUrl: string,
) {
  const payload = work.verification?.verifiedPayload;
  if (!payload || payload.intentType !== "tin_creation") {
    throw new Error(
      "Only verified tin_creation operations are executable by the Cranker",
    );
  }
  const programId = new PublicKey(
    process.env.TINS_PROGRAM_ID ||
      "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
  );
  const owner = new PublicKey(String(payload.ownerPubkey));
  const programAssigned = Boolean(payload.programAssigned);
  const lookupCommitment = programAssigned
    ? Buffer.alloc(32)
    : hex32(payload.lookupCommitment, "lookupCommitment");
  const registry = programAssigned
    ? getTinsIdentityPda({ walletPubkey: owner, programId })
    : PublicKey.findProgramAddressSync(
        [Buffer.from("tin-v1"), lookupCommitment],
        programId,
      )[0];
  const instructionData = programAssigned
    ? serializeTinCreationRegistryParams({
        ownerPubkey: owner,
        displayName: String(payload.displayName),
        encryptedMasterSeed: base64Bytes(
          payload.encryptedMasterSeed,
          "encryptedMasterSeed",
        ),
        encryptedMetadataHash: hex32(
          payload.encryptedMetadataHash,
          "encryptedMetadataHash",
        ),
        pruConfigurationHash: new Uint8Array(32),
        encryptedPublicRouteEnvelope: new Uint8Array(0),
        routeVersion: BigInt(String(payload.routeVersion)),
        routeNonce: hex32(payload.routeNonce, "routeNonce"),
        tcapRouteVersion: 1,
        tcapRelationshipCommitment: hex32(
          payload.tcapRelationshipCommitment,
          "tcapRelationshipCommitment",
        ),
        tcapRelationshipReference: hex32(
          payload.tcapRelationshipReference,
          "tcapRelationshipReference",
        ),
        tcapPolicyCommitment: hex32(
          payload.tcapPolicyCommitment,
          "tcapPolicyCommitment",
        ),
        nonce: hex32(payload.nonce, "nonce"),
        intentHash: hex32(payload.ownerIntentHash, "ownerIntentHash"),
        expiryTs: BigInt(String(payload.expiry)),
      })
    : serializeTinV1CreationParams({
        ownerPubkey: owner,
        lookupCommitment,
        encryptedIdentityEnvelope: base64Bytes(
          payload.encryptedIdentityEnvelope,
          "encryptedIdentityEnvelope",
        ),
        encryptedMasterSeed: base64Bytes(
          payload.encryptedMasterSeed,
          "encryptedMasterSeed",
        ),
        encryptedMetadataHash: hex32(
          payload.encryptedMetadataHash,
          "encryptedMetadataHash",
        ),
        pruConfigurationHash: hex32(
          payload.pruConfigurationHash,
          "pruConfigurationHash",
        ),
        encryptedPublicRouteEnvelope: base64Bytes(
          payload.encryptedPublicRouteEnvelope,
          "encryptedPublicRouteEnvelope",
        ),
        routeVersion: BigInt(String(payload.routeVersion)),
        routeNonce: hex32(payload.routeNonce, "routeNonce"),
        tcapRouteVersion: Number(
          payload.tcapRouteVersion ?? (programAssigned ? 1 : 0),
        ),
        tcapRelationshipCommitment: programAssigned
          ? hex32(
              payload.tcapRelationshipCommitment,
              "tcapRelationshipCommitment",
            )
          : new Uint8Array(32),
        tcapRelationshipReference: programAssigned
          ? hex32(
              payload.tcapRelationshipReference,
              "tcapRelationshipReference",
            )
          : new Uint8Array(32),
        tcapPolicyCommitment: programAssigned
          ? hex32(payload.tcapPolicyCommitment, "tcapPolicyCommitment")
          : new Uint8Array(32),
        intentHash: hex32(payload.ownerIntentHash, "ownerIntentHash"),
        expiryTs: BigInt(String(payload.expiry)),
      });
  const connection = new Connection(rpcUrl, "confirmed");
  const ownerSignature = base64Bytes(payload.ownerSignature, "ownerSignature");
  const ownerProof = Ed25519Program.createInstructionWithPublicKey({
    publicKey: owner.toBytes(),
    message: Buffer.from(hex32(payload.ownerIntentHash, "ownerIntentHash")),
    signature: ownerSignature,
  });
  const tinInstruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: getTinsGlobalStatePda(programId),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: registry, isSigner: false, isWritable: true },
      {
        pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(instructionData),
  });
  const tx = new Transaction().add(ownerProof, tinInstruction);
  const signature = await connection.sendTransaction(tx, [signer], {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, "confirmed");
  let createdTin: string | undefined;
  if (programAssigned) {
    const createdAccount = await connection.getAccountInfo(
      registry,
      "confirmed",
    );
    if (!createdAccount)
      throw new Error(
        "CreateTin confirmed but the identity account was not found",
      );
    createdTin = decodeTinAccount(createdAccount.data).tin.toString();
  }
  await report(signer, work, "CONFIRMED", {
    stage: programAssigned ? "TIN_CREATED" : "TIN_V1_REGISTRY_SUBMITTED",
    signature,
    registry: registry.toBase58(),
    ...(programAssigned && createdTin ? { tin: createdTin } : {}),
  });
}

async function main() {
  const signer = operator();
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const mother = await tsnFetchMotherEscrowOnChain(rpcUrl);
  if (!mother || !mother.valid)
    throw new Error("Mother Escrow is not initialized for this RPC");
  const cranker = getTsnCrankerPda({
    motherEscrow: new PublicKey(mother.address),
    operator: signer.publicKey,
  });
  console.log(
    `[tsn-cranker] operator=${signer.publicKey.toBase58()} cranker=${cranker.toBase58()} receiver=${receiver()}`,
  );
  for (;;) {
    try {
      const work = await lease(signer);
      if (!work) {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.TSN_CRANKER_POLL_MS ?? 2000)),
        );
        continue;
      }
      try {
        if (work.kind === "AUTHORIZED_FUNDING")
          await processAuthorizedFunding(signer, work, rpcUrl);
        else if (work.kind === "TIN_OPERATION")
          await processTinOperation(signer, work, rpcUrl);
        else await processSettlement(signer, work, rpcUrl);
      } catch (error) {
        await report(signer, work, "FAILED", {
          reason: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        console.error(error);
      }
    } catch (error) {
      console.error(
        `[tsn-cranker] poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
