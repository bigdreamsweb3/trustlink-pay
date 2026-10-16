import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import nacl from "tweetnacl";

const envPath = resolve("tsn-protocol/services/tsn-node/.env");
const thresholdKey = "TSN_THRESHOLD_NONCE_SIGNING_KEY";
const attestationKey = "TSN_ROUTE_ATTESTATION_SIGNING_KEY";

if (!existsSync(envPath)) {
  throw new Error(`Missing ${envPath}. Copy .env.example to .env first.`);
}

const current = readFileSync(envPath, "utf8");
const hasValue = (name) => new RegExp(`^${name}\\s*=\\s*([^#\\r\\n]+)`, "m").exec(current)?.[1]?.trim();
const existingThreshold = hasValue(thresholdKey);
const existingAttestation = hasValue(attestationKey);
if (Boolean(existingThreshold) !== Boolean(existingAttestation)) {
  throw new Error("Refusing to repair a partially configured TSN Node key set. Review .env before rotating keys.");
}
if (existingThreshold && existingAttestation) {
  throw new Error("TSN Node keys are already configured. Rotate them explicitly instead.");
}

const threshold = nacl.sign.keyPair();
const attestation = nacl.sign.keyPair();
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
let updated = current;
const setValue = (text, name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
};
updated = setValue(updated, thresholdKey, b64(threshold.secretKey));
updated = setValue(updated, attestationKey, b64(attestation.secretKey));
writeFileSync(envPath, updated, { encoding: "utf8", mode: 0o600 });
try { chmodSync(envPath, 0o600); } catch { /* Windows ACLs provide the protection. */ }

console.log(JSON.stringify({
  status: "CREATED",
  environmentFile: "tsn-protocol/services/tsn-node/.env",
  generated: {
    thresholdNonceVerification: true,
    routeAttestation: true,
  },
  thresholdNonceVerificationPublicKeyBase64: b64(threshold.publicKey),
  routeAttestationPublicKeyBase64: b64(attestation.publicKey),
  privateValuesWritten: true,
}, null, 2));
