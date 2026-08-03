import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import nacl from "tweetnacl";

const envPath = resolve("tsn-protocol/tsn-node/.env");
const routeKey = "TSN_ROUTE_DECRYPTION_PRIVATE_KEY";
const thresholdKey = "TSN_THRESHOLD_NONCE_SIGNING_KEY";

if (!existsSync(envPath)) {
  throw new Error(`Missing ${envPath}. Copy .env.example to .env first.`);
}

const current = readFileSync(envPath, "utf8");
const hasValue = (name) => new RegExp(`^${name}\\s*=\\s*([^#\\r\\n]+)`, "m").exec(current)?.[1]?.trim();
if (hasValue(routeKey) || hasValue(thresholdKey)) {
  throw new Error("Refusing to overwrite an existing TSN Node key. Rotate it explicitly instead.");
}

const route = nacl.box.keyPair();
const threshold = nacl.sign.keyPair();
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
let updated = current;
const setValue = (text, name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
};
updated = setValue(updated, routeKey, b64(route.secretKey));
updated = setValue(updated, thresholdKey, b64(threshold.secretKey));
writeFileSync(envPath, updated, { encoding: "utf8", mode: 0o600 });
try { chmodSync(envPath, 0o600); } catch { /* Windows ACLs provide the protection. */ }

console.log(JSON.stringify({
  status: "CREATED",
  environmentFile: "tsn-protocol/tsn-node/.env",
  routeDecryptionPublicKeyBase64: b64(route.publicKey),
  thresholdNonceVerificationPublicKeyBase64: b64(threshold.publicKey),
  privateValuesWritten: true,
}, null, 2));
