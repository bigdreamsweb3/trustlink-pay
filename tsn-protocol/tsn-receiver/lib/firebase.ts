import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizePrivateKey(raw: string) {
  let value = raw.trim();

  // Vercel's environment editor may preserve a pair of surrounding quotes
  // when a PEM is pasted as `"-----BEGIN ..."`. Remove only that outer pair;
  // never alter the key body beyond newline normalization.
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }

  // Accept both literal escape sequences (the usual `.env` form) and actual
  // Windows/Unix line endings from hosted environment-variable editors.
  value = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Operators sometimes paste the complete service-account JSON into the
  // private-key variable. Supporting that shape avoids an opaque OpenSSL
  // decoder error while still extracting only the private key field.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") {
        value = parsed.private_key
          .replace(/\\r\\n/g, "\n")
          .replace(/\\n/g, "\n")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim();
      }
    } catch {
      // Let the validation below report a safe configuration error.
    }
  }

  return value;
}

function credential() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
    : undefined;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_SERVER_CONFIG_MISSING: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY",
    );
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY_INVALID: provide the private_key PEM from the tsn-epoch-record service-account JSON",
    );
  }
  return cert({ projectId, clientEmail, privateKey });
}

const databaseURL = process.env.FIREBASE_DATABASE_URL?.trim();
export const app = getApps()[0] ?? initializeApp({
  credential: credential(),
  ...(databaseURL ? { databaseURL } : {}),
});
export const db = getFirestore(app);
export const workCollection = db.collection(process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work");
