import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export class CanonicalMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalMessageError";
  }
}

export const TSN_CANONICAL_DOMAIN_HASH = bytesToHex(
  sha256(utf8ToBytes("trustlink-pay:tsn:canonical-signing:v1")),
);
export const TSN_CANONICAL_DOMAIN_DISPLAY = `...${TSN_CANONICAL_DOMAIN_HASH.slice(-8)}`;
const USDC_DECIMALS = 6n;

/** Convert a human token amount to integer base units without floating-point rounding. */
export function parseTokenAmountToBaseUnits(
  value: string | number,
  decimals = 6,
  options: { allowZero?: boolean } = {},
): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new CanonicalMessageError("Token decimals must be an integer from 0 through 18");
  }
  const amount = String(value).trim();
  const match = amount.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > decimals) {
    throw new CanonicalMessageError(`Amount must be a plain decimal with at most ${decimals} fractional digits`);
  }
  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(decimals, "0") || "0");
  const baseUnits = whole * 10n ** BigInt(decimals) + fractional;
  if (baseUnits < 0n || (!options.allowZero && baseUnits === 0n)) {
    throw new CanonicalMessageError(options.allowZero ? "Amount must not be negative" : "Amount must be positive");
  }
  if (baseUnits > 0xffff_ffff_ffff_ffffn) {
    throw new CanonicalMessageError("Amount is outside the u64 range");
  }
  return baseUnits;
}

type CanonicalValue = string | number | bigint | Date;

function formatValue(value: CanonicalValue) {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildMessage(action: string, fields: Array<[string, CanonicalValue]>) {
  return [
    `TSN ${action}`,
    "---",
    ...fields.map(([label, value]) => `${label}: ${formatValue(value)}`),
    `Domain: ${TSN_CANONICAL_DOMAIN_DISPLAY}`,
  ].join("\n");
}

function parseMessage(message: string, action: string) {
  if (typeof message !== "string" || !message.startsWith("TSN ")) {
    throw new CanonicalMessageError("canonical message must start with TSN ");
  }
  const lines = message.split("\n").map((line) => line.trimEnd());
  if (lines[0] !== `TSN ${action}`) {
    throw new CanonicalMessageError(`expected TSN ${action} message`);
  }
  if (lines[1] !== "---") {
    throw new CanonicalMessageError("canonical message is missing separator line");
  }
  const fields = new Map<string, string>();
  for (const line of lines.slice(2)) {
    const separator = line.indexOf(": ");
    if (separator <= 0) {
      throw new CanonicalMessageError(`canonical field is malformed: ${line}`);
    }
    const label = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (fields.has(label)) {
      throw new CanonicalMessageError(`canonical field is duplicated: ${label}`);
    }
    fields.set(label, value);
  }
  const domain = fields.get("Domain");
  if (domain !== TSN_CANONICAL_DOMAIN_DISPLAY) {
    throw new CanonicalMessageError("canonical domain does not match TSN");
  }
  return fields;
}

function requireField(fields: Map<string, string>, label: string) {
  const value = fields.get(label);
  if (!value) throw new CanonicalMessageError(`canonical field is missing: ${label}`);
  return value;
}

function parseTin(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new CanonicalMessageError(`${label} must be plain digits`);
  }
  return value;
}

function parseHash32(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new CanonicalMessageError(`${label} must be a 32-byte hexadecimal commitment`);
  }
  return normalized;
}

function parseRouteVersion(value: string | number) {
  const normalized = String(value).trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new CanonicalMessageError("Recipient Route Version must be a positive integer");
  }
  const routeVersion = Number(normalized);
  if (!Number.isSafeInteger(routeVersion)) {
    throw new CanonicalMessageError("Recipient Route Version is outside the safe integer range");
  }
  return routeVersion;
}

function parseExpiry(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new CanonicalMessageError("Expires must be an ISO 8601 UTC timestamp");
  }
  return date;
}

