#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import bs58 from "bs58";

const DEFAULT_RPC = "https://tsn-rpc-gateway.vercel.app";
const KNOWN_PROTOCOL_ACCOUNTS = new Set([
  "11111111111111111111111111111111",
  "Sysvar1nstructions1111111111111111111111111",
  "Ed25519SigVerify111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
]);

function usage() {
  console.error(
    "Usage: node scripts/tsn-privacy-linkability.mjs <payment-intent-signature> <settlement-signature> [--rpc URL] [--json]",
  );
  process.exit(2);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function accountKey(value) {
  return typeof value === "string" ? value : value?.pubkey ?? null;
}

function accountKeys(transaction) {
  const message = transaction?.transaction?.message;
  const staticKeys = (message?.accountKeys ?? []).map(accountKey).filter(Boolean);
  const loaded = transaction?.meta?.loadedAddresses ?? {};
  return [...new Set([
    ...staticKeys,
    ...(loaded.writable ?? []),
    ...(loaded.readonly ?? []),
  ])];
}

function instructions(transaction) {
  const keys = accountKeys(transaction);
  return (transaction?.transaction?.message?.instructions ?? []).map((instruction, index) => {
    const programId = instruction.programId ?? keys[instruction.programIdIndex] ?? null;
    let data = null;
    if (typeof instruction.data === "string") {
      try { data = Buffer.from(bs58.decode(instruction.data)); } catch { data = null; }
    }
    return { index, programId, data };
  });
}

async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} failed (${response.status})`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method} failed: ${body.error.message ?? "unknown error"}`);
  return body.result;
}

async function loadTransaction(rpc, signature) {
  const transaction = await rpcCall(rpc, "getTransaction", [signature, {
    commitment: "finalized",
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
  }]);
  if (!transaction) throw new Error(`Transaction not found or not finalized: ${signature}`);
  return transaction;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function discriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest("hex").slice(0, 16);
}

const TSN_DISCRIMINATORS = new Map([
  [discriminator("tsn_execute_private_payout"), "tsn_execute_private_payout"],
  [discriminator("tsn_execute_private_recovery"), "tsn_execute_private_recovery"],
  [discriminator("tsn_submit_payment_intent"), "tsn_submit_payment_intent"],
  [discriminator("tsn_create_payment_intent"), "tsn_create_payment_intent"],
]);

function instructionReport(transaction) {
  return instructions(transaction).map((instruction) => {
    const discriminatorHex = instruction.data?.subarray(0, 8).toString("hex") ?? null;
    return {
      index: instruction.index,
      programId: instruction.programId,
      dataLength: instruction.data?.length ?? 0,
      discriminator: discriminatorHex,
      tsnInstruction: TSN_DISCRIMINATORS.get(discriminatorHex) ?? null,
    };
  });
}

function ed25519Messages(transaction) {
  return instructions(transaction)
    .filter((instruction) => instruction.programId === "Ed25519SigVerify111111111111111111111111111")
    .flatMap((instruction) => {
      const data = instruction.data;
      if (!data || data.length < 16 || data[0] !== 1) return [];
      const signatureOffset = data.readUInt16LE(2);
      const publicKeyOffset = data.readUInt16LE(6);
      const messageOffset = data.readUInt16LE(10);
      const messageLength = data.readUInt16LE(12);
      if (
        signatureOffset + 64 > data.length ||
        publicKeyOffset + 32 > data.length ||
        messageOffset + messageLength > data.length
      ) return [];
      const message = data.subarray(messageOffset, messageOffset + messageLength);
      return [{
        instructionIndex: instruction.index,
        signerPublicKeyBase58: bs58.encode(data.subarray(publicKeyOffset, publicKeyOffset + 32)),
        messageLength,
        messageSha256: sha256(message),
        domain: message.subarray(0, Math.min(message.length, 64)).toString("utf8").replace(/[^\x20-\x7e].*$/, ""),
        signatureSha256: sha256(data.subarray(signatureOffset, signatureOffset + 64)),
      }];
    });
}

