import { isTraceEnabled, maskTraceString, sanitizeForTrace } from "./tracer";

export type FeeFlow =
  | "TSN Settlement"
  | "TIN Creation"
  | "TIN Update"
  | "Claim"
  | "Recovery"
  | string;

export type FeeTrackerInput = {
  flow: FeeFlow;
  tokenSymbol?: string;
  userAmountLamports: bigint | number | string;
  networkFeeLamports?: bigint | number | string | null;
  senderFeeLamports?: bigint | number | string | null;
  claimFeeLamports?: bigint | number | string | null;
  tin?: string | null;
  senderWallet?: string | null;
  recipientWallet?: string | null;
  txSignature?: string | null;
  paymentId?: string | null;
  metadata?: Record<string, unknown>;
};

export type FeeDistribution = {
  totalProtocolFeeLamports: bigint;
  lpShareLamports: bigint;
  operatorShareLamports: bigint;
  treasuryShareLamports: bigint;
  recoveryBonusLamports: bigint;
  netProtocolResultLamports: bigint;
};

export type FeeEvent = FeeTrackerInput & FeeDistribution & {
  id: string;
  trackedAt: string;
};

const SPLIT_BPS = {
  lp: 8500n,
  operator: 800n,
  treasury: 500n,
  recoveryBonus: 200n,
};

const FEE_EVENTS_KEY = "__TRUSTLINK_FEE_EVENTS__";

function toBigInt(value: bigint | number | string | null | undefined) {
  if (value == null || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value);
}

function decimalLamports(value: bigint, decimals = 9) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10n ** BigInt(decimals);
  const fraction = (absolute % 10n ** BigInt(decimals)).toString().padStart(decimals, "0");
  return `${sign}${whole}.${fraction}`;
}

function token(value: bigint, symbol = "SOL") {
  return `${decimalLamports(value)} ${symbol}`;
}

function signedToken(value: bigint, symbol = "SOL") {
  return `${value > 0n ? "+" : ""}${token(value, symbol)}`;
}

export function calculateFeeDistribution(input: FeeTrackerInput): FeeDistribution {
  const senderFee = toBigInt(input.senderFeeLamports);
  const claimFee = toBigInt(input.claimFeeLamports);
  const networkFee = toBigInt(input.networkFeeLamports);
  const totalProtocolFee = senderFee + claimFee;
  const lpShare = (totalProtocolFee * SPLIT_BPS.lp) / 10_000n;
  const operatorShare = (totalProtocolFee * SPLIT_BPS.operator) / 10_000n;
  const treasuryShare = (totalProtocolFee * SPLIT_BPS.treasury) / 10_000n;
  const recoveryBonus = totalProtocolFee - lpShare - operatorShare - treasuryShare;

  return {
    totalProtocolFeeLamports: totalProtocolFee,
    lpShareLamports: lpShare,
    operatorShareLamports: operatorShare,
    treasuryShareLamports: treasuryShare,
    recoveryBonusLamports: recoveryBonus,
    netProtocolResultLamports: totalProtocolFee - networkFee,
  };
}

function feeEventStore(): FeeEvent[] {
  const globalRecord = globalThis as typeof globalThis & {
    [FEE_EVENTS_KEY]?: FeeEvent[];
  };
  if (!globalRecord[FEE_EVENTS_KEY]) globalRecord[FEE_EVENTS_KEY] = [];
  return globalRecord[FEE_EVENTS_KEY];
}

export function trackTransactionFees(input: FeeTrackerInput): FeeEvent {
  const distribution = calculateFeeDistribution(input);
  const event: FeeEvent = {
    ...input,
    ...distribution,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    trackedAt: new Date().toISOString(),
  };
  feeEventStore().push(event);
  if (isTraceEnabled("info")) logFeeBreakdown(event);
  return event;
}

export function logFeeBreakdown(input: FeeTrackerInput | FeeEvent) {
  if (!isTraceEnabled("info")) return;
  const distribution =
    "totalProtocolFeeLamports" in input
      ? input
      : { ...input, ...calculateFeeDistribution(input) };
  const symbol = input.tokenSymbol ?? "SOL";
  const networkFee = toBigInt(input.networkFeeLamports);
  const userAmount = toBigInt(input.userAmountLamports);
  const prefix = `[FEE] ${input.flow}`;
  const group = console.groupCollapsed ?? console.group;
  group?.call(console, `%c${prefix}`, "color:#38bdf8;font-weight:600");
  console.log("User paid:", token(userAmount, symbol));
  console.log("Actual network cost:", token(networkFee, symbol));
  console.log("Protocol earned:", token(distribution.totalProtocolFeeLamports, symbol));
  console.log("Net protocol result:", signedToken(distribution.netProtocolResultLamports, symbol));
  console.log("Split:", {
    LPs: token(distribution.lpShareLamports, symbol),
    Operators: token(distribution.operatorShareLamports, symbol),
    Treasury: token(distribution.treasuryShareLamports, symbol),
    RecoveryBonus: token(distribution.recoveryBonusLamports, symbol),
  });
  console.log("Context:", sanitizeForTrace({
    tin: input.tin ? maskTraceString(input.tin) : null,
    senderWallet: input.senderWallet,
    recipientWallet: input.recipientWallet,
    txSignature: input.txSignature,
    paymentId: input.paymentId,
    metadata: input.metadata,
  }));
  console.groupEnd?.();
}

export function summarizeFeeEvents(events: FeeEvent[]) {
  return events.reduce(
    (summary, event) => {
      summary.transactionCount += 1;
      summary.totalUserVolumeLamports += toBigInt(event.userAmountLamports);
      summary.totalNetworkCostLamports += toBigInt(event.networkFeeLamports);
      summary.totalProtocolFeesLamports += toBigInt(event.totalProtocolFeeLamports);
      summary.lpAllocationLamports += toBigInt(event.lpShareLamports);
      summary.operatorAllocationLamports += toBigInt(event.operatorShareLamports);
      summary.treasuryAllocationLamports += toBigInt(event.treasuryShareLamports);
      summary.recoveryBonusAllocationLamports += toBigInt(event.recoveryBonusLamports);
      summary.netProtocolResultLamports += toBigInt(event.netProtocolResultLamports);
      return summary;
    },
    {
      transactionCount: 0,
      totalUserVolumeLamports: 0n,
      totalNetworkCostLamports: 0n,
      totalProtocolFeesLamports: 0n,
      lpAllocationLamports: 0n,
      operatorAllocationLamports: 0n,
      treasuryAllocationLamports: 0n,
      recoveryBonusAllocationLamports: 0n,
      netProtocolResultLamports: 0n,
    },
  );
}

export function getTrackedFeeEvents() {
  return [...feeEventStore()];
}

export function formatFeeLamports(value: bigint, symbol = "SOL") {
  return token(value, symbol);
}

export function formatSignedFeeLamports(value: bigint, symbol = "SOL") {
  return signedToken(value, symbol);
}
