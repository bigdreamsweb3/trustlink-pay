import { test } from "node:test";
import { verifyPaymentSecretsAreEncryptedAndOnlyTheNodeEnvelopeCan } from "./cases/node-envelope/verify-payment-secrets-are-encrypted-and-only-the-node-envelope-can.mjs";

/** Discovery facade; fixture bodies and mutable capture contexts live in cases/node-envelope. */
test("payment secrets are encrypted and only the Node envelope can recover them", verifyPaymentSecretsAreEncryptedAndOnlyTheNodeEnvelopeCan);