function tokenFlows(transaction) {
  const pre = new Map((transaction?.meta?.preTokenBalances ?? []).map((item) => [
    item.accountIndex,
    { mint: item.mint, owner: item.owner ?? null, amount: BigInt(item.uiTokenAmount.amount), decimals: item.uiTokenAmount.decimals },
  ]));
  const post = new Map((transaction?.meta?.postTokenBalances ?? []).map((item) => [
    item.accountIndex,
    { mint: item.mint, owner: item.owner ?? null, amount: BigInt(item.uiTokenAmount.amount), decimals: item.uiTokenAmount.decimals },
  ]));
  const indexes = new Set([...pre.keys(), ...post.keys()]);
  const keys = accountKeys(transaction);
  return [...indexes].flatMap((accountIndex) => {
    const before = pre.get(accountIndex);
    const after = post.get(accountIndex);
    const mint = after?.mint ?? before?.mint ?? null;
    if (!mint) return [];
    const delta = (after?.amount ?? 0n) - (before?.amount ?? 0n);
    if (delta === 0n) return [];
    return [{
      accountIndex,
      account: keys[accountIndex] ?? null,
      owner: after?.owner ?? before?.owner ?? null,
      mint,
      decimals: after?.decimals ?? before?.decimals ?? 0,
      deltaBaseUnits: delta.toString(),
    }];
  });
}

function byteChunks(transaction) {
  const chunks = new Map();
  for (const instruction of instructions(transaction)) {
    if (!instruction.data || instruction.data.length < 32) continue;
    for (let offset = 0; offset <= instruction.data.length - 32; offset += 1) {
      const value = instruction.data.subarray(offset, offset + 32).toString("hex");
      if (/^0+$/.test(value)) continue;
      const current = chunks.get(value) ?? [];
      current.push({ instructionIndex: instruction.index, offset, programId: instruction.programId });
      chunks.set(value, current);
    }
  }
  return chunks;
}

function summarize(transaction, signature) {
  const keys = accountKeys(transaction);
  const feePayer = accountKey(transaction?.transaction?.message?.accountKeys?.[0]);
  return {
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    confirmation: transaction.meta?.status,
    feePayer,
    accountCount: keys.length,
    accounts: keys,
    instructions: instructionReport(transaction),
    ed25519: ed25519Messages(transaction),
    tokenFlows: tokenFlows(transaction),
  };
}

function analyze(payment, settlement) {
  const paymentAccounts = new Set(payment.accounts);
  const sharedAccounts = settlement.accounts.filter((value) => paymentAccounts.has(value));
  const protocolFilteredSharedAccounts = sharedAccounts.filter((value) => !KNOWN_PROTOCOL_ACCOUNTS.has(value));
  const paymentMints = new Set(payment.tokenFlows.map((flow) => flow.mint));
  const settlementMints = settlement.tokenFlows.map((flow) => flow.mint).filter((mint) => paymentMints.has(mint));
  const paymentChunks = byteChunks(payment.raw);
  const settlementChunks = byteChunks(settlement.raw);
  const shared32ByteValues = [];
  for (const [value, paymentLocations] of paymentChunks) {
    const settlementLocations = settlementChunks.get(value);
    if (!settlementLocations) continue;
    shared32ByteValues.push({ value, paymentLocations, settlementLocations });
  }
  const sharedEd25519Messages = [];
  for (const left of payment.ed25519) {
    for (const right of settlement.ed25519) {
      if (left.messageSha256 === right.messageSha256) {
        sharedEd25519Messages.push({ messageSha256: left.messageSha256, payment: left, settlement: right });
      }
    }
  }
  const findings = [];
  if (payment.feePayer === settlement.feePayer) {
    findings.push({ severity: "MEDIUM", code: "SHARED_FEE_PAYER", detail: "The same fee payer appears in both transactions." });
  }
  if (protocolFilteredSharedAccounts.length) {
    findings.push({ severity: "HIGH", code: "SHARED_NON_PROTOCOL_ACCOUNT", detail: "A non-protocol account appears in both transactions; inspect the addresses below for direct linkability." });
  }
  if (sharedEd25519Messages.length) {
    findings.push({ severity: "HIGH", code: "SHARED_ED25519_MESSAGE", detail: "The same signed message appears in both transactions." });
  }
  if (shared32ByteValues.length) {
    findings.push({ severity: "HIGH", code: "SHARED_32_BYTE_VALUE", detail: "An identical 32-byte value appears in both instruction payloads; it may be a commitment, nullifier, or public key." });
  }
  if (settlement.tokenFlows.length) {
    findings.push({ severity: "MEDIUM", code: "PUBLIC_SETTLEMENT_FLOW", detail: "The settlement reveals the token mint, token-account delta, and recipient token account to every Solana observer." });
  }
  findings.push({ severity: "INFO", code: "NO_TIN_IN_PAYOUT_MESSAGE", detail: "The TSN private payout message format does not include a TIN or sender wallet; identity unlinkability depends on not reusing its nullifier/commitment in the funding transaction." });
  return {
    sharedAccounts,
    protocolFilteredSharedAccounts,
    sharedTokenMints: [...new Set(settlementMints)],
    sharedEd25519Messages,
    shared32ByteValues,
    findings,
  };
}

