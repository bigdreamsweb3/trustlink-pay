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

export function buildPruSpendMessage(params: {
  amountBaseUnits: bigint | string | number;
  recipientTin: string;
  feeBaseUnits: bigint | string | number;
  pruSource?: "TIN Balance" | string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("PRU Spend", [
    ["Amount", formatUsdcBaseUnits(BigInt(params.amountBaseUnits))],
    ["Recipient TIN", parseTin(params.recipientTin, "Recipient TIN")],
    ["Fee", formatUsdcBaseUnits(BigInt(params.feeBaseUnits))],
    ["PRU Source", params.pruSource ?? "TIN Balance"],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parsePruSpendMessage(message: string) {
  const fields = parseMessage(message, "PRU Spend");
  return {
    amountBaseUnits: parseUsdc(requireField(fields, "Amount"), "Amount"),
    recipientTin: parseTin(requireField(fields, "Recipient TIN"), "Recipient TIN"),
    feeBaseUnits: parseUsdc(requireField(fields, "Fee"), "Fee"),
    pruSource: requireField(fields, "PRU Source"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}

export function buildPaymentIntentMessage(params: {
  amountBaseUnits: bigint | string | number;
  recipientTin: string;
  feeBaseUnits: bigint | string | number;
  sender: string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("Payment Intent", [
    ["Amount", formatUsdcBaseUnits(BigInt(params.amountBaseUnits))],
    ["Recipient TIN", parseTin(params.recipientTin, "Recipient TIN")],
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
    feeBaseUnits: parseUsdc(requireField(fields, "Fee"), "Fee"),
    sender: requireField(fields, "Sender"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}

export function buildMixedPaymentMessage(params: {
  amountBaseUnits: bigint | string | number;
  recipientTin: string;
  feeBaseUnits: bigint | string | number;
  pruPortionBaseUnits: bigint | string | number;
  walletTopUpPortionBaseUnits: bigint | string | number;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("Mixed Payment", [
    ["Amount", formatUsdcBaseUnits(BigInt(params.amountBaseUnits))],
    ["Recipient TIN", parseTin(params.recipientTin, "Recipient TIN")],
    ["Fee", formatUsdcBaseUnits(BigInt(params.feeBaseUnits))],
    ["PRU Portion", formatUsdcBaseUnits(BigInt(params.pruPortionBaseUnits))],
    ["Wallet Top-Up Portion", formatUsdcBaseUnits(BigInt(params.walletTopUpPortionBaseUnits))],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parseMixedPaymentMessage(message: string) {
  const fields = parseMessage(message, "Mixed Payment");
  return {
    amountBaseUnits: parseUsdc(requireField(fields, "Amount"), "Amount"),
    recipientTin: parseTin(requireField(fields, "Recipient TIN"), "Recipient TIN"),
    feeBaseUnits: parseUsdc(requireField(fields, "Fee"), "Fee"),
    pruPortionBaseUnits: parseUsdc(requireField(fields, "PRU Portion"), "PRU Portion"),
    walletTopUpPortionBaseUnits: parseUsdc(
      requireField(fields, "Wallet Top-Up Portion"),
      "Wallet Top-Up Portion",
    ),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
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

export function buildTinUpgradeMessage(params: {
  tin: string;
  displayName: string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("TIN Upgrade", [
    ["TIN", parseTin(params.tin, "TIN")],
    ["Display Name", params.displayName],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parseTinUpgradeMessage(message: string) {
  const fields = parseMessage(message, "TIN Upgrade");
  return {
    tin: parseTin(requireField(fields, "TIN"), "TIN"),
    displayName: requireField(fields, "Display Name"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}

export function buildPruRouteSessionMessage(params: {
  tin: string;
  purpose?: string;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("Balance Access", [
    ["TIN", parseTin(params.tin, "TIN")],
    ["Purpose", params.purpose ?? "Load TIN Balance"],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parsePruRouteSessionMessage(message: string) {
  const fields = parseMessage(message, "Balance Access");
  return {
    tin: parseTin(requireField(fields, "TIN"), "TIN"),
    purpose: requireField(fields, "Purpose"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}

export function buildSweepMessage(params: {
  tin: string;
  destination: string;
  mode: string;
  estimatedAmountBaseUnits: bigint | string | number;
  nonce: string;
  expires: string | Date;
}) {
  return buildMessage("Sweep", [
    ["TIN", parseTin(params.tin, "TIN")],
    ["Destination", params.destination],
    ["Mode", params.mode],
    ["Estimated Amount", formatUsdcBaseUnits(BigInt(params.estimatedAmountBaseUnits))],
    ["Nonce", params.nonce],
    ["Expires", params.expires instanceof Date ? params.expires : new Date(params.expires)],
  ]);
}

export function parseSweepMessage(message: string) {
  const fields = parseMessage(message, "Sweep");
  return {
    tin: parseTin(requireField(fields, "TIN"), "TIN"),
    destination: requireField(fields, "Destination"),
    mode: requireField(fields, "Mode"),
    estimatedAmountBaseUnits: parseUsdc(requireField(fields, "Estimated Amount"), "Estimated Amount"),
    nonce: requireField(fields, "Nonce"),
    expires: parseExpiry(requireField(fields, "Expires")),
  };
}
