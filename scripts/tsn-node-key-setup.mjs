import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import nacl from "tweetnacl";

const envPath = resolve("tsn-protocol/tsn-node/.env");
const routeKey = "TSN_ROUTE_DECRYPTION_PRIVATE_KEY";
const thresholdKey = "TSN_THRESHOLD_NONCE_SIGNING_KEY";
const attestationKey = "TSN_ROUTE_ATTESTATION_SIGNING_KEY";

if (!existsSync(envPath)) {
  throw new Error(`Missing ${envPath}. Copy .env.example to .env first.`);
}

const current = readFileSync(envPath, "utf8");
const hasValue = (name) => new RegExp(`^${name}\\s*=\\s*([^#\\r\\n]+)`, "m").exec(current)?.[1]?.trim();
const existingRoute = hasValue(routeKey);
const existingThreshold = hasValue(thresholdKey);
const existingAttestation = hasValue(attestationKey);
if ((existingRoute && !existingThreshold) || (!existingRoute && existingThreshold)) {
  throw new Error("Refusing to repair a partially configured TSN Node key set. Review .env before rotating keys.");
}
if (existingRoute && existingThreshold && existingAttestation) {
  throw new Error("TSN Node keys are already configured. Rotate them explicitly instead.");
}

const route = existingRoute ? null : nacl.box.keyPair();
const threshold = existingThreshold ? null : nacl.sign.keyPair();
const attestation = existingAttestation ? null : nacl.sign.keyPair();
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
let updated = current;
const setValue = (text, name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
};
if (route) updated = setValue(updated, routeKey, b64(route.secretKey));
if (threshold) updated = setValue(updated, thresholdKey, b64(threshold.secretKey));
if (attestation) updated = setValue(updated, attestationKey, b64(attestation.secretKey));
writeFileSync(envPath, updated, { encoding: "utf8", mode: 0o600 });
try { chmodSync(envPath, 0o600); } catch { /* Windows ACLs provide the protection. */ }

console.log(JSON.stringify({
  status: "CREATED",
  environmentFile: "tsn-protocol/tsn-node/.env",
  generated: {
    routeDecryption: Boolean(route),
    thresholdNonceVerification: Boolean(threshold),
    routeAttestation: Boolean(attestation),
  },
  routeDecryptionPublicKeyBase64: route ? b64(route.publicKey) : null,
  thresholdNonceVerificationPublicKeyBase64: threshold ? b64(threshold.publicKey) : null,
  routeAttestationPublicKeyBase64: attestation ? b64(attestation.publicKey) : null,
  privateValuesWritten: true,
}, null, 2));
