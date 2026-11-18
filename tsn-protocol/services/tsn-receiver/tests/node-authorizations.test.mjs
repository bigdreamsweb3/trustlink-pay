import test from "node:test";
import { verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailability } from "./cases/node-authorizations/verify-node-forwarding-distinguishes-domain-rejection-from-service-availability.mjs";

/** Discovery facade; fixture bodies and mutable capture contexts live in cases/node-authorizations. */
test("Node forwarding distinguishes domain rejection from service availability", verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailability);
