export type TraceLevel = "info" | "debug" | "verbose" | "full";

export type TraceOptions = {
  name?: string;
  module?: string;
  namespace?: string;
  level?: TraceLevel;
  includeReturn?: boolean;
};

type AnyFunction = (this: any, ...args: any[]) => any;

const TRACE_LEVELS: Record<TraceLevel, number> = {
  info: 1,
  debug: 2,
  verbose: 3,
  full: 4,
};

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /(privatekey|private_key|secret|seed|mnemonic|token|bearer|authorization|cookie|password|signature|session|apikey|api_key|accesstoken|access_token|refreshtoken|refresh_token|destination_wallet|destinationWallet|settlement_wallet|settlementWallet|receiver_wallet|receiverWallet|sender_wallet|senderWallet|escrow_tx_sig|escrowTxSig|claim_tx_sig|claimTxSig|proof_tx_sig|proofTxSig|released_to_wallet|releasedToWallet|ephemeral_pubkey|ephemeralPubkey|refund_ephemeral_pubkey|pru_route|pruRoute|pru_address|pruAddress|private_key_base64|secret_key|signing_key|encryption_key|ownerPublicKey|owner_public_key|signerPublicKey|signer_public_key|tinsWalletPublicKey|tins_wallet_pubkey|ownerWallet|owner_wallet|walletAddress|wallet_address)/i;

let traceDepth = 0;

function readEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };
  return runtime.process?.env?.[name];
}

function isProduction() {
  return readEnv("NODE_ENV") === "production";
}

function normalizeLevel(value?: string | null): TraceLevel | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return normalized === "info" ||
    normalized === "debug" ||
    normalized === "verbose" ||
    normalized === "full"
    ? normalized
    : null;
}

export function getTraceLevel(): TraceLevel | null {
  if (isProduction()) return null;
  const configured =
    normalizeLevel(readEnv("TRACE_LEVEL")) ??
    normalizeLevel(readEnv("NEXT_PUBLIC_TRACE_LEVEL"));
  if (configured) return configured;
  if (readEnv("DEBUG_TRACE") === "true") return "debug";
  if (readEnv("NEXT_PUBLIC_DEBUG_TRACE") === "true") return "debug";
  return null;
}

export function isTraceEnabled(level: TraceLevel = "info") {
  const current = getTraceLevel();
  if (!current) return false;
  return TRACE_LEVELS[current] >= TRACE_LEVELS[level];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function looksLikeTin(value: string) {
  return /^\d{8,20}$/.test(value);
}

function looksLikePublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function looksLikeBase64Payload(value: string) {
  return value.length > 64 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function maskTraceString(value: string) {
  if (looksLikeTin(value)) return `${value.slice(0, 3)}****${value.slice(-3)}`;
  if (looksLikePublicKey(value)) return `${value.slice(0, 4)}...${value.slice(-4)}`;
  if (looksLikeBase64Payload(value)) return `[base64:${value.length} chars]`;
  if (value.length > 180) return `${value.slice(0, 80)}...[${value.length} chars]`;
  return value;
}

export function sanitizeForTrace(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return maskTraceString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    return `[bytes:${value.byteLength}]`;
  }

  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value.slice(0, 8).map((entry) => sanitizeForTrace(entry, depth + 1)).concat(
      value.length > 8 ? [`...${value.length - 8} more`] : [],
    );
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const constructorName = value.constructor?.name;
    if (!isPlainObject(value) && constructorName && constructorName !== "Object") {
      const maybeBase58 = typeof record.toBase58 === "function"
        ? (record.toBase58 as () => string)()
        : undefined;
      return maybeBase58 ? maskTraceString(maybeBase58) : `[${constructorName}]`;
    }

    const entries = Object.entries(record);
    if (depth >= 3) return `[object:${entries.length} keys]`;

    return Object.fromEntries(
      entries.slice(0, 24).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeForTrace(entry, depth + 1),
      ]),
    );
  }

  return String(value);
}

function summarizeReturn(value: unknown) {
  return sanitizeForTrace(value, 0);
}

function tracePrefix(options: TraceOptions) {
  const namespace = options.namespace ? `${options.namespace}:` : "";
  return `[TRACE] ${namespace}${options.name ?? "anonymous"}`;
}

function logTraceStart(options: TraceOptions, args: unknown[], startedAt: string, depth: number) {
  const prefix = tracePrefix(options);
  const group = console.groupCollapsed ?? console.group;
  group?.call(console, `%c${prefix}`, "color:#22c55e;font-weight:600");
  console.log("Module:", options.module ?? "unknown");
  console.log("Args:", sanitizeForTrace(args));
  console.log("Started:", startedAt);
  console.log("Depth:", depth);
  console.log("Status:", "running");
}

function logTraceEnd(params: {
  options: TraceOptions;
  startedAtMs: number;
  status: "success" | "error";
  value?: unknown;
  error?: unknown;
}) {
  const duration = Date.now() - params.startedAtMs;
  console.log("Ended:", new Date().toISOString());
  console.log("Duration:", `${duration}ms`);
  console.log("Status:", params.status);
  if (params.status === "success" && params.options.includeReturn !== false) {
    console.log("Return:", summarizeReturn(params.value));
  }
  if (params.status === "error") {
    console.error("Error:", sanitizeForTrace(params.error));
  }
  console.groupEnd?.();
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as Promise<unknown>).then === "function";
}

export function traceFunction<F extends AnyFunction>(fn: F, options: TraceOptions = {}): F {
  const wrapped = function tracedFunction(this: ThisParameterType<F>, ...args: Parameters<F>) {
    const level = options.level ?? "debug";
    if (!isTraceEnabled(level)) {
      return fn.apply(this, args) as ReturnType<F>;
    }

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const depth = traceDepth;
    traceDepth += 1;
    logTraceStart(
      { ...options, name: options.name ?? fn.name ?? "anonymous" },
      args,
      startedAt,
      depth,
    );

    try {
      const result = fn.apply(this, args);
      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            logTraceEnd({
              options,
              startedAtMs,
              status: "success",
              value,
            });
            return value;
          })
          .catch((error) => {
            logTraceEnd({
              options,
              startedAtMs,
              status: "error",
              error,
            });
            throw error;
          })
          .finally(() => {
            traceDepth = Math.max(0, traceDepth - 1);
          }) as ReturnType<F>;
      }

      logTraceEnd({
        options,
        startedAtMs,
        status: "success",
        value: result,
      });
      traceDepth = Math.max(0, traceDepth - 1);
      return result as ReturnType<F>;
    } catch (error) {
      logTraceEnd({
        options,
        startedAtMs,
        status: "error",
        error,
      });
      traceDepth = Math.max(0, traceDepth - 1);
      throw error;
    }
  };

  return wrapped as F;
}

export function tracedAsync<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: TraceOptions = {},
) {
  return traceFunction(fn, options) as (...args: Args) => Promise<Result>;
}

export function traceApiHandler<F extends AnyFunction>(fn: F, options: TraceOptions = {}): F {
  return traceFunction(fn, {
    namespace: "API",
    level: "info",
    ...options,
  });
}

export function traceReactFlow<F extends AnyFunction>(fn: F, options: TraceOptions = {}): F {
  return traceFunction(fn, {
    namespace: "UI",
    level: "debug",
    ...options,
  });
}
