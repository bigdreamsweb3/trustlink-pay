import { createTinCommitment } from "@trustlink/tsn-sdk";
import { createDeviceRegistrationChallenge } from "@trustlink/tsn-sdk/authorization/server";

import { storeDeviceRegistrationChallenge } from "@/app/db/tsn-privacy/device-registration-challenges";

export async function issueDeviceRegistrationChallenge(params: {
  tin: string;
  network: string;
  audience: string;
}) {
  const challenge = createDeviceRegistrationChallenge({
    tinCommitment: await createTinCommitment(params.tin),
    network: params.network,
    audience: params.audience,
  });
  await storeDeviceRegistrationChallenge(challenge);
  return challenge;
}
