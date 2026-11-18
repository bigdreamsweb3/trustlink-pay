import type { Dependencies } from "./dependencies";
import { cert } from "firebase-admin/app";
import { normalizePrivateKey } from "./normalize-private-key";

/** credential component. Inputs and results retain the original firebase contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function credential(dependencies: Pick<Dependencies, "environment">) {
  const projectId = dependencies.environment.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = dependencies.environment.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = dependencies.environment.FIREBASE_PRIVATE_KEY
    ? normalizePrivateKey(dependencies.environment.FIREBASE_PRIVATE_KEY)
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
