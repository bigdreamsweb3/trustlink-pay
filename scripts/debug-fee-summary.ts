import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type FeeEvent,
  type FeeTrackerInput,
  formatFeeLamports,
  formatSignedFeeLamports,
  summarizeFeeEvents,
  trackTransactionFees,
} from "../utils/observability/fee-tracker";

const EVENT_STORE_CANDIDATES = [
  ".trustlink-debug/fee-events.json",
  ".trustlink-debug/fee-events.jsonl",
];

function parseEventStore(path: string): FeeEvent[] {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  if (path.endsWith(".jsonl")) {
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as FeeEvent);
  }
  return JSON.parse(raw) as FeeEvent[];
}

function loadLocalEvents() {
  for (const candidate of EVENT_STORE_CANDIDATES) {
    const fullPath = resolve(process.cwd(), candidate);
    if (!existsSync(fullPath)) continue;
    return parseEventStore(fullPath);
  }
  return null;
}

function sampleEvents() {
  const samples: FeeTrackerInput[] = [
    {
      flow: "TSN Settlement",
      userAmountLamports: 1_000_000_000n,
      networkFeeLamports: 5_000n,
      senderFeeLamports: 2_000_000n,
      claimFeeLamports: 1_000_000n,
      tokenSymbol: "SOL",
      tin: "1234567890",
      senderWallet: "FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
    },
    {
      flow: "Claim",
      userAmountLamports: 500_000_000n,
      networkFeeLamports: 5_000n,
      senderFeeLamports: 0n,
      claimFeeLamports: 750_000n,
      tokenSymbol: "SOL",
      tin: "9876543210",
    },
  ];
  return samples.map((sample) => trackTransactionFees(sample));
}

const localEvents = loadLocalEvents();
const events = localEvents ?? sampleEvents();
const summary = summarizeFeeEvents(events);
const source = localEvents ? "local fee events" : "sample fee events";

console.log("");
console.log("TrustLink Pay Fee Summary");
console.log("=========================");
console.log(`Source: ${source}`);
console.log(`Transactions tracked: ${summary.transactionCount}`);
console.log(`Total user volume: ${formatFeeLamports(summary.totalUserVolumeLamports)}`);
console.log(`Total network cost: ${formatFeeLamports(summary.totalNetworkCostLamports)}`);
console.log(`Total protocol fees: ${formatFeeLamports(summary.totalProtocolFeesLamports)}`);
console.log(`LP allocation: ${formatFeeLamports(summary.lpAllocationLamports)}`);
console.log(`Operator allocation: ${formatFeeLamports(summary.operatorAllocationLamports)}`);
console.log(`Treasury allocation: ${formatFeeLamports(summary.treasuryAllocationLamports)}`);
console.log(`Recovery bonus allocation: ${formatFeeLamports(summary.recoveryBonusAllocationLamports)}`);
console.log(`Net protocol result: ${formatSignedFeeLamports(summary.netProtocolResultLamports)}`);
console.log("");
