import { PublicKey } from "@solana/web3.js";
import type { DeviceAuthorizationClaims } from "@trustlink/tsn-sdk";
import {
  createSolanaTinsOwnerVerifier,
  verifyTsnDeviceRegistration,
  type TransientOwnerAuthorizationProof,
} from "@trustlink/tsn-sdk/authorization/server";

import { registerAuthorizedDevice } from "@/app/db/tsn-privacy/authorized-devices";
import { consumeDeviceRegistrationChallenge } from "@/app/db/tsn-privacy/device-registration-challenges";
import { getEnv } from "@/app/lib/env";
import { createSolanaConnection } from "@/app/lib/rpc";

export async function registerOwnerAuthorizedDevice(params: {
  tin: string;
  deviceId: string;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  authorization: DeviceAuthorizationClaims;
  ownerVerification: TransientOwnerAuthorizationProof;
  expectedNetwork: string;
  expectedAudience: string;
}) {
  const env = getEnv();
  const verified = await verifyTsnDeviceRegistration({
    tin: params.tin,
    deviceId: params.deviceId,
    signingPublicKey: params.signingPublicKey,
    encryptionPublicKey: params.encryptionPublicKey,
    authorization: params.authorization,
    ownerVerification: params.ownerVerification,
    expectedNetwork: params.expectedNetwork,
    expectedAudience: params.expectedAudience,
    tinsOwnerVerifier: createSolanaTinsOwnerVerifier({
      connection: createSolanaConnection({ frontendSafe: false }),
      programId: new PublicKey(env.TINS_PROGRAM_ID),
    }),
    consumeNonce: consumeDeviceRegistrationChallenge,
  });

  await registerAuthorizedDevice({
    ...verified,
    status: "active",
    expiresAt: null,
  });

  return {
    ownerVerified: true as const,
    deviceAuthorized: true as const,
  };
}
