/** Stable node-verification facade and production composition; implementations live in security/node-attestation. */
import { assertNodeVerificationAttestation as assertNodeVerificationAttestationComponent } from "./security/node-attestation/assert-node-verification-attestation";

const dependencies = {
  environment: process.env,
  clock: Date,
};

export const assertNodeVerificationAttestation = assertNodeVerificationAttestationComponent.bind(null, dependencies);
