/** Research-only EVM validation primitives and Node route discovery. */
import { TsnHttpClient } from "./client.js";

export type CrossChainRecipient =
  | { kind: "tin"; tinHash: `0x${string}` }
  | { kind: "wallet"; address: `0x${string}` };

export function validateCrossChainRecipient(recipient: CrossChainRecipient): CrossChainRecipient {
  if (recipient.kind === "tin") {
    assertBytes32(recipient.tinHash, "tinHash");
    return recipient;
  }
  assertEvmAddress(recipient.address, "destination wallet");
  return recipient;
}

export type VerifiedDestinationEvm = "base" | "arbitrum" | "polygon";

export interface DestinationLiquidityRoute {
  routeId: `0x${string}`;
  network: VerifiedDestinationEvm;
  sourceChainKey: bigint;
  sourceLiquidityEmitter: `0x${string}`;
  payoutVault: `0x${string}`;
  settlementToken: `0x${string}`;
  enabled: boolean;
}

export interface VerifiedDestinationLiquidity {
  routeId: `0x${string}`;
  queryId: `0x${string}`;
  availableAmount: bigint;
  sourceBlock: bigint;
  validUntil: bigint;
  nonce: bigint;
}

export function assertVerifiedDestinationLiquidity(
  route: DestinationLiquidityRoute,
  observation: VerifiedDestinationLiquidity,
  requestedAmount: bigint,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): void {
  if (!route.enabled) throw new Error("destination route is disabled");
  if (route.routeId !== observation.routeId) throw new Error("liquidity observation route mismatch");
  if (!/^0x[0-9a-fA-F]{40}$/.test(route.payoutVault)) throw new Error("invalid destination payout vault");
  if (!/^0x[0-9a-fA-F]{40}$/.test(route.settlementToken)) throw new Error("invalid destination settlement token");
  if (requestedAmount <= 0n || observation.availableAmount < requestedAmount) {
    throw new Error("verified destination liquidity is insufficient");
  }
  if (observation.validUntil <= nowSeconds) throw new Error("verified destination liquidity has expired");
}

function assertEvmAddress(value: string, field: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${field} must be a 20-byte EVM address`);
  return value as `0x${string}`;
}

function assertBytes32(value: string, field: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${field} must be bytes32`);
  return value as `0x${string}`;
}

/** Reads Node-admitted routes; route discovery does not authorize settlement. */
export class TsnCrossChainClient {
  private readonly node: TsnHttpClient;

  constructor(input: {
    nodeUrl: string;
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
  }) {
    this.node = new TsnHttpClient({
      baseUrl: input.nodeUrl.replace(/\/$/, ""),
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
    });
  }

  /** Current runtime has no enabled cross-network settlement route. */
  getSettlementNetworks(): Promise<unknown> {
    return this.node.get("/settlement-networks");
  }
}
