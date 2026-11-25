import type { RelayRequest } from "./types";

/** Admit only existing Node API paths and bounded data; no URL, command or executable payload is accepted. */
export function validateRelayRequest(value: RelayRequest): RelayRequest {
  if (!value || !["GET", "POST", "PATCH"].includes(value.method)
      || !/^\/(?:network\/[a-z0-9/-]+|tin-routes\/[a-z0-9/-]+|tin-operations(?:\/[a-z0-9/-]+)?|intents(?:\/[A-Za-z0-9_-]+\/status)?|intent-work|metrics|settlement-networks|epoch\/status|threshold-access\/nonces\/consume|internal\/settlement-authorizations\/(?:settlement|signature))$/.test(value.path)
      || value.path.includes("..") || typeof value.search !== "string" || value.search.length > 2048
      || value.search && !value.search.startsWith("?") || !value.headers || Array.isArray(value.headers)
      || Object.entries(value.headers).some(([name, header]) => !["authorization", "content-type", "x-platform-key", "x-platform-signature"].includes(name)
        || typeof header !== "string" || header.length > 8192 || /[\r\n]/.test(header))
      || value.body !== null && typeof value.body !== "string"
      || Buffer.byteLength(value.body ?? "", "utf8") > 65536
      || value.method === "GET" && value.body !== null) throw new Error("NODE_RELAY_REQUEST_INVALID");
  return value;
}
