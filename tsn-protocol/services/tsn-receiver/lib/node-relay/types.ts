import type { NodePayloadEnvelope } from "../security/node-envelope/configuration";

export type RelayLane = "FUNDING" | "SIGNING" | "PUBLIC";
export type RelayRequest = { method: string; path: string; search: string; headers: Record<string, string>; body: string | null };
export type RelayReply = { status: number; body: string; contentType: string; signatureBase64: string };
export type RelayJob = {
  id: string; requestHash: string; lane: RelayLane; status: "PENDING" | "LEASED" | "COMPLETED" | "EXPIRED";
  version: number; createdAt: string; expiresAt: string; retainUntil: string;
  request: NodePayloadEnvelope; scope: Record<string, unknown> | null;
  lease?: { owner: string; version: number; expiresAt: string } | null;
  response?: NodePayloadEnvelope; responseStatus?: number;
};
export type RelayDependencies = {
  db: any; jobs: any; activity: any; workCollection: any;
  environment: NodeJS.ProcessEnv; clock: typeof Date;
  encrypt: (payload: Record<string, unknown>) => NodePayloadEnvelope;
  decrypt: (envelope: NodePayloadEnvelope) => Record<string, unknown>;
};
