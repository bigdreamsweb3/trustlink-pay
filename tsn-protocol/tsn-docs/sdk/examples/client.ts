import { TsnHttpClient } from "@trustlink/tsn-sdk/client";
import type { CreateIntentRequest, PublicTsnMempoolIntent } from "@trustlink/tsn-sdk/contracts";

export async function submitApprovedIntent(input: {
  nodeUrl: string;
  request: CreateIntentRequest;
  fetchImpl?: typeof fetch;
}) {
  const client = new TsnHttpClient({ baseUrl: input.nodeUrl, fetchImpl: input.fetchImpl });
  // Acceptance is returned here. Confirmed settlement requires separate evidence.
  return client.postIntent<CreateIntentRequest, PublicTsnMempoolIntent>(input.request);
}