function print(report) {
  console.log("=== TSN PRIVACY LINKABILITY REPORT ===");
  console.log(`RPC: ${report.rpc}`);
  for (const item of [report.payment, report.settlement]) {
    console.log(`\n${item.label}: ${item.signature}`);
    console.log(`slot=${item.data.slot} blockTime=${item.data.blockTime ?? "unknown"} feePayer=${item.data.feePayer ?? "unknown"}`);
    console.log(`instructions=${item.data.instructions.map((entry) => entry.tsnInstruction ?? entry.programId).join(", ")}`);
    console.log(`ed25519Messages=${item.data.ed25519.length} tokenFlows=${item.data.tokenFlows.length}`);
    for (const flow of item.data.tokenFlows) console.log(`  token ${flow.mint} account=${flow.account ?? "unknown"} deltaBaseUnits=${flow.deltaBaseUnits}`);
    for (const message of item.data.ed25519) console.log(`  ed25519 domain=${message.domain || "binary"} messageSha256=${message.messageSha256} signer=${message.signerPublicKeyBase58}`);
  }
  console.log("\nShared accounts:", report.analysis.sharedAccounts.length ? report.analysis.sharedAccounts.join(", ") : "none");
  console.log("Shared non-protocol accounts:", report.analysis.protocolFilteredSharedAccounts.length ? report.analysis.protocolFilteredSharedAccounts.join(", ") : "none");
  console.log("Shared token mints:", report.analysis.sharedTokenMints.length ? report.analysis.sharedTokenMints.join(", ") : "none");
  console.log("Shared Ed25519 messages:", report.analysis.sharedEd25519Messages.length);
  console.log("Shared 32-byte instruction values:", report.analysis.shared32ByteValues.length);
  console.log("\nFindings:");
  for (const finding of report.analysis.findings) console.log(`[${finding.severity}] ${finding.code}: ${finding.detail}`);
}

const args = process.argv.slice(2);
const signatures = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--rpc") {
    index += 1;
    continue;
  }
  if (value === "--json" || value.startsWith("--")) continue;
  signatures.push(value);
}
const paymentSignature = signatures[0];
const settlementSignature = signatures[1];
if (!paymentSignature || !settlementSignature) usage();
const rpc = argValue(args, "--rpc") || process.env.TSN_RPC_GATEWAY_URL || DEFAULT_RPC;

try {
  const [paymentRaw, settlementRaw] = await Promise.all([
    loadTransaction(rpc, paymentSignature),
    loadTransaction(rpc, settlementSignature),
  ]);
  const payment = summarize(paymentRaw, paymentSignature);
  const settlement = summarize(settlementRaw, settlementSignature);
  const report = {
    rpc,
    payment: { label: "PAYMENT_INTENT_OR_FUNDING", data: { ...payment, raw: paymentRaw } },
    settlement: { label: "SETTLEMENT_OR_PAYOUT", data: { ...settlement, raw: settlementRaw } },
  };
  report.analysis = analyze(report.payment.data, report.settlement.data);
  if (args.includes("--json")) {
    const serializable = JSON.parse(JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value));
    delete serializable.payment.data.raw;
    delete serializable.settlement.data.raw;
    console.log(JSON.stringify(serializable, null, 2));
  } else {
    print(report);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
