import { createHash, createPublicKey, verify } from "node:crypto";
import { crankerExecutionPayload, type ReceiverWork, type WorkStatus } from "./work-contract";

type NodeAttestation = {
  version?: number;
  algorithm?: string;
  workId?: string;
  workKind?: string;
  decision?: string;
  inputPayloadCommitment?: string;
  evidenceCommitment?: string;
  executionPayloadCommitment?: string;
  verificationType?: string;
  leaseId?: string;
  leaseVersion?: number;
  nodeId?: string;
  keyId?: string;
  signedAt?: string;
  signatureBase64?: string;
};

const MESSAGE_FIELDS = [
  "version", "workId", "workKind", "decision", "inputPayloadCommitment",
  "evidenceCommitment", "executionPayloadCommitment", "verificationType", "leaseId", "leaseVersion",
  "nodeId", "keyId", "signedAt",
] as const;

function stableNodeValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableNodeValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableNodeValue(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function nodeCommitment(value: unknown) {
  return createHash("sha256").update(stableNodeValue(value)).digest("hex");
}

function attestationMessage(attestation: NodeAttestation) {
  const values = MESSAGE_FIELDS.map((field) => String(attestation[field] ?? ""));
  if (values.some((value) => value.includes("\n") || value.includes("\r"))) {
    throw new Error("NODE_ATTESTATION_INVALID_FIELD");
  }
  return Buffer.from(`TSN_NODE_VERIFICATION_V1\n${values.join("\n")}`, "utf8");
}

function configuredPublicKey() {
  const encoded = process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY?.trim();
  if (!encoded) throw new Error("NODE_VERIFICATION_PUBLIC_KEY_NOT_CONFIGURED");
  let raw: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(encoded)) raw = Buffer.from(encoded, "hex");
  else {
    raw = Buffer.from(encoded, "base64");
    if (raw.length !== 32 || raw.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      throw new Error("NODE_VERIFICATION_PUBLIC_KEY_INVALID");
    }
  }
  return {
    raw,
    key: createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
      format: "der",
      type: "spki",
    }),
  };
}

export function assertNodeVerificationAttestation(params: {
  work: ReceiverWork;
  owner: string;
  expectedVersion: number;
  status: WorkStatus;
  evidence: Record<string, unknown> | undefined;
}) {
  const evidence = params.evidence;
  const attestation = evidence?.nodeAttestation as NodeAttestation | undefined;
  if (!evidence || !attestation || typeof attestation !== "object") {
    throw new Error("NODE_ATTESTATION_REQUIRED");
  }
  if (params.status === "VERIFIED" && (!evidence.verifiedPayload || typeof evidence.verifiedPayload !== "object" || Array.isArray(evidence.verifiedPayload) || !String(evidence.verificationType ?? "").trim())) {
    throw new Error("NODE_VERIFIED_EVIDENCE_REQUIRED");
  }
  const lease = params.work.nodeLease;
  if (!lease) throw new Error("NODE_ATTESTATION_LEASE_MISSING");
  const { raw, key } = configuredPublicKey();
  const expectedKeyId = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  const unsignedEvidence = { ...evidence };
  delete unsignedEvidence.nodeAttestation;
  const expectedEvidenceCommitment = nodeCommitment(unsignedEvidence);
  const verifiedPayload = evidence.verifiedPayload;
  const executionPayload = params.status === "VERIFIED" && verifiedPayload && typeof verifiedPayload === "object" && !Array.isArray(verifiedPayload)
    ? crankerExecutionPayload(params.work.kind, verifiedPayload as Record<string, unknown>)
    : {};
  const expectedExecutionPayloadCommitment = nodeCommitment(executionPayload);
  if (
    attestation.version !== 1
    || attestation.algorithm !== "Ed25519"
    || attestation.workId !== params.work.id
    || attestation.workKind !== params.work.kind
    || attestation.decision !== params.status
    || attestation.inputPayloadCommitment !== params.work.payloadCommitment
    || attestation.evidenceCommitment !== expectedEvidenceCommitment
    || attestation.executionPayloadCommitment !== expectedExecutionPayloadCommitment
    || attestation.leaseId !== (lease.leaseId ?? params.work.id)
    || Number(attestation.leaseVersion) !== Number(lease.version ?? params.expectedVersion)
    || attestation.nodeId !== params.owner
    || attestation.keyId !== expectedKeyId
    || (params.status === "VERIFIED" && attestation.verificationType !== String(evidence.verificationType ?? ""))
    || !attestation.signedAt
    || !Number.isFinite(Date.parse(attestation.signedAt))
  ) {
    throw new Error("NODE_ATTESTATION_CONTEXT_MISMATCH");
  }
  const signature = Buffer.from(String(attestation.signatureBase64 ?? ""), "base64");
  if (
    signature.length !== 64
    || signature.toString("base64").replace(/=+$/, "") !== String(attestation.signatureBase64).replace(/=+$/, "")
    || !verify(null, attestationMessage(attestation), key, signature)
  ) {
    throw new Error("NODE_ATTESTATION_SIGNATURE_INVALID");
  }
}