function parseUsdc(value: string, label: string) {
  const match = value.match(/^(\d+)(?:\.(\d{1,6}))? USDC$/);
  if (!match) {
    throw new CanonicalMessageError(`${label} must be a decimal USDC amount`);
  }
  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(Number(USDC_DECIMALS), "0"));
  return whole * 1_000_000n + fractional;
}

function formatUsdcBaseUnits(baseUnits: bigint) {
  const whole = baseUnits / 1_000_000n;
  const fraction = (baseUnits % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ".00"} USDC`;
}

export function isCanonicalTsnMessage(message: string) {
  return typeof message === "string" && message.startsWith("TSN ") && message.includes("\n---\n");
}

export type VerifiedRecipientCredential = {
  credentialType: string;
  issuer: string;
  claims: Record<string, string>;
};

function canonicalRecipientCredentials(credentials: readonly VerifiedRecipientCredential[] = []) {
  const normalized = credentials.map((credential) => {
    if (!credential.credentialType.trim() || !credential.issuer.trim() || !credential.claims
      || typeof credential.claims !== "object" || Array.isArray(credential.claims)) {
      throw new CanonicalMessageError("Verified recipient credentials must include a type, issuer, and claims");
    }
    const claims = Object.fromEntries(Object.entries(credential.claims)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        if (!key.trim() || typeof value !== "string") {
          throw new CanonicalMessageError("Verified recipient credential claims must be named strings");
        }
        return [key, value];
      }));
    return {
      credentialType: credential.credentialType,
      issuer: credential.issuer,
      claims,
    };
  }).sort((left, right) =>
    left.credentialType.localeCompare(right.credentialType)
      || left.issuer.localeCompare(right.issuer)
      || JSON.stringify(left.claims).localeCompare(JSON.stringify(right.claims)));
  return JSON.stringify(normalized);
}

function canonicalDisplayName(value: string | undefined) {
  const displayName = value?.trim() ?? "";
  if (/[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new CanonicalMessageError("Recipient display name must not contain control characters");
  }
  return displayName || "(not provided)";
}

export function buildPaymentIntentMessage(params: {
  amountBaseUnits: bigint | string | number;
  recipientTin: string;
  recipientDisplayName?: string;
  recipientDisplayNameSource?: "owner-provided" | "not provided";
  recipientVerifiedCredentials?: readonly VerifiedRecipientCredential[];
  feeBaseUnits: bigint | string | number;
  sender: string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("Payment Intent", [
    ["Amount", formatUsdcBaseUnits(BigInt(params.amountBaseUnits))],
    ["Recipient TIN", parseTin(params.recipientTin, "Recipient TIN")],
    ["Recipient Display Name", canonicalDisplayName(params.recipientDisplayName)],
    ["Recipient Display Name Source", params.recipientDisplayName?.trim() ? (params.recipientDisplayNameSource ?? "owner-provided") : "not provided"],
    ["Recipient Verified Credentials", canonicalRecipientCredentials(params.recipientVerifiedCredentials)],
    ["Fee", formatUsdcBaseUnits(BigInt(params.feeBaseUnits))],
    ["Sender", params.sender],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parsePaymentIntentMessage(message: string) {
  const fields = parseMessage(message, "Payment Intent");
  return {
    amountBaseUnits: parseUsdc(requireField(fields, "Amount"), "Amount"),
    recipientTin: parseTin(requireField(fields, "Recipient TIN"), "Recipient TIN"),
    recipientDisplayName: requireField(fields, "Recipient Display Name"),
    recipientDisplayNameSource: requireField(fields, "Recipient Display Name Source"),
    recipientVerifiedCredentials: JSON.parse(requireField(fields, "Recipient Verified Credentials")) as VerifiedRecipientCredential[],
    feeBaseUnits: parseUsdc(requireField(fields, "Fee"), "Fee"),
    sender: requireField(fields, "Sender"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}

/**
 * Cross-chain payment intent. This is intentionally separate from the legacy
 * Solana-only Payment Intent format so existing Solana flows are not changed.
 * Every destination-sensitive field is inside the user signature.
 */
export function buildCrossChainPaymentIntentMessage(params: {
  intentId: string;
  amountBaseUnits: bigint | string | number;
  destinationToken: string;
  recipientTin: string;
  feeBaseUnits: bigint | string | number;
  sender: string;
  nonce: string;
  expires: string | Date;
  destinationNetwork: string;
  destinationExecutor: string;
  settlementRouteId: string;
}) {
  if (!params.intentId.trim() || !params.destinationToken.trim() || !params.destinationNetwork.trim()) {
    throw new CanonicalMessageError("cross-chain intent fields must not be empty");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.destinationExecutor)) {
    throw new CanonicalMessageError("Destination Executor must be a 20-byte EVM address");
  }
  return buildMessage("Cross-Chain Payment Intent", [
    ["Intent ID", params.intentId],
    ["Amount", formatUsdcBaseUnits(BigInt(params.amountBaseUnits))],
    ["Asset", params.destinationToken.toLowerCase()],
    ["Recipient TIN", parseTin(params.recipientTin, "Recipient TIN")],
    ["Fee", formatUsdcBaseUnits(BigInt(params.feeBaseUnits))],
    ["Sender", params.sender],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
    ["Destination Network", params.destinationNetwork],
    ["Destination Executor", params.destinationExecutor.toLowerCase()],
    ["Settlement Route ID", parseHash32(params.settlementRouteId.replace(/^0x/i, ""), "Settlement Route ID")],
  ]);
}

export function parseCrossChainPaymentIntentMessage(message: string) {
  const fields = parseMessage(message, "Cross-Chain Payment Intent");
  const destinationExecutor = requireField(fields, "Destination Executor").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(destinationExecutor)) {
    throw new CanonicalMessageError("Destination Executor must be a 20-byte EVM address");
  }
  return {
    intentId: requireField(fields, "Intent ID"),
    amountBaseUnits: parseUsdc(requireField(fields, "Amount"), "Amount"),
    destinationToken: requireField(fields, "Asset").toLowerCase(),
    recipientTin: parseTin(requireField(fields, "Recipient TIN"), "Recipient TIN"),
    feeBaseUnits: parseUsdc(requireField(fields, "Fee"), "Fee"),
    sender: requireField(fields, "Sender"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
    destinationNetwork: requireField(fields, "Destination Network"),
    destinationExecutor,
    settlementRouteId: parseHash32(requireField(fields, "Settlement Route ID"), "Settlement Route ID"),
  };
}

export function buildTinCreationMessage(params: {
  tin: string;
  displayName: string;
  privacy?: string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("TIN Creation", [
    ["TIN", parseTin(params.tin, "TIN")],
    ["Display Name", params.displayName],
    ["Privacy", params.privacy ?? "30 PRUs"],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function buildTinWalletBindingMessage(params: {
  tin: string;
  walletPublicKey: string;
  identityPublicKey: string;
  programId: string;
  issuedAt: string | Date;
}) {
  return buildMessage("TIN Wallet Binding", [
    ["TIN", parseTin(params.tin, "TIN")],
    ["Wallet", params.walletPublicKey],
    ["Identity", params.identityPublicKey],
    ["Program", params.programId],
    ["Issued At", params.issuedAt instanceof Date ? params.issuedAt : new Date(params.issuedAt)],
  ]);
}

export function parseTinWalletBindingMessage(message: string) {
  const fields = parseMessage(message, "TIN Wallet Binding");
  return {
    tin: parseTin(requireField(fields, "TIN"), "TIN"),
    walletPublicKey: requireField(fields, "Wallet"),
    identityPublicKey: requireField(fields, "Identity"),
    programId: requireField(fields, "Program"),
    issuedAt: parseExpiry(requireField(fields, "Issued At")),
  };
}
export function parseTinCreationMessage(message: string) {
  const fields = parseMessage(message, "TIN Creation");
  return {
    tin: parseTin(requireField(fields, "TIN"), "TIN"),
    displayName: requireField(fields, "Display Name"),
    privacy: requireField(fields, "Privacy"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}
