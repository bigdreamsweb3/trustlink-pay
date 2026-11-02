import { getTsnNetworkStatus } from "@trustlink/tsn-sdk";

export async function inspectServices(input: {
  nodeUrl: string;
  receiverUrl: string;
  rpcUrl: string;
  fetchImpl?: typeof fetch;
}) {
  return getTsnNetworkStatus({
    live: { node: input.nodeUrl, receiver: input.receiverUrl, rpc: input.rpcUrl },
    timeoutMs: 2500,
    fetchImpl: input.fetchImpl,
  });
}
