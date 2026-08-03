import { createHash, randomUUID } from "node:crypto";

export type WorkKind = "PAYMENT_INTENT" | "CLAIM" | "TIN_OPERATION" | "RECOVERY";
export type WorkStatus =
  | "RECEIVED"
  | "NODE_VERIFYING"
  | "VERIFIED"
  | "REJECTED"
  | "CRANKER_LEASED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED";

export type ReceiverWork = {
  id: string;
  kind: WorkKind;
  status: WorkStatus;
  stateVersion: number;
  payloadCommitment: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  updatedAt: string;
  nodeLease?: { owner: string; expiresAt: string } | null;
  crankerLease?: { owner: string; expiresAt: string } | null;
  verification?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  authorization?: Record<string, unknown> | null;
};

const forbidden = /(master.?seed|private.?key|secret.?key|mnemonic|secretkeybase64|settlementescrowsecret)/i;

export function assertPublicPayload(value: unknown, path = "payload"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.test(key)) throw new Error(`FORBIDDEN_SECRET_FIELD:${path}.${key}`);
    assertPublicPayload(child, `${path}.${key}`);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createReceivedWork(input: { id?: string; kind: WorkKind; payload: Record<string, unknown> }) {
  assertPublicPayload(input.payload);
  const now = new Date().toISOString();
  return {
    id: input.id?.trim() || randomUUID(),
    kind: input.kind,
    status: "RECEIVED",
    stateVersion: 1,
    payloadCommitment: createHash("sha256").update(stable(input.payload)).digest("hex"),
    payload: input.payload,
    receivedAt: now,
    updatedAt: now,
    nodeLease: null,
    crankerLease: null,
    verification: null,
    result: null,
    authorization: null,
  } satisfies ReceiverWork;
}
